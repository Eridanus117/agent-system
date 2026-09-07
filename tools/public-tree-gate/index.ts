import { gunzipSync, inflateRawSync } from 'node:zlib';

import {
  assessPublicTree,
  type PublicTreeArchive,
  type PublicTreeEntry,
  type PublicTreeAssessmentInput,
  type PublicTreeAssessmentResult,
  type PublicTreeViolation,
} from '../../packages/mounts/src/index.ts';

export const DEFAULT_PUBLIC_TREE_GATE_CONFIG = 'tools/public-tree-gate/public-tree-allowlist.json' as const;

export interface PublicTreeGateConfig {
  readonly allowlist: readonly string[];
  readonly denylist?: readonly string[];
  readonly maxFileBytes?: number;
}

export interface GitRunner {
  (args: readonly string[], cwd: string): Promise<Uint8Array>;
}

export interface PublicTreeGateOptions {
  readonly cwd?: string;
  readonly configPath?: string;
  readonly runGit?: GitRunner;
  readonly assess?: (input: PublicTreeAssessmentInput) => PublicTreeAssessmentResult;
}

export interface PublicTreeGateRun {
  readonly exitCode: 0 | 1;
  readonly result: PublicTreeAssessmentResult;
  readonly output: string;
}

interface IndexRecord {
  readonly mode: string;
  readonly objectId: string;
  readonly stage: number;
  readonly path: string;
}

const MAX_ARCHIVE_DEPTH = 8;
const MAX_ARCHIVE_MEMBER_BYTES = 64 * 1024 * 1024;
const ARCHIVE_SUFFIXES = [
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
] as const;

function blocked(violations: readonly PublicTreeViolation[]): PublicTreeAssessmentResult {
  return { status: 'blocked', violations };
}

function gateViolation(
  code: PublicTreeViolation['code'],
  path: string,
  message: string,
): PublicTreeViolation {
  return { code, path, message };
}

function decodeUtf8(bytes: Uint8Array, context: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(context);
  }
}

function decodeAscii(bytes: Uint8Array, context: string): string {
  for (const byte of bytes) {
    if (byte > 0x7f) throw new Error(context);
  }
  return new TextDecoder('ascii', { fatal: true }).decode(bytes);
}

