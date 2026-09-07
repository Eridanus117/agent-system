import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

import { createMountPlan } from './mount-plan';
import {
  parseMachineLocalRoots,
  parseMountManifest,
  type MachineLocalRoots,
  type MountPlanError,
  type MountPlanInput,
  type MountPlanResult,
  type MountSourceState,
  type MountTargetState,
} from './contracts';

export interface MountLifecycleConfig {
  readonly manifestPath: string;
  readonly rootsPath: string;
  readonly checkoutRoot: string;
}

export interface MountLifecycleOutcome {
  readonly status: 'synced' | 'blocked' | 'unavailable';
  readonly plan: MountPlanResult;
  readonly created: readonly string[];
  readonly message: string;
}

export interface MountInitConfig {
  readonly manifestPath: string;
  readonly rootsPath: string;
}

export interface MountInitResult {
  readonly created: readonly string[];
  readonly kept: readonly string[];
}

type LoadedInput =
  | { readonly ok: true; readonly input: MountPlanInput }
  | { readonly ok: false; readonly plan: MountPlanResult };

function lifecycleError(code: MountPlanError['code'], path: string, message: string): MountPlanError {
  return { code, path, message };
}

function blocked(planErrors: readonly MountPlanError[]): MountPlanResult {
  return { status: 'blocked', errors: planErrors, writes: [], keeps: [] };
}


function parseJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function sourcePath(roots: MachineLocalRoots, mountRootId: string, source: string): string | undefined {
  const root = roots.roots[mountRootId];
  return root === undefined ? undefined : resolve(root.path, source);
}

function targetState(path: string): MountTargetState {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return { kind: 'symlink', target: readlinkSync(path) };
    if (stat.isFile()) return { kind: 'file' };
    if (stat.isDirectory()) return { kind: 'directory' };
    return { kind: 'other' };
  } catch {
    return { kind: 'missing' };
  }
}

function isExpectedSymlink(path: string, source: string): boolean {
  const state = targetState(path);
  return state.kind === 'symlink' && resolve(dirname(path), state.target) === resolve(source);
}

function sourceState(path: string): MountSourceState {
  try {
    lstatSync(path);
    return { kind: 'present' };
  } catch {
    return { kind: 'missing' };
  }
}

function loadInput(config: MountLifecycleConfig): LoadedInput {
  let rawManifest: unknown;
  let rawRoots: unknown;
  try {
    rawManifest = parseJsonFile(config.manifestPath);
  } catch {
    return { ok: false, plan: blocked([lifecycleError('invalid-manifest', config.manifestPath, 'manifest could not be read')]) };
  }
  try {
    rawRoots = parseJsonFile(config.rootsPath);
  } catch {
    return { ok: false, plan: blocked([lifecycleError('unknown-root', config.rootsPath, 'machine-local roots could not be read')]) };
  }

  const manifest = parseMountManifest(rawManifest);
  if (!manifest.ok) {
    return { ok: false, plan: blocked(manifest.errors.map((entry) => lifecycleError(
      entry.code === 'unsupported-version' ? 'unsupported-version' : entry.code === 'unsupported-profile' ? 'unsupported-profile' : 'invalid-manifest',
      entry.path,
      entry.message,
    ))) };
  }
  const roots = parseMachineLocalRoots(rawRoots);
  if (!roots.ok) {
    return { ok: false, plan: blocked(roots.errors.map((entry) => lifecycleError(
      entry.code === 'unsupported-version' ? 'unsupported-version' : 'unknown-root',
      entry.path,
      entry.message,
    ))) };
  }

  const sources: Record<string, MountSourceState> = {};
  const targets: Record<string, MountTargetState> = {};
  for (const mount of manifest.value.mounts) {
    const source = sourcePath(roots.value, mount.rootId, mount.source);
    if (source !== undefined) sources[source] = sourceState(source);
    const target = resolve(config.checkoutRoot, mount.target);
    targets[target] = targetState(target);
  }
  return {
    ok: true,
    input: {
      manifest: manifest.value,
      roots: roots.value,
      checkoutRoot: config.checkoutRoot,
      sources,
      targets,
    },
  };
}

