import {
  parseMachineLocalRoots,
  parseMountManifest,
  type MountContractIssue,
  type MountPlanError,
  type MountPlanErrorCode,
  type MountPlanInput,
  type MountPlanKeep,
  type MountPlanResult,
  type MountPlanWrite,
  type MountSpec,
  type MountTargetState,
} from './contracts';

type UnknownRecord = Record<string, unknown>;

type PreparedMount = {
  readonly index: number;
  readonly mount: MountSpec;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sourcePresent: boolean;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function error(
  code: MountPlanErrorCode,
  path: string,
  message: string,
  mountId?: string,
): MountPlanError {
  return mountId === undefined ? { code, path, message } : { code, path, message, mountId };
}

function blocked(errors: readonly MountPlanError[], keeps: readonly MountPlanKeep[] = []): MountPlanResult {
  return { status: 'blocked', errors, writes: [], keeps };
}

function contractError(issue: MountContractIssue, domain: 'manifest' | 'roots'): MountPlanError {
  let code: MountPlanErrorCode;
  if (issue.code === 'unsupported-version') {
    code = 'unsupported-version';
  } else if (issue.code === 'unsupported-profile') {
    code = 'unsupported-profile';
  } else if (domain === 'roots') {
    code = 'unknown-root';
  } else {
    code = 'invalid-manifest';
  }
  return error(code, issue.path, issue.message);
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }
  if (value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:/.test(value) || value.includes('\\')) {
    return false;
  }
  return value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function normalizeAbsolutePath(value: string): string | undefined {
  if (!value.startsWith('/') || value.includes('\\')) {
    return undefined;
  }
  const segments: string[] = [];
  for (const segment of value.split('/')) {
    if (segment.length === 0 || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.length === 0) {
        return undefined;
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

function isWithin(parent: string, candidate: string): boolean {
  return parent === '/' || candidate === parent || candidate.startsWith(`${parent}/`);
}

function resolveChild(parent: string, relative: string): string | undefined {
  const normalizedParent = normalizeAbsolutePath(parent);
  if (normalizedParent === undefined) {
    return undefined;
  }
  const candidate = normalizeAbsolutePath(`${normalizedParent}/${relative}`);
  return candidate !== undefined && isWithin(normalizedParent, candidate) ? candidate : undefined;
}

function isAncestor(parent: string, child: string): boolean {
  return parent !== child && child.startsWith(`${parent}/`);
}

function sourceStatePresent(
  sources: UnknownRecord | undefined,
  sourcePath: string,
  mount: MountSpec,
): boolean {
  if (sources === undefined) {
    return false;
  }
  const keys = [sourcePath, mount.id, mount.source];
  for (const key of keys) {
    if (!Object.hasOwn(sources, key)) {
      continue;
    }
    const state = sources[key];
    return isRecord(state) && state.kind === 'present';
  }
  return false;
}

function targetState(
  targets: UnknownRecord | undefined,
  targetPath: string,
  relativeTarget: string,
): MountTargetState | undefined {
  if (targets === undefined) {
    return undefined;
  }
  const keys = [targetPath, relativeTarget];
  for (const key of keys) {
    if (!Object.hasOwn(targets, key)) {
      continue;
    }
    const state = targets[key];
    if (!isRecord(state)) {
      return undefined;
    }
    if (state.kind === 'missing' || state.kind === 'file' || state.kind === 'directory' || state.kind === 'other') {
      return { kind: state.kind } as MountTargetState;
    }
    if (state.kind === 'symlink' && typeof state.target === 'string') {
      return { kind: 'symlink', target: state.target };
    }
    return undefined;
  }
  return { kind: 'missing' };
}

function linkTargetMatches(linkTarget: string, targetPath: string, sourcePath: string): boolean {
  const normalizedSource = normalizeAbsolutePath(sourcePath);
  const normalizedTarget = normalizeAbsolutePath(targetPath);
  if (normalizedSource === undefined || normalizedTarget === undefined || linkTarget.length === 0) {
    return false;
  }
  if (linkTarget.startsWith('/')) {
    return normalizeAbsolutePath(linkTarget) === normalizedSource;
  }
  if (linkTarget.startsWith('\\') || /^[A-Za-z]:/.test(linkTarget) || linkTarget.includes('\\')) {
    return false;
  }
  const separator = normalizedTarget.lastIndexOf('/');
  const parent = separator <= 0 ? '/' : normalizedTarget.slice(0, separator);
  return normalizeAbsolutePath(`${parent}/${linkTarget}`) === normalizedSource;
}



export function createMountPlan(input: MountPlanInput): MountPlanResult {
  const rawInput: unknown = input;
  if (!isRecord(rawInput)) {
    return blocked([error('invalid-manifest', '$', 'mount plan input must be an object')]);
  }

  const parsedManifest = parseMountManifest(rawInput.manifest);
  if (!parsedManifest.ok) {
    return blocked(parsedManifest.errors.map((entry) => contractError(entry, 'manifest')));
  }
  const parsedRoots = parseMachineLocalRoots(rawInput.roots);
  if (!parsedRoots.ok) {
    return blocked(parsedRoots.errors.map((entry) => contractError(entry, 'roots')));
  }

  const errors: MountPlanError[] = [];
  const rawSources = isRecord(rawInput.sources) ? rawInput.sources : undefined;
  const rawTargets = isRecord(rawInput.targets) ? rawInput.targets : undefined;
  if (rawSources === undefined) {
    errors.push(error('invalid-manifest', '$.sources', 'sources must be an object map'));
  }
  if (rawTargets === undefined) {
    errors.push(error('unsafe-target-path', '$.targets', 'targets must be an object map'));
  }

  const checkoutRoot = typeof rawInput.checkoutRoot === 'string'
    ? normalizeAbsolutePath(rawInput.checkoutRoot)
    : undefined;
  if (checkoutRoot === undefined) {
    errors.push(error('target-outside-checkout', '$.checkoutRoot', 'checkout root must be an absolute path'));
  }

  const prepared: PreparedMount[] = [];
  for (let index = 0; index < parsedManifest.value.mounts.length; index += 1) {
    const mount = parsedManifest.value.mounts[index];
    if (mount === undefined) {
      continue;
    }
    const mountPath = `$.mounts[${index}]`;
    const root = parsedRoots.value.roots[mount.rootId];
    let sourcePath: string | undefined;
    let targetPath: string | undefined;

    if (root === undefined) {
      errors.push(error('unknown-root', `${mountPath}.rootId`, 'root alias is not configured', mount.id));
    } else if (!isSafeRelativePath(mount.source)) {
      errors.push(error('unsafe-source-path', `${mountPath}.source`, 'source must be a safe relative path', mount.id));
    } else {
      sourcePath = resolveChild(root.path, mount.source);
      if (sourcePath === undefined) {
        errors.push(error('source-outside-root', `${mountPath}.source`, 'source resolves outside its configured root', mount.id));
      }
    }

    if (!isSafeRelativePath(mount.target)) {
      errors.push(error('unsafe-target-path', `${mountPath}.target`, 'target must be a safe relative path', mount.id));
    } else if (checkoutRoot !== undefined) {
      targetPath = resolveChild(checkoutRoot, mount.target);
      if (targetPath === undefined) {
        errors.push(error('target-outside-checkout', `${mountPath}.target`, 'target resolves outside the checkout', mount.id));
      }
    }

    if (sourcePath !== undefined && targetPath !== undefined) {
      prepared.push({
        index,
        mount,
        sourcePath,
        targetPath,
        sourcePresent: sourceStatePresent(rawSources, sourcePath, mount),
      });
    }
  }

  const seenTargets = new Map<string, PreparedMount>();
  for (const current of prepared) {
    const prior = seenTargets.get(current.targetPath);
    if (prior !== undefined) {
      errors.push(error(
        'duplicate-target',
        `$.mounts[${current.index}].target`,
        `target duplicates mount ${prior.mount.id}`,
        current.mount.id,
      ));
    } else {
      seenTargets.set(current.targetPath, current);
    }
    for (const other of prepared) {
      if (other.index >= current.index || other.targetPath === current.targetPath) {
        continue;
      }
      if (isAncestor(other.targetPath, current.targetPath) || isAncestor(current.targetPath, other.targetPath)) {
        errors.push(error(
          'ancestor-target-overlap',
          `$.mounts[${current.index}].target`,
          `target overlaps mount ${other.mount.id}`,
          current.mount.id,
        ));
        break;
      }
    }
  }

  const writes: MountPlanWrite[] = [];
  const keeps: MountPlanKeep[] = [];
  for (const current of prepared) {
    if (!current.sourcePresent) {
      if (current.mount.required) {
        errors.push(error(
          'missing-required-source',
          `$.mounts[${current.index}].source`,
          'required source is not available',
          current.mount.id,
        ));
      }
      continue;
    }

    const state = targetState(rawTargets, current.targetPath, current.mount.target);
    if (state === undefined) {
      errors.push(error(
        'target-occupied',
        `$.mounts[${current.index}].target`,
        'target state is invalid or unverified',
        current.mount.id,
      ));
      continue;
    }
    if (state.kind === 'missing') {
      writes.push({
        mountId: current.mount.id,
        sourcePath: current.sourcePath,
        targetPath: current.targetPath,
        expectedType: current.mount.expectedType,
        readonly: current.mount.readonly,
      });
      continue;
    }
    if (state.kind === 'symlink') {
      if (linkTargetMatches(state.target, current.targetPath, current.sourcePath)) {
        keeps.push({
          mountId: current.mount.id,
          sourcePath: current.sourcePath,
          targetPath: current.targetPath,
          expectedType: current.mount.expectedType,
        });
      } else {
        errors.push(error(
          'wrong-symlink-target',
          `$.mounts[${current.index}].target`,
          `symlink target must resolve to ${current.sourcePath}`,
          current.mount.id,
        ));
      }
      continue;
    }
    errors.push(error(
      'target-occupied',
      `$.mounts[${current.index}].target`,
      `target is occupied by a ${state.kind}`,
      current.mount.id,
    ));
  }

  if (errors.length > 0) {
    return blocked(errors, keeps);
  }
  return { status: 'ready', errors: [], writes, keeps };
}
