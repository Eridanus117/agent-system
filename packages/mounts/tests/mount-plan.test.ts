import { describe, expect, test } from 'bun:test';

import {
  createMountPlan,
  type MountManifest,
  type MountPlanInput,
  type MountPlanResult,
  type MountSpec,
} from '../src/index';

const checkoutRoot = '/tmp/synthetic-checkout';
const sourceRoot = '/tmp/synthetic-private-assets';

const navigation: MountSpec = {
  id: 'navigation',
  rootId: 'private-assets',
  source: 'navigation',
  target: '.omp/local/navigation',
  expectedType: 'directory',
  required: true,
  readonly: true,
};

const roots = {
  version: 1 as const,
  roots: {
    'private-assets': {
      path: sourceRoot,
      trustDomain: 'private-local' as const,
    },
  },
};

function sourcePath(mount: MountSpec): string {
  return `${sourceRoot}/${mount.source}`;
}

function targetPath(mount: MountSpec): string {
  return `${checkoutRoot}/${mount.target}`;
}

function makeInput(
  mountOverrides: Partial<MountSpec> = {},
  changes: Partial<MountPlanInput> = {},
): MountPlanInput {
  const mount = { ...navigation, ...mountOverrides };
  const manifest: MountManifest = {
    version: 1,
    profile: 'private-local',
    mounts: [mount],
  };
  return {
    manifest,
    roots,
    checkoutRoot,
    sources: { [sourcePath(mount)]: { kind: 'present' } },
    targets: { [targetPath(mount)]: { kind: 'missing' } },
    ...changes,
  };
}

function errorCodes(result: MountPlanResult): string[] {
  return result.errors.map((entry) => entry.code);
}

function expectBlocked(result: MountPlanResult, code: string): void {
  expect(result.status).toBe('blocked');
  expect(result.writes).toEqual([]);
  expect(result.errors).not.toEqual([]);
  expect(errorCodes(result)).toContain(code);
}

describe('createMountPlan', () => {
  test('returns writes for missing targets and keeps for correct symlinks', () => {
    const kept = { ...navigation, id: 'kept', source: 'kept', target: '.omp/local/kept' };
    const input = makeInput({}, {
      manifest: { version: 1, profile: 'private-local', mounts: [navigation, kept] },
      sources: {
        [sourcePath(navigation)]: { kind: 'present' },
        [sourcePath(kept)]: { kind: 'present' },
      },
      targets: {
        [targetPath(navigation)]: { kind: 'missing' },
        [targetPath(kept)]: { kind: 'symlink', target: sourcePath(kept) },
      },
    });

    const result = createMountPlan(input);

    expect(result).toEqual({
      status: 'ready',
      errors: [],
      writes: [{
        mountId: 'navigation',
        sourcePath: sourcePath(navigation),
        targetPath: targetPath(navigation),
        expectedType: 'directory',
        readonly: true,
      }],
      keeps: [{
        mountId: 'kept',
        sourcePath: sourcePath(kept),
        targetPath: targetPath(kept),
        expectedType: 'directory',
      }],
    });
  });

  test('blocks a required source that is explicitly missing', () => {
    const mount = { ...navigation, source: 'missing-source' };
    const result = createMountPlan(makeInput(mount, {
      sources: { [sourcePath(mount)]: { kind: 'missing' } },
    }));

    expectBlocked(result, 'missing-required-source');
  });

  test('skips an optional mount whose source is missing', () => {
    const mount = { ...navigation, required: false, source: 'optional-source' };
    const result = createMountPlan(makeInput(mount, {
      sources: { [sourcePath(mount)]: { kind: 'missing' } },
    }));

    expect(result).toEqual({ status: 'ready', errors: [], writes: [], keeps: [] });
  });

  test('rejects unsupported profiles and unknown manifest fields', () => {
    const result = createMountPlan(makeInput({}, {
      manifest: {
        version: 1,
        profile: 'shared-runtime',
        mounts: [navigation],
        extra: true,
      } as unknown as MountManifest,
    }));

    expectBlocked(result, 'unsupported-profile');
    expect(errorCodes(result)).toContain('invalid-manifest');
  });

  test('rejects missing and unauthorized root aliases', () => {
    const missing = createMountPlan(makeInput({ rootId: 'missing-root' }));
    expectBlocked(missing, 'unknown-root');

    const unauthorized = createMountPlan(makeInput({}, {
      roots: {
        version: 1,
        roots: {
          'private-assets': { path: sourceRoot, trustDomain: 'public' },
        },
      } as unknown as MountPlanInput['roots'],
    }));
    expectBlocked(unauthorized, 'unknown-root');
  });

  test('rejects unsafe source and target relative paths', () => {
    for (const source of ['/tmp/synthetic-absolute', '.', '..', 'nested/../source']) {
      const result = createMountPlan(makeInput({ source }));
      expectBlocked(result, 'unsafe-source-path');
    }
    for (const target of ['/tmp/synthetic-absolute', '.', '..', 'nested/../target']) {
      const result = createMountPlan(makeInput({ target }));
      expectBlocked(result, 'unsafe-target-path');
    }
  });

  test('rejects source and target bases that are not absolute verified scopes', () => {
    const sourceOutside = createMountPlan(makeInput({}, {
      roots: {
        version: 1,
        roots: {
          'private-assets': { path: 'relative-synthetic-root', trustDomain: 'private-local' },
        },
      },
    }));
    expectBlocked(sourceOutside, 'source-outside-root');

    const targetOutside = createMountPlan(makeInput({}, { checkoutRoot: 'relative-synthetic-checkout' }));
    expectBlocked(targetOutside, 'target-outside-checkout');
  });

  test('rejects duplicate and ancestor-overlapping targets as one blocked plan', () => {
    const duplicate = { ...navigation, id: 'duplicate', source: 'duplicate' };
    const duplicateResult = createMountPlan(makeInput({}, {
      manifest: { version: 1, profile: 'private-local', mounts: [navigation, duplicate] },
      sources: {
        [sourcePath(navigation)]: { kind: 'present' },
        [sourcePath(duplicate)]: { kind: 'present' },
      },
      targets: {
        [targetPath(navigation)]: { kind: 'missing' },
        [targetPath(duplicate)]: { kind: 'missing' },
      },
    }));
    expectBlocked(duplicateResult, 'duplicate-target');

    const child = { ...navigation, id: 'child', source: 'child', target: '.omp/local/navigation/child' };
    const overlapResult = createMountPlan(makeInput({}, {
      manifest: { version: 1, profile: 'private-local', mounts: [navigation, child] },
      sources: {
        [sourcePath(navigation)]: { kind: 'present' },
        [sourcePath(child)]: { kind: 'present' },
      },
      targets: {
        [targetPath(navigation)]: { kind: 'missing' },
        [targetPath(child)]: { kind: 'missing' },
      },
    }));
    expectBlocked(overlapResult, 'ancestor-target-overlap');
  });

  test('rejects occupied targets and wrong symlink targets without writes', () => {
    const occupied = createMountPlan(makeInput({}, {
      targets: { [targetPath(navigation)]: { kind: 'file' } },
    }));
    expectBlocked(occupied, 'target-occupied');

    const wrongSymlink = createMountPlan(makeInput({}, {
      targets: { [targetPath(navigation)]: { kind: 'symlink', target: '/tmp/synthetic-other/source' } },
    }));
    expectBlocked(wrongSymlink, 'wrong-symlink-target');
  });
});
