export const DEFAULT_PUBLIC_TREE_MAX_FILE_BYTES = 1_048_576 as const;

export type PublicTreeContent = string | Uint8Array | readonly number[];

export interface PublicTreeArchive {
  readonly format?: string;
  readonly bytes?: PublicTreeContent;
  readonly entries?: readonly PublicTreeEntry[];
}

export interface PublicTreeFileEntry {
  readonly path: string;
  readonly kind: 'file';
  readonly content?: PublicTreeContent;
  readonly size?: number;
  readonly archive?: PublicTreeArchive;
}

export interface PublicTreeDirectoryEntry {
  readonly path: string;
  readonly kind: 'directory';
}

export interface PublicTreeSymlinkEntry {
  readonly path: string;
  readonly kind: 'symlink';
  readonly target: string;
}

export interface PublicTreeArchiveEntry {
  readonly path: string;
  readonly kind: 'archive';
  readonly size?: number;
  readonly archive: PublicTreeArchive;
}

export interface PublicTreeOtherEntry {
  readonly path: string;
  readonly kind: 'other';
}

export type PublicTreeEntry =
  | PublicTreeFileEntry
  | PublicTreeDirectoryEntry
  | PublicTreeSymlinkEntry
  | PublicTreeArchiveEntry
  | PublicTreeOtherEntry;

export interface PublicTreeAssessmentInput {
  readonly entries: readonly PublicTreeEntry[];
  readonly allowlist: readonly string[];
  readonly denylist?: readonly string[];
  readonly maxFileBytes?: number;
}

export type PublicTreeViolationCode =
  | 'invalid-input'
  | 'invalid-policy'
  | 'path-not-allowlisted'
  | 'denylisted-path'
  | 'outside-tree'
  | 'absolute-path'
  | 'local-path'
  | 'unsafe-path'
  | 'symlink'
  | 'unknown-entry'
  | 'scan-failed'
  | 'business-identifier'
  | 'internal-address'
  | 'credential'
  | 'runtime-data'
  | 'large-file'
  | 'archive-scan-failed';

export interface PublicTreeViolation {
  readonly code: PublicTreeViolationCode;
  readonly path: string;
  readonly message: string;
}

export interface PublicTreeAssessmentAllowed {
  readonly status: 'allowed';
  readonly violations: readonly [];
}

export interface PublicTreeAssessmentBlocked {
  readonly status: 'blocked';
  readonly violations: readonly PublicTreeViolation[];
}

export type PublicTreeAssessmentResult = PublicTreeAssessmentAllowed | PublicTreeAssessmentBlocked;

type RecordValue = Record<string, unknown>;
type NormalizedPathResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly code: Extract<PublicTreeViolationCode, 'outside-tree' | 'absolute-path' | 'local-path' | 'unsafe-path'> };
type ContentInspection = { readonly bytes: number; readonly text: string };

const DEFAULT_DENYLIST: readonly string[] = [
  '.env',
  '.env.*',
  '**/.env',
  '**/.env.*',
  '.git/**',
  '**/.git/**',
  '.omp/local/**',
  '**/.omp/local/**',
  '**/.ssh/**',
  '**/*.pem',
  '**/*.key',
  '**/*credential*',
  '**/*secret*',
  '**/*password*',
  '**/*token*',
  '**/*runtime*',
  '**/*session*',
  '**/*transcript*',
  '**/*.log',
  '**/*.pid',
  '**/*.sock',
  '**/*.lock',
  '**/*.sqlite',
  '**/*.sqlite3',
  '**/*.db',
  '**/tmp/**',
  '**/temp/**',
  '**/cache/**',
  '**/state/**',
  '**/runtime/**',
  '**/customer*',
  '**/*customer*',
  '**/account*',
  '**/*account*',
  '**/tenant*',
  '**/*tenant*',
  '**/order*',
  '**/*order*',
  '**/case*',
  '**/*case*',
  '**/ticket*',
  '**/*ticket*',
  '**/internal/**',
  '**/*internal*',
];

