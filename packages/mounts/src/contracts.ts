export const MOUNT_MANIFEST_VERSION = 1 as const;
export const MACHINE_LOCAL_ROOTS_VERSION = 1 as const;
export const PRIVATE_LOCAL_PROFILE = 'private-local' as const;

export type MountManifestVersion = typeof MOUNT_MANIFEST_VERSION;
export type MachineLocalRootsVersion = typeof MACHINE_LOCAL_ROOTS_VERSION;
export type MountProfile = typeof PRIVATE_LOCAL_PROFILE;
export type MountExpectedType = 'file' | 'directory';
export type MountTrustDomain = 'private-local';

export interface MountSpec {
  readonly id: string;
  readonly rootId: string;
  readonly source: string;
  readonly target: string;
  readonly expectedType: MountExpectedType;
  readonly required: boolean;
  readonly readonly: boolean;
}

export interface MountManifest {
  readonly version: MountManifestVersion;
  readonly profile: MountProfile;
  readonly mounts: readonly MountSpec[];
}

export interface MachineLocalRoot {
  readonly path: string;
  readonly trustDomain: MountTrustDomain;
}

export interface MachineLocalRoots {
  readonly version: MachineLocalRootsVersion;
  readonly roots: Readonly<Record<string, MachineLocalRoot>>;
}

export type MountTargetState =
  | { readonly kind: 'missing' }
  | { readonly kind: 'symlink'; readonly target: string }
  | { readonly kind: 'file' | 'directory' | 'other' };

export interface MountPlanInput {
  readonly manifest: MountManifest;
  readonly roots: MachineLocalRoots;
  readonly checkoutRoot: string;
  readonly targets: Readonly<Record<string, MountTargetState>>;
}

export type MountPlanErrorCode =
  | 'invalid-manifest'
  | 'unsupported-version'
  | 'unsupported-profile'
  | 'unknown-root'
  | 'unsafe-source-path'
  | 'unsafe-target-path'
  | 'source-outside-root'
  | 'target-outside-checkout'
  | 'duplicate-target'
  | 'ancestor-target-overlap'
  | 'missing-required-source'
  | 'target-occupied'
  | 'wrong-symlink-target';

export interface MountPlanError {
  readonly code: MountPlanErrorCode;
  readonly path: string;
  readonly message: string;
  readonly mountId?: string;
}

export interface MountPlanWrite {
  readonly mountId: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly expectedType: MountExpectedType;
  readonly readonly: boolean;
}

export interface MountPlanKeep {
  readonly mountId: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly expectedType: MountExpectedType;
}

export interface MountPlanReady {
  readonly status: 'ready';
  readonly errors: readonly [];
  readonly writes: readonly MountPlanWrite[];
  readonly keeps: readonly MountPlanKeep[];
}

export interface MountPlanBlocked {
  readonly status: 'blocked';
  readonly errors: readonly MountPlanError[];
  readonly writes: readonly [];
  readonly keeps: readonly MountPlanKeep[];
}

export type MountPlanResult = MountPlanReady | MountPlanBlocked;

export interface MountContractIssue {
  readonly code:
    | 'invalid-shape'
    | 'unknown-field'
    | 'unsupported-version'
    | 'unsupported-profile'
    | 'invalid-value'
    | 'duplicate-id';
  readonly path: string;
  readonly message: string;
}

export type MountParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly MountContractIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(value, key);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function issue(
  code: MountContractIssue['code'],
  path: string,
  message: string,
): MountContractIssue {
  return { code, path, message };
}

function parseMountSpec(value: unknown, index: number): MountParseResult<MountSpec> {
  const path = `mounts[${index}]`;
  if (!isRecord(value)) {
    return { ok: false, errors: [issue('invalid-shape', path, 'mount must be an object')] };
  }

  const allowed = ['id', 'rootId', 'source', 'target', 'expectedType', 'required', 'readonly'] as const;
  const errors: MountContractIssue[] = [];
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key as (typeof allowed)[number])) {
      errors.push(issue('unknown-field', `${path}.${key}`, 'unknown mount field'));
    }
  }

  const stringFields = ['id', 'rootId', 'source', 'target'] as const;
  for (const field of stringFields) {
    if (!hasOwn(value, field) || !nonEmptyString(value[field])) {
      errors.push(issue('invalid-value', `${path}.${field}`, `${field} must be a non-empty string`));
    }
  }
  if (value.expectedType !== 'file' && value.expectedType !== 'directory') {
    errors.push(issue('invalid-value', `${path}.expectedType`, 'expectedType must be file or directory'));
  }
  for (const field of ['required', 'readonly'] as const) {
    if (typeof value[field] !== 'boolean') {
      errors.push(issue('invalid-value', `${path}.${field}`, `${field} must be boolean`));
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      id: value.id as string,
      rootId: value.rootId as string,
      source: value.source as string,
      target: value.target as string,
      expectedType: value.expectedType as MountExpectedType,
      required: value.required as boolean,
      readonly: value.readonly as boolean,
    },
  };
}

