import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { materializeClaudeContent } from '../../src/adapters/clients/claude/content-materializer';
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
