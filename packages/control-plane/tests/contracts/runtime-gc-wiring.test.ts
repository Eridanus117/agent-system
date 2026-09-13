import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, utimesSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDeps } from '../../src/cli/index';
import { SqliteStore } from '../../src/adapters/sqlite/store';

function olden(filePath: string, ageMs: number): void {
  const seconds = (Date.now() - ageMs) / 1000;
  utimesSync(filePath, seconds, seconds);
}

async function writeExpiredContext(databasePath: string): Promise<string> {
  const contextDirectory = path.join(path.dirname(databasePath), 'launch-context');
  await mkdir(contextDirectory, { recursive: true });
  const contextPath = path.join(contextDirectory, 'expired-wiring.json');
  await writeFile(contextPath, JSON.stringify({
    version: 1,
    operationId: 'op-wiring',
    lifecycle: { state: 'prepared', ownerPid: 999999, leaseExpiresAt: '2000-01-01T00:00:00.000Z' },
  }));
  olden(contextPath, 2 * 24 * 60 * 60 * 1000);
  return contextPath;
}

describe('runtime garbage collection wiring', () => {
  test('openDeps runs one safe GC pass before opening a persistent writable store and exposes counts', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'agent-system-runtime-gc-wiring-'));
    const databasePath = path.join(root, 'control-plane.sqlite3');
    try {
      const contextPath = await writeExpiredContext(databasePath);
      const deps = openDeps({ databasePath });
      try {
        expect(deps.runtimeGarbageCollection.contextScanned).toBe(1);
        expect(deps.runtimeGarbageCollection.contextRemoved).toBe(1);
        expect(existsSync(contextPath)).toBe(false);
      } finally {
        deps.store.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('openDeps skips GC for memory and read-only stores', async () => {
    const memoryDeps = openDeps({ databasePath: ':memory:' });
    expect(memoryDeps.runtimeGarbageCollection).toEqual({ contextScanned: 0, contextRemoved: 0, stagingScanned: 0, stagingRemoved: 0, lockRemoved: 0, errors: 0 });
    memoryDeps.store.close();

    const root = mkdtempSync(path.join(os.tmpdir(), 'agent-system-runtime-gc-readonly-'));
    const databasePath = path.join(root, 'control-plane.sqlite3');
    try {
      const seed = new SqliteStore(databasePath);
      seed.close();
      const contextPath = await writeExpiredContext(databasePath);
      const readOnlyDeps = openDeps({ databasePath, readOnly: true });
      try {
        expect(readOnlyDeps.runtimeGarbageCollection).toEqual({ contextScanned: 0, contextRemoved: 0, stagingScanned: 0, stagingRemoved: 0, lockRemoved: 0, errors: 0 });
        expect(existsSync(contextPath)).toBe(true);
      } finally {
        readOnlyDeps.store.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