const ARCHIVE_SUFFIXES: readonly string[] = [
  '.7z',
  '.apk',
  '.bz2',
  '.cab',
  '.cpio',
  '.gz',
  '.jar',
  '.rar',
  '.tar',
  '.tar.bz2',
  '.tar.gz',
  '.tar.xz',
  '.tar.zst',
  '.tgz',
  '.war',
  '.whl',
  '.xz',
  '.zip',
  '.zst',
];

const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:api[_-]?key|access[_-]?token|auth(?:orization)?|client[_-]?secret|password|passwd|private[_-]?key|secret|token)\b\s*[:=]\s*(?:"[^"]+"|'[^']+'|[^\s,}]{4,})/i,
  /\b(?:bearer|basic)\s+[A-Za-z0-9._~+\/-]{12,}/i,
  /\b(?:gh[pousr]_|sk-|xox[baprs]-)[A-Za-z0-9_-]{8,}/,
];

const BUSINESS_IDENTIFIER_PATTERNS: readonly RegExp[] = [
  /\b(?:account|business|case|client|customer|employee|order|project|tenant|ticket|user)[_-]?(?:id|number|code)\b\s*[:=]\s*(?:"[^"]+"|'[^']+'|[^\s,}]{3,})/i,
  /\b(?:id|identifier)\b\s*[:=]\s*(?:"?\d{4,}"?)/i,
];

const INTERNAL_ADDRESS_PATTERNS: readonly RegExp[] = [
  /\b(?:localhost|intranet|[A-Za-z0-9-]+\.(?:corp|internal|lan|local))\b/i,
  /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|127\.(?:\d{1,3}\.){2}\d{1,3}|169\.254\.(?:\d{1,3}\.)\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.(?:\d{1,3}\.)\d{1,3})\b/,
  /\b(?:https?|wss?|ssh|file):\/\/(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/i,
];

const RUNTIME_DATA_PATTERNS: readonly RegExp[] = [
  /\b(?:runtime[_ -]?state|session[_ -]?data|stack[_ -]?trace|trace[_ -]?id|transcript|stdout|stderr)\b\s*[:=]/i,
  /\b(?:request|response)[_-]?(?:body|payload|headers?)\b\s*[:=]/i,
];

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: RecordValue, key: string): boolean {
  return Object.hasOwn(value, key);
}

function violation(
  code: PublicTreeViolationCode,
  path: string,
  message: string,
): PublicTreeViolation {
  return { code, path, message };
}

function invalidInput(path: string, message: string): PublicTreeViolation {
  return violation('invalid-input', path, message);
}

function hasOnlyKeys(value: RecordValue, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
        continue;
      }
    }
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3;
  }
  return bytes;
}

