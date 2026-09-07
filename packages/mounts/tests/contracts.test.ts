import { describe, expect, test } from 'bun:test';

import {
  isMountPlanResult,
  parseMachineLocalRoots,
  parseMountManifest,
  validateMountPlanResult,
  type MountManifest,
} from '../src/index';

const manifest: MountManifest = {
  version: 1,
  profile: 'private-local',
  mounts: [
    {
      id: 'navigation',
      rootId: 'private-assets',
      source: 'navigation',
      target: '.omp/local/navigation',
      expectedType: 'directory',
      required: true,
      readonly: true,
    },
  ],
};

describe('mount manifest contract', () => {
  test('accepts the minimal private-local manifest', () => {
    const result = parseMountManifest(manifest);

    expect(result).toEqual({ ok: true, value: manifest });
  });

  test('rejects unknown fields and unsupported profiles before use', () => {
    const result = parseMountManifest({ ...manifest, profile: 'shared-runtime', extra: true });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toEqual(['unknown-field', 'unsupported-profile']);
    }
  });

  test('rejects duplicate mount ids and malformed mount fields', () => {
    const result = parseMountManifest({
      ...manifest,
      mounts: [
        manifest.mounts[0],
        { ...manifest.mounts[0] },
        { ...manifest.mounts[0], source: '', required: 'yes' },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain('duplicate-id');
      expect(result.errors.map((error) => error.code)).toContain('invalid-value');
    }
  });
});

describe('machine-local roots contract', () => {
  test('accepts explicit private-local root aliases', () => {
    const result = parseMachineLocalRoots({
      version: 1,
      roots: {
        'private-assets': { path: '/tmp/synthetic-private-assets', trustDomain: 'private-local' },
      },
    });

    expect(result.ok).toBe(true);
  });

  test('rejects unknown root fields and non-private trust domains', () => {
    const result = parseMachineLocalRoots({
      version: 1,
      roots: {
        assets: { path: '/tmp/synthetic-assets', trustDomain: 'public', extra: 'deny' },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain('unknown-field');
      expect(result.errors.map((error) => error.code)).toContain('invalid-value');
    }
  });
});

describe('mount plan result contract', () => {
  test('accepts a ready plan with writes and keeps', () => {
    const result = validateMountPlanResult({
      status: 'ready',
      errors: [],
      writes: [
        {
          mountId: 'navigation',
          sourcePath: '/tmp/synthetic-private-assets/navigation',
          targetPath: '/tmp/synthetic-checkout/.omp/local/navigation',
          expectedType: 'directory',
          readonly: true,
        },
      ],
      keeps: [],
    });

    expect(result.ok).toBe(true);
    expect(isMountPlanResult(result.ok ? result.value : null)).toBe(true);
  });

  test('accepts a blocked plan with errors and no writes', () => {
    const result = validateMountPlanResult({
      status: 'blocked',
      errors: [
        {
          code: 'unknown-root',
          path: '$.mounts[0].rootId',
          message: 'root alias is not configured',
          mountId: 'navigation',
        },
      ],
      writes: [],
      keeps: [
        {
          mountId: 'existing',
          sourcePath: '/tmp/synthetic-private-assets/existing',
          targetPath: '/tmp/synthetic-checkout/.omp/local/existing',
          expectedType: 'directory',
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  test('rejects blocked plans that contain writes', () => {
    const result = validateMountPlanResult({ status: 'blocked', errors: [], writes: [{}], keeps: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.path)).toContain('$.writes');
    }
  });

  test('rejects ready plans that contain errors', () => {
    const result = validateMountPlanResult({
      status: 'ready',
      errors: [{ code: 'unknown-root' }],
      writes: [],
      keeps: [],
    });

    expect(result.ok).toBe(false);
  });
});