async function readStream(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  return stream === null ? new Uint8Array() : new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function runGit(args: readonly string[], cwd: string): Promise<Uint8Array> {
  const child = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, _stderr, exitCode] = await Promise.all([
    readStream(child.stdout),
    readStream(child.stderr),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`git command failed: ${args[0] ?? 'unknown'}`);
  return stdout;
}

function parseIndexListing(bytes: Uint8Array): readonly IndexRecord[] {
  if (bytes.length === 0) return [];
  if (bytes[bytes.length - 1] !== 0) throw new Error('index listing was not NUL terminated');

  const records: IndexRecord[] = [];
  let start = 0;
  while (start < bytes.length) {
    const end = bytes.indexOf(0, start);
    if (end < 0) throw new Error('index listing contained an unterminated record');
    if (end === start) {
      start = end + 1;
      continue;
    }
    const record = bytes.subarray(start, end);
    const separator = record.indexOf(9);
    if (separator <= 0 || separator === record.length - 1) throw new Error('index record was malformed');
    const metadata = decodeAscii(record.subarray(0, separator), 'index metadata was not ASCII');
    const fields = metadata.split(' ');
    if (fields.length !== 3 || fields.some((field) => field.length === 0)) throw new Error('index metadata was malformed');
    const [mode, objectId, rawStage] = fields;
    if (!/^[0-9]{6}$/.test(mode) || !/^[0-9a-f]{40,64}$/.test(objectId) || !/^[0-3]$/.test(rawStage)) {
      throw new Error('index metadata was invalid');
    }
    const path = decodeUtf8(record.subarray(separator + 1), 'index path was not valid UTF-8');
    if (path.length === 0) throw new Error('index path was empty');
    records.push({ mode, objectId, stage: Number(rawStage), path });
    start = end + 1;
  }
  return records;
}

function isRegularMode(mode: string): boolean {
  return mode === '100644' || mode === '100755';
}

function archiveFormat(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar+gzip';
  if (lower.endsWith('.tar.bz2')) return 'tar+bzip2';
  if (lower.endsWith('.tar.xz')) return 'tar+xz';
  if (lower.endsWith('.tar.zst')) return 'tar+zstd';
  if (lower.endsWith('.tar')) return 'tar';
  if (lower.endsWith('.zip') || lower.endsWith('.jar') || lower.endsWith('.war') || lower.endsWith('.whl') || lower.endsWith('.apk')) return 'zip';
  if (lower.endsWith('.gz')) return 'gzip';
  if (lower.endsWith('.bz2')) return 'bzip2';
  if (lower.endsWith('.xz')) return 'xz';
  if (lower.endsWith('.zst')) return 'zstd';
  return 'archive';
}

function isArchivePath(path: string): boolean {
  const lower = path.toLowerCase();
  return ARCHIVE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function readU16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new Error('archive integer was out of bounds');
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error('archive integer was out of bounds');
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function decodeArchiveName(bytes: Uint8Array, utf8: boolean): string {
  try {
    return new TextDecoder(utf8 ? 'utf-8' : 'utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('archive member path was not valid UTF-8');
  }
}

function fileEntry(path: string, bytes: Uint8Array, depth: number): PublicTreeEntry {
  if (isArchivePath(path)) {
    return {
      path,
      kind: 'file',
      size: bytes.byteLength,
      archive: archiveRepresentation(path, bytes, depth + 1),
    };
  }
  if (bytes.byteLength > MAX_ARCHIVE_MEMBER_BYTES) return { path, kind: 'file', size: bytes.byteLength };
  return { path, kind: 'file', size: bytes.byteLength, content: bytes };
}

function zipEntries(path: string, bytes: Uint8Array, depth: number): readonly PublicTreeEntry[] {
  const minimumEndOffset = Math.max(0, bytes.length - 65_557);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= minimumEndOffset; offset -= 1) {
    if (offset >= 0 && readU32(bytes, offset) === 0x06054b50) {
      const commentLength = readU16(bytes, offset + 20);
      if (offset + 22 + commentLength === bytes.length) {
        endOffset = offset;
        break;
      }
    }
  }
  if (endOffset < 0) throw new Error('zip end record was missing');
  if (readU16(bytes, endOffset + 4) !== 0 || readU16(bytes, endOffset + 6) !== 0) throw new Error('multi-disk zip was not supported');
  const totalEntries = readU16(bytes, endOffset + 10);
  const centralSize = readU32(bytes, endOffset + 12);
  const centralOffset = readU32(bytes, endOffset + 16);
  if (centralOffset === 0xffffffff || centralSize === 0xffffffff || totalEntries === 0xffff) throw new Error('zip64 was not supported');
  if (centralOffset + centralSize !== endOffset || centralOffset + centralSize > bytes.length) throw new Error('zip central directory was malformed');

  const entries: PublicTreeEntry[] = [];
  let offset = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (readU32(bytes, offset) !== 0x02014b50) throw new Error('zip central entry was malformed');
    const madeBy = readU16(bytes, offset + 4);
    const flags = readU16(bytes, offset + 8);
    const method = readU16(bytes, offset + 10);
    const compressedSize = readU32(bytes, offset + 20);
    const uncompressedSize = readU32(bytes, offset + 24);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const externalAttributes = readU32(bytes, offset + 38);
    const localOffset = readU32(bytes, offset + 42);
    const centralEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (centralEnd > endOffset || localOffset === 0xffffffff || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error('zip central entry exceeded archive bounds');
    }
    const memberPath = decodeArchiveName(bytes.subarray(offset + 46, offset + 46 + nameLength), (flags & 0x800) !== 0);
    if (memberPath.length === 0) throw new Error('zip member path was empty');
    if ((flags & 0x1) !== 0) throw new Error('encrypted zip member was not scannable');
    if (readU32(bytes, localOffset) !== 0x04034b50) throw new Error('zip local entry was malformed');
    const localNameLength = readU16(bytes, localOffset + 26);
    const localExtraLength = readU16(bytes, localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > bytes.length) throw new Error('zip member data exceeded archive bounds');
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    let content: Uint8Array | null = null;
    if (uncompressedSize <= MAX_ARCHIVE_MEMBER_BYTES) {
      if (method === 0) content = new Uint8Array(compressed);
      else if (method === 8) content = new Uint8Array(inflateRawSync(compressed));
      else throw new Error('zip compression method was not scannable');
      if (content.byteLength !== uncompressedSize) throw new Error('zip member size did not match its header');
    }
    const madeByUnix = (madeBy >>> 8) === 3;
    const unixMode = madeByUnix ? (externalAttributes >>> 16) & 0xf000 : 0;
    if (unixMode === 0xa000) {
      if (content === null) throw new Error('symlink target exceeded scan limit');
      entries.push({ path: memberPath, kind: 'symlink', target: decodeUtf8(content, 'zip symlink target was not valid UTF-8') });
    } else if (memberPath.endsWith('/')) {
      entries.push({ path: memberPath, kind: 'directory' });
    } else if (content === null) {
      entries.push({ path: memberPath, kind: 'file', size: uncompressedSize });
    } else {
      entries.push(fileEntry(memberPath, content, depth));
    }
    offset = centralEnd;
  }
  if (offset !== endOffset) throw new Error('zip central directory had trailing data');
  return entries;
}

function trimTarString(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  while (end > 0 && (bytes[end - 1] === 0 || bytes[end - 1] === 0x20)) end -= 1;
  return bytes.subarray(0, end);
}

function tarNumber(bytes: Uint8Array): number {
  const field = trimTarString(bytes);
  if (field.length === 0) return 0;
  if ((field[0] & 0x80) !== 0) throw new Error('base-256 tar numbers were not supported');
  const text = decodeAscii(field, 'tar numeric field was not ASCII').trim();
  if (!/^[0-7]+$/.test(text)) throw new Error('tar numeric field was malformed');
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('tar numeric field was unsafe');
  return value;
}

function tarHeaderIsZero(bytes: Uint8Array, offset: number): boolean {
  for (let index = 0; index < 512; index += 1) if (bytes[offset + index] !== 0) return false;
  return true;
}

function tarEntries(path: string, bytes: Uint8Array, depth: number): readonly PublicTreeEntry[] {
  const entries: PublicTreeEntry[] = [];
  let offset = 0;
  let ended = false;
  while (offset + 512 <= bytes.length) {
    if (tarHeaderIsZero(bytes, offset)) {
      ended = true;
      for (let index = offset; index < bytes.length; index += 1) if (bytes[index] !== 0) throw new Error('tar data followed its end marker');
      break;
    }
    const nameBytes = trimTarString(bytes.subarray(offset, offset + 100));
    const prefixBytes = trimTarString(bytes.subarray(offset + 345, offset + 500));
    const name = decodeUtf8(prefixBytes.length === 0 ? nameBytes : new Uint8Array([...prefixBytes, 0x2f, ...nameBytes]), 'tar member path was not valid UTF-8');
    if (name.length === 0) throw new Error('tar member path was empty');
    const size = tarNumber(bytes.subarray(offset + 124, offset + 136));
    const type = bytes[offset + 156];
    const dataOffset = offset + 512;
    if (dataOffset + size > bytes.length) throw new Error('tar member data exceeded archive bounds');
    const content = size <= MAX_ARCHIVE_MEMBER_BYTES ? new Uint8Array(bytes.subarray(dataOffset, dataOffset + size)) : null;
    if (type === 0 || type === 0x30) {
      if (content === null) entries.push({ path: name, kind: 'file', size });
      else entries.push(fileEntry(name, content, depth));
    } else if (type === 0x35) {
      entries.push({ path: name, kind: 'directory' });
    } else if (type === 0x32) {
      if (content === null) throw new Error('tar symlink target exceeded scan limit');
      entries.push({ path: name, kind: 'symlink', target: decodeUtf8(bytes.subarray(dataOffset, dataOffset + size), 'tar symlink target was not valid UTF-8') });
    } else if (type === 0x78 || type === 0x67 || type === 0x4c || type === 0x4b) {
      throw new Error('tar metadata entry was not scannable');
    } else {
      entries.push({ path: name, kind: 'other' });
    }
    offset = dataOffset + Math.ceil(size / 512) * 512;
  }
  if (!ended) throw new Error('tar end marker was missing');
  return entries;
}

function archiveRepresentation(path: string, bytes: Uint8Array, depth: number): PublicTreeArchive {
  const format = archiveFormat(path);
  if (depth > MAX_ARCHIVE_DEPTH) return { format, bytes };
  try {
    const lower = path.toLowerCase();
    if (lower.endsWith('.zip') || lower.endsWith('.jar') || lower.endsWith('.war') || lower.endsWith('.whl') || lower.endsWith('.apk')) {
      return { format, entries: zipEntries(path, bytes, depth) };
    }
    if (lower.endsWith('.tar')) return { format, entries: tarEntries(path, bytes, depth) };
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
      return { format, entries: tarEntries(path, new Uint8Array(gunzipSync(bytes)), depth) };
    }
  } catch {
    return { format, bytes };
  }
  return { format, bytes };
}