export function planMounts(config: MountLifecycleConfig): MountPlanResult {
  const loaded = loadInput(config);
  return loaded.ok ? createMountPlan(loaded.input) : loaded.plan;
}

function ensureParentDirectory(path: string, createdDirectories: string[]): void {
  const missing: string[] = [];
  let current = dirname(path);
  while (!existsSync(current)) {
    missing.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  mkdirSync(dirname(path), { recursive: true });
  createdDirectories.push(...missing);
}

function rollback(createdLinks: readonly string[], createdDirectories: readonly string[]): void {
  for (const path of [...createdLinks].reverse()) {
    try { unlinkSync(path); } catch { /* 回滚尽力而为，保留原始失败结果。 */ }
  }
  for (const path of [...createdDirectories].reverse()) {
    try { rmdirSync(path); } catch { /* 非空目录或并发对象不应被删除。 */ }
  }
}

function applyPlan(plan: MountPlanResult): MountLifecycleOutcome {
  if (plan.status === 'blocked') {
    return { status: 'blocked', plan, created: [], message: 'private overlay unavailable' };
  }
  const createdLinks: string[] = [];
  const createdDirectories: string[] = [];
  try {
    for (const write of plan.writes) {
      ensureParentDirectory(write.targetPath, createdDirectories);
      symlinkSync(write.sourcePath, write.targetPath, write.expectedType === 'directory' ? 'dir' : 'file');
      createdLinks.push(write.targetPath);
    }
    return { status: 'synced', plan, created: createdLinks, message: 'private overlay synced' };
  } catch (error) {
    rollback(createdLinks, createdDirectories);
    const message = error instanceof Error ? error.message : 'mount write failed';
    const failure = blocked([lifecycleError('target-occupied', '$.writes', message)]);
    return { status: 'blocked', plan: failure, created: [], message: 'private overlay unavailable' };
  }
}

export function syncMounts(config: MountLifecycleConfig): MountLifecycleOutcome {
  const loaded = loadInput(config);
  return loaded.ok ? applyPlan(createMountPlan(loaded.input)) : {
    status: 'unavailable',
    plan: loaded.plan,
    created: [],
    message: 'private overlay unavailable',
  };
}

export function repairMounts(config: MountLifecycleConfig): MountLifecycleOutcome {
  const loaded = loadInput(config);
  if (!loaded.ok) {
    return { status: 'unavailable', plan: loaded.plan, created: [], message: 'private overlay unavailable' };
  }
  const plan = createMountPlan(loaded.input);
  if (plan.status === 'ready') return applyPlan(plan);

  for (const mount of loaded.input.manifest.mounts) {
    const source = sourcePath(loaded.input.roots, mount.rootId, mount.source);
    const target = resolve(loaded.input.checkoutRoot, mount.target);
    if (source === undefined || isExpectedSymlink(target, source)) continue;
    if (targetState(target).kind !== 'symlink') continue;
    try { unlinkSync(target); } catch { return applyPlan(plan); }
  }
  const repaired = loadInput(config);
  return repaired.ok ? applyPlan(createMountPlan(repaired.input)) : {
    status: 'unavailable',
    plan: repaired.plan,
    created: [],
    message: 'private overlay unavailable',
  };
}

export function doctorMounts(config: MountLifecycleConfig): MountLifecycleOutcome {
  const plan = planMounts(config);
  return plan.status === 'ready'
    ? { status: 'synced', plan, created: [], message: 'private overlay healthy' }
    : { status: 'unavailable', plan, created: [], message: 'private overlay unavailable' };
}

export function initMountFiles(config: MountInitConfig): MountInitResult {
  const created: string[] = [];
  const kept: string[] = [];
  const files: readonly [string, string][] = [
    [config.manifestPath, JSON.stringify({ version: 1, profile: 'private-local', mounts: [] }, null, 2) + '\n'],
    [config.rootsPath, JSON.stringify({ version: 1, roots: {} }, null, 2) + '\n'],
  ];
  for (const [path, contents] of files) {
    if (existsSync(path)) {
      kept.push(path);
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, { encoding: 'utf8', flag: 'wx' });
    created.push(path);
  }
  return { created, kept };
}

