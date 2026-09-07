import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { doctorMounts, initMountFiles, repairMounts, syncMounts, type MountLifecycleConfig } from '../src/index';

const sandboxes: string[] = [];

function fixture(): { root: string; config: MountLifecycleConfig } {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-mount-lifecycle-'));
  sandboxes.push(root);
  return {
    root,
    config: {
      manifestPath: join(root, 'profile', 'manifest.json'),
      rootsPath: join(root, 'profile', 'roots.json'),
      checkoutRoot: join(root, 'checkout'),
    },
  };
}

afterEach(() => {
  for (const root of sandboxes.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writeProfile(config: MountLifecycleConfig, root: string, target = '.omp/local/navigation'): void {
  mkdirSync(dirname(config.manifestPath), { recursive: true });
  writeFileSync(config.manifestPath, JSON.stringify({
    version: 1,
    profile: 'private-local',
    mounts: [{ id: 'navigation', rootId: 'assets', source: 'navigation', target, expectedType: 'directory', required: true, readonly: true }],
  }));
  writeFileSync(config.rootsPath, JSON.stringify({ version: 1, roots: { assets: { path: root, trustDomain: 'private-local' } } }));
}

describe('private-local lifecycle', () => {
  test('init creates only missing local profile files', () => {
    const { root, config } = fixture();
    const first = initMountFiles({ manifestPath: config.manifestPath, rootsPath: config.rootsPath });
    const second = initMountFiles({ manifestPath: config.manifestPath, rootsPath: config.rootsPath });

    expect(first.created).toEqual([config.manifestPath, config.rootsPath]);
    expect(second.created).toEqual([]);
    expect(second.kept).toEqual([config.manifestPath, config.rootsPath]);
    expect(readFileSync(config.manifestPath, 'utf8')).toContain('private-local');
    expect(existsSync(join(root, 'checkout'))).toBe(false);
  });

  test('sync creates the missing overlay and repeats without changes', () => {
    const { root, config } = fixture();
    const source = join(root, 'navigation');
    mkdirSync(source, { recursive: true });

    writeProfile(config, root);
    const first = syncMounts(config);
    const second = syncMounts(config);
    const target = join(config.checkoutRoot, '.omp/local/navigation');

    expect(first.status).toBe('synced');
    expect(first.created).toEqual([target]);
    expect(second.status).toBe('synced');
    expect(second.created).toEqual([]);
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
  });

  test('blocked planning produces no partial links', () => {
    const { root, config } = fixture();
    writeProfile(config, root, '.omp/local/first');
    const manifest = JSON.parse(readFileSync(config.manifestPath, 'utf8')) as { mounts: Array<Record<string, unknown>> };
    manifest.mounts.push({ ...manifest.mounts[0], id: 'second', source: 'second', target: '.omp/local/second' });
    writeFileSync(config.manifestPath, JSON.stringify(manifest));
    writeFileSync(join(root, 'first'), 'synthetic');

    const result = syncMounts(config);

    expect(result.status).toBe('blocked');
    expect(result.created).toEqual([]);
    expect(existsSync(join(config.checkoutRoot, '.omp/local/first'))).toBe(false);
  });

  test('sync does not replace occupied targets; repair replaces only wrong links', () => {
    const { root, config } = fixture();
    writeProfile(config, root);
    writeFileSync(join(root, 'navigation'), 'synthetic');
    const target = join(config.checkoutRoot, '.omp/local/navigation');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'user file');
    const occupied = syncMounts(config);
    expect(occupied.status).toBe('blocked');
    expect(readFileSync(target, 'utf8')).toBe('user file');

    const other = join(root, 'other');
    rmSync(target);
    symlinkSync(other, target);
    const repaired = repairMounts(config);
    expect(repaired.status).toBe('synced');
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
  });

  test('doctor reports missing local roots without throwing', () => {
    const { root, config } = fixture();
    writeProfile(config, root);
    writeFileSync(config.rootsPath, JSON.stringify({ version: 1, roots: {} }));

    const result = doctorMounts(config);

    expect(result.status).toBe('unavailable');
    expect(result.message).toBe('private overlay unavailable');
  });
});