function indexEntry(record: IndexRecord, content: Uint8Array | undefined): PublicTreeEntry {
  if (record.mode === '120000') {
    if (content === undefined) throw new Error('symlink blob was not read');
    return { path: record.path, kind: 'symlink', target: decodeUtf8(content, 'symlink target was not valid UTF-8') };
  }
  if (isRegularMode(record.mode)) {
    if (content === undefined) throw new Error('file blob was not read');
    if (isArchivePath(record.path)) {
      return { path: record.path, kind: 'file', size: content.byteLength, archive: archiveRepresentation(record.path, content, 0) };
    }
    return { path: record.path, kind: 'file', size: content.byteLength, content };
  }
  if (record.mode === '160000') return { path: record.path, kind: 'other' };
  return { path: record.path, kind: 'other' };
}

export async function readIndexTree(options: { readonly cwd?: string; readonly runGit?: GitRunner } = {}): Promise<readonly PublicTreeEntry[]> {
  const cwd = options.cwd ?? process.cwd();
  const git = options.runGit ?? runGit;
  const listing = await git(['ls-files', '--cached', '--stage', '--full-name', '-z'], cwd);
  const records = parseIndexListing(listing);
  const entries: PublicTreeEntry[] = [];
  for (const record of records) {
    if (record.stage !== 0) throw new Error(`index conflict at ${record.path}`);
    const content = isRegularMode(record.mode) || record.mode === '120000'
      ? await git(['cat-file', 'blob', record.objectId], cwd)
      : undefined;
    entries.push(indexEntry(record, content));
  }
  return entries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validPathPattern(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  if (/[\u0000-\u001f\u007f]/.test(value) || value.includes('\\')) return false;
  if (value.startsWith('/') || /^~(?:\/|$)/.test(value) || /^[A-Za-z]:/.test(value)) return false;
  const segments = value.split('/');
  return !segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..');
}

function parseConfig(bytes: Uint8Array): PublicTreeGateConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8(bytes, 'allowlist configuration was not UTF-8'));
  } catch {
    throw new Error('allowlist configuration could not be parsed');
  }
  if (!isRecord(parsed)) throw new Error('allowlist configuration must be an object');
  const allowedKeys = ['allowlist', 'denylist', 'maxFileBytes'];
  if (Object.keys(parsed).some((key) => !allowedKeys.includes(key))) throw new Error('allowlist configuration contained an unknown field');
  const allowlist = parsed.allowlist;
  if (!Array.isArray(allowlist) || allowlist.length === 0 || !allowlist.every(validPathPattern)) throw new Error('allowlist configuration must contain a non-empty valid allowlist');
  const denylist = parsed.denylist;
  if (denylist !== undefined && (!Array.isArray(denylist) || !denylist.every(validPathPattern))) throw new Error('allowlist configuration contained an invalid denylist');
  const maxFileBytes = parsed.maxFileBytes;
  if (maxFileBytes !== undefined && (!Number.isSafeInteger(maxFileBytes) || (maxFileBytes as number) < 0)) throw new Error('allowlist configuration contained an invalid size limit');
  return {
    allowlist,
    ...(denylist === undefined ? {} : { denylist }),
    ...(maxFileBytes === undefined ? {} : { maxFileBytes }),
  } as PublicTreeGateConfig;
}