export function parseMountManifest(value: unknown): MountParseResult<MountManifest> {
  if (!isRecord(value)) {
    return { ok: false, errors: [issue('invalid-shape', '$', 'manifest must be an object')] };
  }

  const allowed = ['version', 'profile', 'mounts'] as const;
  const errors: MountContractIssue[] = [];
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key as (typeof allowed)[number])) {
      errors.push(issue('unknown-field', `$.${key}`, 'unknown manifest field'));
    }
  }
  if (value.version !== MOUNT_MANIFEST_VERSION) {
    errors.push(issue('unsupported-version', '$.version', 'unsupported manifest version'));
  }
  if (value.profile !== PRIVATE_LOCAL_PROFILE) {
    errors.push(issue('unsupported-profile', '$.profile', 'unsupported mount profile'));
  }
  const rawMounts = Array.isArray(value.mounts) ? value.mounts as readonly unknown[] : undefined;
  if (rawMounts === undefined) {
    errors.push(issue('invalid-shape', '$.mounts', 'mounts must be an array'));
    return { ok: false, errors };
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const mounts: MountSpec[] = [];
  const seenIds = new Set<string>();
  for (let index = 0; index < rawMounts.length; index += 1) {
    const parsed = parseMountSpec(rawMounts[index], index);
    if (!parsed.ok) {
      errors.push(...parsed.errors);
      continue;
    }
    if (seenIds.has(parsed.value.id)) {
      errors.push(issue('duplicate-id', `mounts[${index}].id`, 'mount id must be unique'));
      continue;
    }
    seenIds.add(parsed.value.id);
    mounts.push(parsed.value);
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: { version: MOUNT_MANIFEST_VERSION, profile: PRIVATE_LOCAL_PROFILE, mounts } };
}

function parseRoot(value: unknown, rootId: string): MountParseResult<MachineLocalRoot> {
  const path = `$.roots.${rootId}`;
  if (!isRecord(value)) {
    return { ok: false, errors: [issue('invalid-shape', path, 'root must be an object')] };
  }
  const allowed = ['path', 'trustDomain'] as const;
  const errors: MountContractIssue[] = [];
  if (!hasOnlyKeys(value, allowed)) {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key as (typeof allowed)[number])) {
        errors.push(issue('unknown-field', `${path}.${key}`, 'unknown root field'));
      }
    }
  }
  if (!nonEmptyString(value.path)) {
    errors.push(issue('invalid-value', `${path}.path`, 'root path must be a non-empty string'));
  }
  if (value.trustDomain !== PRIVATE_LOCAL_PROFILE) {
    errors.push(issue('invalid-value', `${path}.trustDomain`, 'unsupported root trust domain'));
  }
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: { path: value.path as string, trustDomain: PRIVATE_LOCAL_PROFILE } };
}

export function parseMachineLocalRoots(value: unknown): MountParseResult<MachineLocalRoots> {
  if (!isRecord(value)) {
    return { ok: false, errors: [issue('invalid-shape', '$', 'roots must be an object')] };
  }

  const allowed = ['version', 'roots'] as const;
  const errors: MountContractIssue[] = [];
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key as (typeof allowed)[number])) {
      errors.push(issue('unknown-field', `$.${key}`, 'unknown roots field'));
    }
  }
  if (value.version !== MACHINE_LOCAL_ROOTS_VERSION) {
    errors.push(issue('unsupported-version', '$.version', 'unsupported roots version'));
  }
  const rawRoots = isRecord(value.roots) ? value.roots : undefined;
  if (rawRoots === undefined) {
    errors.push(issue('invalid-shape', '$.roots', 'roots must be an object map'));
    return { ok: false, errors };
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const roots: Record<string, MachineLocalRoot> = {};
  for (const [rootId, rootValue] of Object.entries(rawRoots)) {
    const parsed = parseRoot(rootValue, rootId);
    if (!parsed.ok) {
      errors.push(...parsed.errors);
      continue;
    }
    roots[rootId] = parsed.value;
  }
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: { version: MACHINE_LOCAL_ROOTS_VERSION, roots } };
}

const MOUNT_PLAN_ERROR_CODES: readonly MountPlanErrorCode[] = [
  'invalid-manifest',
  'unsupported-version',
  'unsupported-profile',
  'unknown-root',
  'unsafe-source-path',
  'unsafe-target-path',
  'source-outside-root',
  'target-outside-checkout',
  'duplicate-target',
  'ancestor-target-overlap',
  'missing-required-source',
  'target-occupied',
  'wrong-symlink-target',
];

