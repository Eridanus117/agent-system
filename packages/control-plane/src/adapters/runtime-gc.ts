import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_CONTEXT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STAGING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LEASE_GRACE_MS = 60 * 1000;
export const RUNTIME_LEASE_DURATION_MS = 24 * 60 * 60 * 1000;

export type LaunchContextState = 'prepared' | 'started' | 'closed';

export interface LaunchContextLifecycle {
  readonly state: LaunchContextState;
  readonly ownerPid: number;
  readonly leaseExpiresAt: string;
}

export interface RuntimeMigrationLease {
  readonly version: 1;
  readonly processPid: number;
  readonly stagingPath: string;
  readonly createdAt: string;
}

export interface RuntimeGarbageCollectionOptions {
  readonly databasePath: string;
  readonly nowMs?: number;
  readonly contextMaxAgeMs?: number;
  readonly stagingMaxAgeMs?: number;
  readonly leaseGraceMs?: number;
  readonly isProcessAlive?: (pid: number) => boolean;
}

export interface RuntimeGarbageCollectionResult {
  readonly contextScanned: number;
  readonly contextRemoved: number;
  readonly stagingScanned: number;
  readonly stagingRemoved: number;
  readonly lockRemoved: number;
  readonly errors: number;
}

export function createLaunchContextLifecycle(state: LaunchContextState, ownerPid: number, nowMs = Date.now()): LaunchContextLifecycle {
  return { state, ownerPid, leaseExpiresAt: new Date(nowMs + RUNTIME_LEASE_DURATION_MS).toISOString() };
}

export function createRuntimeMigrationLease(stagingPath: string, now = new Date().toISOString()): RuntimeMigrationLease {
  return { version: 1, processPid: process.pid, stagingPath, createdAt: now };
}

interface LaunchContextLease {
  readonly state?: unknown;
  readonly ownerPid?: unknown;
  readonly leaseExpiresAt?: unknown;
}

interface MigrationLease {
  readonly version?: unknown;
  readonly processPid?: unknown;
  readonly stagingPath?: unknown;
  readonly createdAt?: unknown;
}

interface RuntimeFileStats {
  readonly mtimeMs: number;
}
function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLifecycle(filePath: string): LaunchContextLease | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const lifecycle = (parsed as Record<string, unknown>).lifecycle;
    if (typeof lifecycle !== 'object' || lifecycle === null) return null;
    return lifecycle as LaunchContextLease;
  } catch {
    return null;
  }
}

function readMigrationLease(filePath: string): MigrationLease | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed as MigrationLease : null;
  } catch {
    return null;
  }
}

function ageMs(filePath: string, nowMs: number): number {
  return Math.max(0, nowMs - statSync(filePath).mtimeMs);
}

function removeFile(filePath: string): void {
  rmSync(filePath, { force: true });
}

function removeStagingFamily(primaryPath: string): void {
  removeFile(primaryPath);
  removeFile(`${primaryPath}-wal`);
  removeFile(`${primaryPath}-shm`);
}

function stagingFamilyExpired(primaryPath: string, nowMs: number, maxAgeMs: number): boolean {
  for (const suffix of ['', '-wal', '-shm']) {
    const sidecar = `${primaryPath}${suffix}`;
    if (existsSync(sidecar) && ageMs(sidecar, nowMs) < maxAgeMs) return false;
  }
  return true;
}

function validPid(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function leaseExpired(expiresAt: unknown, nowMs: number, graceMs: number): boolean {
  const expiresMs = typeof expiresAt === 'string' ? Date.parse(expiresAt) : Number.NaN;
  return Number.isFinite(expiresMs) && expiresMs + graceMs <= nowMs;
}

export function collectRuntimeGarbage(options: RuntimeGarbageCollectionOptions): RuntimeGarbageCollectionResult {
  const nowMs = options.nowMs ?? Date.now();
  const contextMaxAgeMs = options.contextMaxAgeMs ?? DEFAULT_CONTEXT_MAX_AGE_MS;
  const stagingMaxAgeMs = options.stagingMaxAgeMs ?? DEFAULT_STAGING_MAX_AGE_MS;
  const leaseGraceMs = options.leaseGraceMs ?? DEFAULT_LEASE_GRACE_MS;
  const isProcessAlive = options.isProcessAlive ?? processIsAlive;
  const databasePath = path.resolve(options.databasePath);
  const directory = path.dirname(databasePath);
  const contextDirectory = path.join(directory, 'launch-context');
  const stagingPrefix = `${path.basename(databasePath)}.staging-`;
  let contextScanned = 0;
  let contextRemoved = 0;
  let stagingScanned = 0;
  let stagingRemoved = 0;
  let lockRemoved = 0;
  let errors = 0;

  if (existsSync(contextDirectory)) {
    try {
      for (const entry of readdirSync(contextDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const filePath = path.join(contextDirectory, entry.name);
        contextScanned += 1;
        try {
          const lifecycle = readLifecycle(filePath);
          if (lifecycle === null) continue;
          const age = ageMs(filePath, nowMs);
          if (age < contextMaxAgeMs) continue;
          if (lifecycle.state === 'closed') {
            removeFile(filePath);
            contextRemoved += 1;
            continue;
          }
          if (lifecycle.state !== 'started' || !validPid(lifecycle.ownerPid)) continue;
          if (!leaseExpired(lifecycle.leaseExpiresAt, nowMs, leaseGraceMs)) continue;
          if (isProcessAlive(lifecycle.ownerPid)) continue;
          removeFile(filePath);
          contextRemoved += 1;
        } catch {
          errors += 1;
        }
      }
    } catch {
      errors += 1;
    }
  }

  const lockPath = `${databasePath}.migration.lock`;
  let lockStat: RuntimeFileStats | null = null;
  let migrationLease: MigrationLease | null = null;
  const candidateStaging: string[] = [];
  try {
    if (existsSync(directory)) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.startsWith(stagingPrefix) || entry.name.endsWith('-wal') || entry.name.endsWith('-shm')) continue;
        candidateStaging.push(path.resolve(path.join(directory, entry.name)));
      }
    }
    if (existsSync(lockPath)) {
      lockStat = statSync(lockPath);
      migrationLease = readMigrationLease(lockPath);
    }
  } catch {
    errors += 1;
  }

  const lockPid = migrationLease?.processPid;
  const ownedStaging = typeof migrationLease?.stagingPath === 'string'
    ? path.resolve(migrationLease.stagingPath)
    : null;
  const ownerDead = migrationLease?.version === 1 && validPid(lockPid) && !isProcessAlive(lockPid);
  const lockExpired = lockStat !== null && ageMs(lockPath, nowMs) >= stagingMaxAgeMs;
  const canCollectStaging = ownerDead === true && lockExpired && ownedStaging !== null;

  for (const stagingPath of candidateStaging) {
    stagingScanned += 1;
    try {
      if (!canCollectStaging || stagingPath !== ownedStaging || !stagingFamilyExpired(stagingPath, nowMs, stagingMaxAgeMs)) continue;
      removeStagingFamily(stagingPath);
      stagingRemoved += 1;
    } catch {
      errors += 1;
    }
  }
  if (lockStat !== null && ownerDead === true && lockExpired) {
    try {
      removeFile(lockPath);
      lockRemoved = 1;
    } catch {
      errors += 1;
    }
  }
  return { contextScanned, contextRemoved, stagingScanned, stagingRemoved, lockRemoved, errors };
}
