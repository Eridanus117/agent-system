import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { materializeClaudeContent } from '../../src/adapters/clients/claude/content-materializer';
import { OmpAgentAdapter } from '../../src/adapters/clients/agent-adapters';
import { buildOmpArgv, findDenylistedForwardedArg } from '../../src/adapters/omp/process-port';
import { configurationName, configurationRevisionId, type ConfigurationRevision } from '../../src/domain/configuration';
const defineRevision = (capabilities: ConfigurationRevision['capabilities']): ConfigurationRevision => ({
  configName: configurationName('default'),
  revisionId: configurationRevisionId('rev-adapter-test'),
  schemaVersion: 1,
  defaultMarker: { kind: 'known', value: true },
  scopeBoundary: { kind: 'known', value: 'project' },
  availability: { kind: 'known', value: 'resolved' },
  capabilities,
  createdAt: '2026-08-29T00:00:00.000Z',
  triggerCategory: 'new-scenario',
  evidenceRef: 'tests/contracts/agent-adapters.test.ts',
  supersedesRevisionId: null,
});

describe('agent adapter contracts', () => {
  test('builds isolated OMP argv and rejects forwarded control flags', () => {
    const revision = defineRevision([]);
    expect(buildOmpArgv(revision, 'context.json', 'extension.ts', ['--verbose'])).toEqual(['--no-extensions', '-e', 'extension.ts', '--no-skills', '--verbose']);
    expect(findDenylistedForwardedArg(['--verbose', '--profile=unsafe'])).toBe('--profile=unsafe');
  });

  test('records a lease for each prepared OMP launch context', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'control-plane-launch-context-'));
    const previousDbPath = process.env.CONTROL_PLANE_DB_PATH;
    process.env.CONTROL_PLANE_DB_PATH = path.join(root, 'control-plane.sqlite3');
    try {
      const revision = defineRevision([]);
      const adapter = new OmpAgentAdapter();
      const prepared = await adapter.prepare({ operationId: 'operation-lease', revision });
      const contextPath = String(prepared.context.contextPath);
      const context = JSON.parse(readFileSync(contextPath, 'utf8')) as {
        lifecycle?: { state?: string; ownerPid?: number; leaseExpiresAt?: string };
      };
      expect(context.lifecycle?.state).toBe('prepared');
      expect(context.lifecycle?.ownerPid).toBe(process.pid);
      expect(Date.parse(context.lifecycle?.leaseExpiresAt ?? '')).toBeGreaterThan(Date.now());
      await adapter.abort({ operationId: 'operation-lease', revision, prepared });
      expect(existsSync(contextPath)).toBe(false);
    } finally {
      if (previousDbPath === undefined) delete process.env.CONTROL_PLANE_DB_PATH;
      else process.env.CONTROL_PLANE_DB_PATH = previousDbPath;
      await rm(root, { recursive: true, force: true });
    }
  });

  test('fails closed on colliding Claude skill materialization names', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'control-plane-supply-'));
    const invocationDir = await mkdtemp(path.join(os.tmpdir(), 'control-plane-invocation-'));
    const previousRoot = process.env.CONTROL_PLANE_SUPPLY_ROOT;
    try {
      process.env.CONTROL_PLANE_SUPPLY_ROOT = root;
      await mkdir(path.join(root, 'first'), { recursive: true });
      await mkdir(path.join(root, 'second'), { recursive: true });
      await writeFile(path.join(root, 'first', 'SKILL.md'), 'first');
      await writeFile(path.join(root, 'second', 'SKILL.md'), 'second');
      const result = await materializeClaudeContent(defineRevision([
        { kind: 'skill', name: 'a/b', source: 'project-capability', summary: undefined, sourceRef: 'first', contentFingerprint: undefined },
        { kind: 'skill', name: 'a_b', source: 'project-capability', summary: undefined, sourceRef: 'second', contentFingerprint: undefined },
      ]), invocationDir);
      expect(result.skills.pluginDirPath).not.toBeNull();
      expect(result.skills.failures).toHaveLength(1);
      expect(result.skills.failures[0]?.reason).toBe('技能名称映射冲突');
    } finally {
      if (previousRoot === undefined) delete process.env.CONTROL_PLANE_SUPPLY_ROOT;
      else process.env.CONTROL_PLANE_SUPPLY_ROOT = previousRoot;
      await rm(root, { recursive: true, force: true });
      await rm(invocationDir, { recursive: true, force: true });
    }
  });
});