function safeConfigPath(path: string): boolean {
  return path.length > 0 && !/[\u0000\u0001-\u001f\u007f\\]/.test(path) && !path.startsWith('/') && !/^[A-Za-z]:/.test(path) && !path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

function configFromIndex(entries: readonly PublicTreeEntry[], configPath: string): PublicTreeGateConfig {
  if (!safeConfigPath(configPath)) throw new Error('allowlist configuration path was unsafe');
  const configEntry = entries.find((entry) => entry.path === configPath);
  if (configEntry === undefined || configEntry.kind !== 'file' || configEntry.content === undefined || !(configEntry.content instanceof Uint8Array)) {
    throw new Error('allowlist configuration was missing from the index');
  }
  return parseConfig(configEntry.content);
}

function renderResult(result: PublicTreeAssessmentResult, entryCount: number): string {
  if (result.status === 'allowed') return `public-tree-gate: allowed entries=${entryCount}`;
  const lines = [`public-tree-gate: blocked entries=${entryCount} violations=${result.violations.length}`];
  for (const item of result.violations) {
    lines.push(`public-tree-gate: violation code=${item.code} path=${JSON.stringify(item.path)} message=${JSON.stringify(item.message)}`);
  }
  return lines.join('\n');
}

export async function runPublicTreeGate(options: PublicTreeGateOptions = {}): Promise<PublicTreeGateRun> {
  const configPath = options.configPath ?? DEFAULT_PUBLIC_TREE_GATE_CONFIG;
  let entries: readonly PublicTreeEntry[];
  try {
    entries = await readIndexTree({ cwd: options.cwd, runGit: options.runGit });
  } catch {
    const result = blocked([gateViolation('scan-failed', '$index', 'staged index could not be read')]);
    return { exitCode: 1, result, output: renderResult(result, 0) };
  }

  let config: PublicTreeGateConfig;
  try {
    config = configFromIndex(entries, configPath);
  } catch {
    const result = blocked([gateViolation('invalid-policy', configPath, 'allowlist configuration could not be loaded')]);
    return { exitCode: 1, result, output: renderResult(result, entries.length) };
  }

  let result: PublicTreeAssessmentResult;
  try {
    result = (options.assess ?? assessPublicTree)({ entries, ...config });
  } catch {
    result = blocked([gateViolation('scan-failed', '$assessment', 'public tree assessment failed')]);
  }
  return {
    exitCode: result.status === 'allowed' ? 0 : 1,
    result,
    output: renderResult(result, entries.length),
  };
}

function parseArguments(args: readonly string[]): { readonly configPath?: string; readonly error?: string } {
  let configPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument !== '--config' || configPath !== undefined || index + 1 >= args.length) return { error: 'usage: bun tools/public-tree-gate/index.ts [--config path]' };
    configPath = args[index + 1];
    index += 1;
  }
  return configPath === undefined ? {} : { configPath };
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  const parsed = parseArguments(args);
  if (parsed.error !== undefined) {
    process.stderr.write(`public-tree-gate: ${parsed.error}\n`);
    return 1;
  }
  const run = await runPublicTreeGate({ configPath: parsed.configPath });
  const output = `${run.output}\n`;
  if (run.exitCode === 0) process.stdout.write(output);
  else process.stderr.write(output);
  return run.exitCode;
}

if (import.meta.main) process.exitCode = await main();
