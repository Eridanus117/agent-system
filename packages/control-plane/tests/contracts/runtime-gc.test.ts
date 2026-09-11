import { describe, expect, test } from 'bun:test';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, mkdtempSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectRuntimeGarbage, createRuntimeMigrationLease } from '../../src/adapters/runtime-gc';

function olden(filePath: string, nowMs: number, ageMs: number): void {
  const seconds = (nowMs - ageMs) / 1000;
  utimesSync(filePath, seconds, seconds);
}

describe('runtime garbage collection', () => {
  test('migration lease records the exact staging owner and path', () => {
    const stagingPath = 'synthetic/control-plane.sqlite3.staging-owner';
    const lease = createRuntimeMigrationLease(stagingPath, '2026-09-10T10:00:00.000Z');
    expect(lease).toEqual({
      version: 1,
      processPid: process.pid,
      stagingPath,
      createdAt: '2026-09-10T10:00:00.000Z',
    });
  });
  test('removes expired started contexts while retaining active and legacy contexts', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agent-system-runtime-gc-'));
    const databasePath = path.join(root, 'control-plane.sqlite3');
    const contextDir = path.join(root, 'launch-context');
    const nowMs = Date.parse('2026-09-10T12:00:00.000Z');
    try {
      await mkdir(contextDir, { recursive: true });
      const expiredContext = path.join(contextDir, 'expired.json');
      const activeContext = path.join(contextDir, 'active.json');
      const legacyContext = path.join(contextDir, 'legacy.json');
      const closedActiveContext = path.join(contextDir, 'closed-active.json');
      await writeFile(expiredContext, JSON.stringify({
        version: 1,
        operationId: 'op-expired',
        lifecycle: { state: 'started', ownerPid: 101, leaseExpiresAt: '2026-09-10T10:00:00.000Z' },
      }));
      await writeFile(activeContext, JSON.stringify({
        version: 1,
        operationId: 'op-active',
        lifecycle: { state: 'started', ownerPid: 202, leaseExpiresAt: '2026-09-10T10:00:00.000Z' },
      }));
      await writeFile(closedActiveContext, JSON.stringify({
        version: 1,
        operationId: 'op-closed-active',
        lifecycle: { state: 'closed', ownerPid: 202, leaseExpiresAt: '2026-09-10T10:00:00.000Z' },
      }));
      await writeFile(legacyContext, JSON.stringify({ version: 1, operationId: 'op-legacy' }));
      olden(expiredContext, nowMs, 3_600_000);
      olden(activeContext, nowMs, 3_600_000);
      olden(closedActiveContext, nowMs, 3_600_000);
      olden(legacyContext, nowMs, 3_600_000);

      const staleStaging = `${databasePath}.staging-unowned`;
      const activeStaging = `${databasePath}.staging-active`;
      await writeFile(staleStaging, 'stale');
      await writeFile(activeStaging, 'active');
      olden(staleStaging, nowMs, 3_600_000);
      olden(activeStaging, nowMs, 3_600_000);
      const lockPath = `${databasePath}.migration.lock`;
      await writeFile(lockPath, JSON.stringify({ version: 1, processPid: 202, stagingPath: activeStaging, createdAt: '2026-09-10T10:00:00.000Z' }));
      olden(lockPath, nowMs, 3_600_000);

      const result = collectRuntimeGarbage({
        databasePath,
        nowMs,
        contextMaxAgeMs: 1_000,
        stagingMaxAgeMs: 1_000,
        leaseGraceMs: 0,
        isProcessAlive: (pid) => pid === 202,
      });

      expect(result.contextRemoved).toBe(1);
      expect(result.stagingRemoved).toBe(0);
      expect(existsSync(expiredContext)).toBe(false);
      expect(existsSync(activeContext)).toBe(true);
      expect(existsSync(legacyContext)).toBe(true);
      expect(existsSync(staleStaging)).toBe(true);
      expect(existsSync(activeStaging)).toBe(true);
      expect(existsSync(closedActiveContext)).toBe(true);
      expect(existsSync(lockPath)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('removes only staging owned by an expired dead migration owner', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agent-system-runtime-gc-'));
    const databasePath = path.join(root, 'control-plane.sqlite3');
    const nowMs = Date.parse('2026-09-10T12:00:00.000Z');
    try {
      const staging = `${databasePath}.staging-orphan`;
      const wal = `${staging}-wal`;
      const lock = `${databasePath}.migration.lock`;
      const unrelated = `${databasePath}.staging-unowned`;
      await writeFile(staging, 'orphan');
      await writeFile(wal, 'orphan-wal');
      await writeFile(unrelated, 'unrelated');
      await writeFile(lock, JSON.stringify({ version: 1, processPid: 303, stagingPath: staging, createdAt: '2026-09-10T10:00:00.000Z' }));
      olden(staging, nowMs, 3_600_000);
      olden(wal, nowMs, 3_600_000);
      olden(unrelated, nowMs, 3_600_000);
      olden(lock, nowMs, 3_600_000);

      const result = collectRuntimeGarbage({
        databasePath,
        nowMs,
        stagingMaxAgeMs: 1_000,
        isProcessAlive: () => false,
      });

      expect(result.stagingRemoved).toBe(1);
      expect(result.lockRemoved).toBe(1);
      expect(existsSync(staging)).toBe(false);
      expect(existsSync(wal)).toBe(false);
      expect(existsSync(lock)).toBe(false);
      expect(existsSync(unrelated)).toBe(true);
      expect((await readdir(root)).filter((entry) => entry.includes('.staging-'))).toEqual([path.basename(unrelated)]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