function contentInspection(value: unknown): ContentInspection | null {
  if (typeof value === 'string') {
    return { bytes: utf8ByteLength(value), text: value };
  }
  if (value instanceof Uint8Array) {
    try {
      return { bytes: value.byteLength, text: new TextDecoder().decode(value) };
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    if (!value.every((item) => Number.isInteger(item) && (item as number) >= 0 && (item as number) <= 255)) {
      return null;
    }
    try {
      const bytes = Uint8Array.from(value as number[]);
      return { bytes: bytes.byteLength, text: new TextDecoder().decode(bytes) };
    } catch {
      return null;
    }
  }
  return null;
}

function pathPatternIsValid(pattern: unknown): pattern is string {
  if (typeof pattern !== 'string' || pattern.trim().length === 0) return false;
  if (/[\u0000-\u001f\u007f]/.test(pattern) || pattern.includes('\\')) return false;
  if (pattern.startsWith('/') || /^~(?:\/|$)/.test(pattern) || /^[A-Za-z]:/.test(pattern)) return false;
  const segments = pattern.split('/');
  if (segments.some((segment) => segment === '' && segments.length > 1 && segment !== '**')) return false;
  if (segments.some((segment) => segment === '.' || segment === '..')) return false;
  return true;
}

function normalizePath(value: unknown): NormalizedPathResult {
  if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0) {
    return { ok: false, code: 'unsafe-path' };
  }
  if (/[\u0000-\u001f\u007f]/.test(value) || value.includes('\\')) {
    return { ok: false, code: 'unsafe-path' };
  }
  if (value.startsWith('/') || /^\/{2}/.test(value)) {
    return { ok: false, code: 'absolute-path' };
  }
  if (/^[A-Za-z]:/.test(value)) {
    return { ok: false, code: 'absolute-path' };
  }
  if (/^(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|~(?:\/|$))/.test(value)) {
    return { ok: false, code: 'local-path' };
  }
  const hasTrailingSlash = value.endsWith('/');
  const rawSegments = value.split('/');
  if (hasTrailingSlash) rawSegments.pop();
  if (rawSegments.length === 0 || rawSegments.some((segment) => segment.length === 0 || segment === '.')) {
    return { ok: false, code: 'unsafe-path' };
  }
  if (rawSegments.some((segment) => segment === '..')) {
    return { ok: false, code: 'outside-tree' };
  }
  const path = rawSegments.join('/');
  if (path.length === 0) return { ok: false, code: 'unsafe-path' };
  return { ok: true, path };
}

function globPatternToRegExp(pattern: string): RegExp {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') {
      index += 1;
      if (pattern[index + 1] === '/') {
        source += '(?:.*/)?';
        index += 1;
      } else {
        source += '.*';
      }
    } else if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  source += '$';
  return new RegExp(source);
}

function compilePatterns(patterns: readonly string[]): readonly RegExp[] | null {
  if (!Array.isArray(patterns) || patterns.length === 0) return null;
  const compiled: RegExp[] = [];
  for (const pattern of patterns) {
    if (!pathPatternIsValid(pattern)) return null;
    const normalized = pattern.endsWith('/') ? `${pattern}**` : pattern;
    compiled.push(globPatternToRegExp(normalized));
  }
  return compiled;
}

function matchesAny(path: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(path));
}

function sizeOfEntry(value: RecordValue, content: ContentInspection | null): number | null {
  const declared = value.size;
  if (declared !== undefined && (!Number.isSafeInteger(declared) || (declared as number) < 0)) return null;
  return Math.max(declared === undefined ? 0 : declared as number, content?.bytes ?? 0);
}

