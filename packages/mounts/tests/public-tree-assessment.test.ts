import { describe, expect, test } from 'bun:test';

import {
  assessPublicTree,
  type PublicTreeAssessmentInput,
  type PublicTreeEntry,
} from '../src/index';

const allowlist = ['README.md', 'docs/**', 'fixtures/**', 'archives/**', 'packages/mounts/**'];
const denylist = ['private/**', 'blocked/**'];

function assess(entries: readonly PublicTreeEntry[], overrides: Partial<PublicTreeAssessmentInput> = {}) {
  return assessPublicTree({
    entries,
    allowlist,
    denylist,
    maxFileBytes: 32,
    ...overrides,
  });
}

describe('PublicTreeAssessment', () => {
  test('allows only fully scanned allowlisted public entries', () => {
    const result = assess([
      { path: 'README.md', kind: 'file', content: 'Public overview.' },
      { path: 'docs/guide.txt', kind: 'file', content: 'Reusable guidance.' },
      { path: 'packages/mounts', kind: 'directory' },
    ]);

    expect(result).toEqual({ status: 'allowed', violations: [] });
  });

  test('allows the public workspace lockfile when explicitly allowlisted', () => {
    const result = assess([
      { path: 'bun.lock', kind: 'file', content: '{"lockfileVersion":1}' },
    ], { allowlist: ['bun.lock'] });

    expect(result).toEqual({ status: 'allowed', violations: [] });
  });

  test('requires an explicit non-empty allowlist', () => {
    const result = assess([], { allowlist: [] });

    expect(result.status).toBe('blocked');
    expect(result.violations).toContainEqual({
      code: 'invalid-policy',
      path: 'allowlist',
      message: 'allowlist must contain valid path patterns',
    });
  });

  test('applies denylist rules even when a path is allowlisted', () => {
    const result = assess([
      { path: 'blocked/note.txt', kind: 'file', content: 'synthetic note' },
    ], { allowlist: ['blocked/**'] });

    expect(result.status).toBe('blocked');
    expect(result.violations).toContainEqual({
      code: 'denylisted-path',
      path: 'blocked/note.txt',
      message: 'entry path is denylisted',
    });
  });

  test('blocks paths outside the staged tree and local filesystem paths', () => {
    const result = assess([
      { path: '../outside.txt', kind: 'file', content: 'synthetic' },
      { path: '/tmp/local.txt', kind: 'file', content: 'synthetic' },
      { path: '~/local.txt', kind: 'file', content: 'synthetic' },
    ], { allowlist: ['**'] });

    expect(result.status).toBe('blocked');
    expect(result.violations.map((item) => [item.code, item.path])).toEqual([
      ['outside-tree', '../outside.txt'],
      ['absolute-path', '/tmp/local.txt'],
      ['local-path', '~/local.txt'],
    ]);
  });

  test('blocks symlinks regardless of their target', () => {
    const result = assess([
      { path: 'fixtures/link', kind: 'symlink', target: 'docs/guide.txt' },
    ], { allowlist: ['fixtures/**'] });

    expect(result.status).toBe('blocked');
    expect(result.violations).toContainEqual({
      code: 'symlink',
      path: 'fixtures/link',
      message: 'symlink entries are not publishable',
    });
  });

  test('blocks business identifiers, internal addresses, credentials, and runtime data', () => {
    const result = assess([
      { path: 'fixtures/a.txt', kind: 'file', content: 'account_id: synthetic-42' },
      { path: 'fixtures/b.txt', kind: 'file', content: 'endpoint = http://10.20.30.40/service' },
      { path: 'fixtures/c.txt', kind: 'file', content: 'token: synthetic-token-value' },
      { path: 'fixtures/d.txt', kind: 'file', content: 'session_data: synthetic' },
    ], { maxFileBytes: 128 });
    expect(result.status).toBe('blocked');
    expect(result.violations.map((item) => item.code)).toEqual([
      'business-identifier',
      'internal-address',
      'credential',
      'runtime-data',
    ]);
  });

  test('blocks a file whose bytes exceed the configured limit', () => {
    const result = assess([
      { path: 'fixtures/large.txt', kind: 'file', content: new Uint8Array(33) },
    ]);

    expect(result.status).toBe('blocked');
    expect(result.violations).toContainEqual({
      code: 'large-file',
      path: 'fixtures/large.txt',
      message: 'file exceeds the configured size limit',
    });
  });

  test('scans every represented archive member', () => {
    const allowed = assess([
      {
        path: 'archives/safe.zip',
        kind: 'file',
        archive: {
          entries: [
            { path: 'guide.txt', kind: 'file', content: 'synthetic archive text' },
          ],
        },
      },
    ]);
    const blocked = assess([
      {
        path: 'archives/payload.zip',
        kind: 'file',
        archive: {
          entries: [
            { path: 'nested/credential.txt', kind: 'file', content: 'token: synthetic-token-value' },
          ],
        },
      },
    ]);

    expect(allowed).toEqual({ status: 'allowed', violations: [] });
    expect(blocked.status).toBe('blocked');
    expect(blocked.violations).toContainEqual({
      code: 'credential',
      path: 'archives/payload.zip!nested/credential.txt',
      message: 'entry contains credential-shaped content',
    });
  });

  test('does not allow an archive without a complete entry representation to bypass scanning', () => {
    const result = assess([
      {
        path: 'archives/opaque.zip',
        kind: 'file',
        content: new Uint8Array([80, 75, 3, 4]),
      },
    ]);

    expect(result.status).toBe('blocked');
    expect(result.violations).toContainEqual({
      code: 'archive-scan-failed',
      path: 'archives/opaque.zip',
      message: 'archive contents could not be fully scanned',
    });
  });

  test('blocks missing content and unrecognized entries conservatively', () => {
    const result = assess([
      { path: 'fixtures/missing.txt', kind: 'file', size: 0 },
      { path: 'fixtures/unknown.bin', kind: 'mystery' } as unknown as PublicTreeEntry,
    ]);

    expect(result.status).toBe('blocked');
    expect(result.violations.map((item) => item.code)).toEqual(['scan-failed', 'unknown-entry']);
  });
});