function isMountPlanErrorCode(value: unknown): value is MountPlanErrorCode {
  return typeof value === 'string' && MOUNT_PLAN_ERROR_CODES.includes(value as MountPlanErrorCode);
}

function validatePlanError(value: unknown, index: number): MountContractIssue[] {
  const path = `$.errors[${index}]`;
  if (!isRecord(value)) {
    return [issue('invalid-shape', path, 'plan error must be an object')];
  }
  const errors: MountContractIssue[] = [];
  if (!hasOnlyKeys(value, ['code', 'path', 'message', 'mountId'])) {
    for (const key of Object.keys(value)) {
      if (!['code', 'path', 'message', 'mountId'].includes(key)) {
        errors.push(issue('unknown-field', `${path}.${key}`, 'unknown plan error field'));
      }
    }
  }
  if (!isMountPlanErrorCode(value.code)) {
    errors.push(issue('invalid-value', `${path}.code`, 'unknown plan error code'));
  }
  for (const field of ['path', 'message'] as const) {
    if (!nonEmptyString(value[field])) {
      errors.push(issue('invalid-value', `${path}.${field}`, `${field} must be a non-empty string`));
    }
  }
  if (hasOwn(value, 'mountId') && !nonEmptyString(value.mountId)) {
    errors.push(issue('invalid-value', `${path}.mountId`, 'mountId must be a non-empty string when present'));
  }
  return errors;
}

function validatePlanEntry(
  value: unknown,
  index: number,
  field: 'writes' | 'keeps',
): MountContractIssue[] {
  const path = `$.${field}[${index}]`;
  if (!isRecord(value)) {
    return [issue('invalid-shape', path, `${field} entry must be an object`)];
  }
  const allowed = field === 'writes'
    ? ['mountId', 'sourcePath', 'targetPath', 'expectedType', 'readonly']
    : ['mountId', 'sourcePath', 'targetPath', 'expectedType'];
  const errors: MountContractIssue[] = [];
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push(issue('unknown-field', `${path}.${key}`, `unknown ${field} field`));
    }
  }
  for (const name of ['mountId', 'sourcePath', 'targetPath'] as const) {
    if (!nonEmptyString(value[name])) {
      errors.push(issue('invalid-value', `${path}.${name}`, `${name} must be a non-empty string`));
    }
  }
  if (value.expectedType !== 'file' && value.expectedType !== 'directory') {
    errors.push(issue('invalid-value', `${path}.expectedType`, 'expectedType must be file or directory'));
  }
  if (field === 'writes' && typeof value.readonly !== 'boolean') {
    errors.push(issue('invalid-value', `${path}.readonly`, 'readonly must be boolean'));
  }
  return errors;
}

export function validateMountPlanResult(value: unknown): MountParseResult<MountPlanResult> {
  if (!isRecord(value) || (value.status !== 'ready' && value.status !== 'blocked')) {
    return { ok: false, errors: [issue('invalid-shape', '$', 'plan result must have ready or blocked status')] };
  }
  const rawErrors = value.errors;
  const rawWrites = value.writes;
  const rawKeeps = value.keeps;
  if (!Array.isArray(rawErrors) || !Array.isArray(rawWrites) || !Array.isArray(rawKeeps)) {
    return { ok: false, errors: [issue('invalid-shape', '$', 'plan result arrays are required')] };
  }
  const errors: MountContractIssue[] = [];
  for (let index = 0; index < rawErrors.length; index += 1) {
    errors.push(...validatePlanError(rawErrors[index], index));
  }
  for (let index = 0; index < rawWrites.length; index += 1) {
    errors.push(...validatePlanEntry(rawWrites[index], index, 'writes'));
  }
  for (let index = 0; index < rawKeeps.length; index += 1) {
    errors.push(...validatePlanEntry(rawKeeps[index], index, 'keeps'));
  }
  if (value.status === 'blocked' && rawWrites.length !== 0) {
    errors.push(issue('invalid-value', '$.writes', 'blocked plan must not contain writes'));
  }
  if (value.status === 'blocked' && rawErrors.length === 0) {
    errors.push(issue('invalid-value', '$.errors', 'blocked plan must contain errors'));
  }
  if (value.status === 'ready' && rawErrors.length !== 0) {
    errors.push(issue('invalid-value', '$.errors', 'ready plan must not contain errors'));
  }
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: value as unknown as MountPlanResult };
}

export function isMountPlanResult(value: unknown): value is MountPlanResult {
  return validateMountPlanResult(value).ok;
}