function isArchivePath(path: string): boolean {
  const lower = path.toLowerCase();
  return ARCHIVE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function scanText(path: string, text: string, violations: PublicTreeViolation[]): void {
  const detectors: readonly [readonly RegExp[], PublicTreeViolationCode, string][] = [
    [CREDENTIAL_PATTERNS, 'credential', 'entry contains credential-shaped content'],
    [BUSINESS_IDENTIFIER_PATTERNS, 'business-identifier', 'entry contains a business identifier'],
    [INTERNAL_ADDRESS_PATTERNS, 'internal-address', 'entry contains an internal address'],
    [RUNTIME_DATA_PATTERNS, 'runtime-data', 'entry contains runtime data'],
  ];
  for (const [patterns, code, message] of detectors) {
    if (patterns.some((pattern) => pattern.test(text))) violations.push(violation(code, path, message));
  }
}

function scanContent(
  path: string,
  value: unknown,
  maxFileBytes: number,
  violations: PublicTreeViolation[],
): ContentInspection | null {
  const content = contentInspection(value);
  if (content === null) {
    violations.push(violation('scan-failed', path, 'entry content could not be scanned'));
    return null;
  }
  if (content.bytes > maxFileBytes) {
    violations.push(violation('large-file', path, 'file exceeds the configured size limit'));
  }
  scanText(path, content.text, violations);
  return content;
}

function scanPathPolicy(
  path: string,
  allowlist: readonly RegExp[],
  denylist: readonly RegExp[],
  violations: PublicTreeViolation[],
): string | null {
  const normalized = normalizePath(path);
  if (!normalized.ok) {
    violations.push(violation(normalized.code, path, 'entry path is not a safe repository-relative path'));
    return null;
  }
  if (!matchesAny(normalized.path, allowlist)) {
    violations.push(violation('path-not-allowlisted', normalized.path, 'entry path is not allowlisted'));
  }
  if (matchesAny(normalized.path, denylist)) {
    violations.push(violation('denylisted-path', normalized.path, 'entry path is denylisted'));
  }
  return normalized.path;
}

function archiveDisplayPath(archivePath: string, memberPath: string): string {
  return `${archivePath}!${memberPath}`;
}

function scanArchive(
  archivePath: string,
  archiveValue: unknown,
  maxFileBytes: number,
  denylist: readonly RegExp[],
  violations: PublicTreeViolation[],
  seenArchives: Set<unknown>,
): void {
  if (!isRecord(archiveValue) || !hasOnlyKeys(archiveValue, ['format', 'bytes', 'entries'])) {
    violations.push(violation('archive-scan-failed', archivePath, 'archive contents could not be fully scanned'));
    return;
  }
  if (hasOwn(archiveValue, 'format') && typeof archiveValue.format !== 'string') {
    violations.push(violation('archive-scan-failed', archivePath, 'archive contents could not be fully scanned'));
    return;
  }
  const hasBytes = hasOwn(archiveValue, 'bytes');
  const hasEntries = hasOwn(archiveValue, 'entries');
  if (!hasBytes && !hasEntries) {
    violations.push(violation('archive-scan-failed', archivePath, 'archive contents could not be fully scanned'));
    return;
  }
  if (seenArchives.has(archiveValue)) {
    violations.push(violation('archive-scan-failed', archivePath, 'archive contents could not be fully scanned'));
    return;
  }
  seenArchives.add(archiveValue);

  if (hasBytes) {
    const bytes = contentInspection(archiveValue.bytes);
    if (bytes === null) {
      violations.push(violation('archive-scan-failed', archivePath, 'archive contents could not be fully scanned'));
    } else {
      if (bytes.bytes > maxFileBytes) {
        violations.push(violation('large-file', archivePath, 'file exceeds the configured size limit'));
      }
      scanText(archivePath, bytes.text, violations);
    }
  }

  if (!hasEntries || !Array.isArray(archiveValue.entries)) {
    violations.push(violation('archive-scan-failed', archivePath, 'archive contents could not be fully scanned'));
    return;
  }
  const seenMembers = new Set<string>();
  for (const rawMember of archiveValue.entries) {
    scanArchiveEntry(archivePath, rawMember, maxFileBytes, denylist, violations, seenArchives, seenMembers);
  }
}

function scanArchiveEntry(
  archivePath: string,
  rawMember: unknown,
  maxFileBytes: number,
  denylist: readonly RegExp[],
  violations: PublicTreeViolation[],
  seenArchives: Set<unknown>,
  seenMembers: Set<string>,
): void {
  if (!isRecord(rawMember)) {
    violations.push(violation('unknown-entry', archivePath, 'archive member entry is not recognized'));
    return;
  }
  const rawPath = rawMember.path;
  const normalized = normalizePath(rawPath);
  if (!normalized.ok) {
    violations.push(violation(normalized.code, archiveDisplayPath(archivePath, typeof rawPath === 'string' ? rawPath : '$'), 'archive member path is not safe'));
    return;
  }
  const memberPath = normalized.path;
  const displayPath = archiveDisplayPath(archivePath, memberPath);
  if (seenMembers.has(memberPath)) {
    violations.push(violation('invalid-input', displayPath, 'archive member path is duplicated'));
    return;
  }
  seenMembers.add(memberPath);
  if (matchesAny(memberPath, denylist)) {
    violations.push(violation('denylisted-path', displayPath, 'archive member path is denylisted'));
  }

  const kind = rawMember.kind;
  if (typeof kind !== 'string') {
    violations.push(violation('unknown-entry', displayPath, 'archive member kind is not recognized'));
    return;
  }
  const allowedKeys = kind === 'file'
    ? ['path', 'kind', 'content', 'size', 'archive']
    : kind === 'directory'
      ? ['path', 'kind']
      : kind === 'symlink'
        ? ['path', 'kind', 'target']
        : kind === 'archive'
          ? ['path', 'kind', 'size', 'archive']
          : kind === 'other'
            ? ['path', 'kind']
            : [];
  if (allowedKeys.length === 0 || !hasOnlyKeys(rawMember, allowedKeys)) {
    violations.push(violation('unknown-entry', displayPath, 'archive member entry is not recognized'));
    return;
  }
  if (kind === 'symlink') {
    violations.push(violation('symlink', displayPath, 'symlink entries are not publishable'));
    return;
  }
  if (kind === 'other') {
    violations.push(violation('unknown-entry', displayPath, 'entry kind is not recognized'));
    return;
  }
  if (kind === 'directory') return;

  const content = kind === 'file' && hasOwn(rawMember, 'content')
    ? scanContent(displayPath, rawMember.content, maxFileBytes, violations)
    : null;
  if (kind === 'file' && !hasOwn(rawMember, 'content') && !hasOwn(rawMember, 'archive')) {
    violations.push(violation('scan-failed', displayPath, 'entry content could not be scanned'));
  }
  const size = sizeOfEntry(rawMember, content);
  if (size === null) {
    violations.push(invalidInput(`${displayPath}.size`, 'file size must be a non-negative safe integer'));
  } else if (size > maxFileBytes && (kind === 'archive' || !hasOwn(rawMember, 'content'))) {
    violations.push(violation('large-file', displayPath, 'file exceeds the configured size limit'));
  }
  if (kind === 'file' && isArchivePath(memberPath) && !hasOwn(rawMember, 'archive')) {
    violations.push(violation('archive-scan-failed', displayPath, 'archive contents could not be fully scanned'));
  }
  if (hasOwn(rawMember, 'archive')) {
    scanArchive(displayPath, rawMember.archive, maxFileBytes, denylist, violations, seenArchives);
  }
}

function scanTopEntry(
  rawEntry: unknown,
  allowlist: readonly RegExp[],
  denylist: readonly RegExp[],
  maxFileBytes: number,
  violations: PublicTreeViolation[],
  seenArchives: Set<unknown>,
): string | null {
  if (!isRecord(rawEntry)) {
    violations.push(invalidInput('$', 'tree entry must be an object'));
    return null;
  }
  const path = scanPathPolicy(typeof rawEntry.path === 'string' ? rawEntry.path : '$', allowlist, denylist, violations);
  if (path === null) return null;
  const kind = rawEntry.kind;
  if (typeof kind !== 'string') {
    violations.push(violation('unknown-entry', path, 'entry kind is not recognized'));
    return path;
  }
  const allowedKeys = kind === 'file'
    ? ['path', 'kind', 'content', 'size', 'archive']
    : kind === 'directory'
      ? ['path', 'kind']
      : kind === 'symlink'
        ? ['path', 'kind', 'target']
        : kind === 'archive'
          ? ['path', 'kind', 'size', 'archive']
          : kind === 'other'
            ? ['path', 'kind']
            : [];
  if (allowedKeys.length === 0 || !hasOnlyKeys(rawEntry, allowedKeys)) {
    violations.push(violation('unknown-entry', path, 'entry kind is not recognized'));
    return path;
  }
  if (kind === 'symlink') {
    violations.push(violation('symlink', path, 'symlink entries are not publishable'));
    return path;
  }
  if (kind === 'other') {
    violations.push(violation('unknown-entry', path, 'entry kind is not recognized'));
    return path;
  }
  if (kind === 'directory') return path;

  const content = kind === 'file' && hasOwn(rawEntry, 'content')
    ? scanContent(path, rawEntry.content, maxFileBytes, violations)
    : null;
  if (kind === 'file' && !hasOwn(rawEntry, 'content') && !hasOwn(rawEntry, 'archive')) {
    violations.push(violation('scan-failed', path, 'entry content could not be scanned'));
  }
  const size = sizeOfEntry(rawEntry, content);
  if (size === null) {
    violations.push(invalidInput(`${path}.size`, 'file size must be a non-negative safe integer'));
  } else if (size > maxFileBytes && (kind === 'archive' || !hasOwn(rawEntry, 'content'))) {
    violations.push(violation('large-file', path, 'file exceeds the configured size limit'));
  }
  if (kind === 'file' && isArchivePath(path) && !hasOwn(rawEntry, 'archive')) {
    violations.push(violation('archive-scan-failed', path, 'archive contents could not be fully scanned'));
  }
  if (hasOwn(rawEntry, 'archive')) {
    scanArchive(path, rawEntry.archive, maxFileBytes, denylist, violations, seenArchives);
  }
  return path;
}

function blocked(violations: readonly PublicTreeViolation[]): PublicTreeAssessmentBlocked {
  return { status: 'blocked', violations };
}

export function assessPublicTree(input: PublicTreeAssessmentInput): PublicTreeAssessmentResult {
  const violations: PublicTreeViolation[] = [];
  if (!isRecord(input)) return blocked([invalidInput('$', 'assessment input must be an object')]);
  if (!hasOnlyKeys(input, ['entries', 'allowlist', 'denylist', 'maxFileBytes'])) {
    violations.push(invalidInput('$', 'assessment input contains an unknown field'));
  }
  if (!Array.isArray(input.entries)) {
    violations.push(invalidInput('entries', 'staged tree entries must be an array'));
  }
  const allowlist = compilePatterns(input.allowlist as readonly string[]);
  if (allowlist === null) {
    violations.push(violation('invalid-policy', 'allowlist', 'allowlist must contain valid path patterns'));
  }
  const rawDenylist = input.denylist === undefined ? DEFAULT_DENYLIST : input.denylist;
  if (!Array.isArray(rawDenylist)) {
    violations.push(violation('invalid-policy', 'denylist', 'denylist must be an array of path patterns'));
  }
  const denylist = Array.isArray(rawDenylist) ? compilePatterns([...DEFAULT_DENYLIST, ...rawDenylist]) : null;
  if (denylist === null) {
    violations.push(violation('invalid-policy', 'denylist', 'denylist must contain valid path patterns'));
  }
  const maxFileBytes = input.maxFileBytes === undefined ? DEFAULT_PUBLIC_TREE_MAX_FILE_BYTES : input.maxFileBytes;
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 0) {
    violations.push(violation('invalid-policy', 'maxFileBytes', 'maxFileBytes must be a non-negative safe integer'));
  }
  if (violations.length > 0 || allowlist === null || denylist === null || !Array.isArray(input.entries)) {
    return blocked(violations);
  }

  const seenPaths = new Set<string>();
  const entries = input.entries as readonly unknown[];
  const seenArchives = new Set<unknown>();
  for (const rawEntry of entries) {
    const path = scanTopEntry(rawEntry, allowlist, denylist, maxFileBytes as number, violations, seenArchives);
    if (path === null) continue;
    if (seenPaths.has(path)) {
      violations.push(violation('invalid-input', path, 'staged tree path is duplicated'));
    }
    seenPaths.add(path);
  }

  return violations.length > 0 ? blocked(violations) : { status: 'allowed', violations: [] };
}
