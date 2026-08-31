import { afterEach, describe, expect, test } from 'bun:test';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { materializeClaudeContent } from '../../src/adapters/clients/claude/content-materializer';
import { ClaudeAgentAdapter } from '../../src/adapters/clients/agent-adapters';
import { configurationName, configurationRevisionId, type ConfigurationRevision } from '../../src/domain/configuration';

describe('materializeClaudeContent', () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    delete process.env.CONTROL_PLANE_DB_PATH;
    delete process.env.CONTROL_PLANE_SUPPLY_ROOT;
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  test('projects role instructions and skills into an invocation directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'control-plane-claude-materializer-'));
    temporaryRoots.push(root);
    const roleRoot = path.join(root, 'roles', 'coder');
    const invocationDir = path.join(root, 'invocation');
    await mkdir(path.join(roleRoot, 'skills', 'minimal-change'), { recursive: true });
    await mkdir(invocationDir, { recursive: true });
    await writeFile(path.join(roleRoot, 'memory.md'), '只做聚焦修改。\n', 'utf8');
    await writeFile(path.join(roleRoot, 'skills', 'minimal-change', 'SKILL.md'), '---\nname: minimal-change\ndescription: focused changes\n---\n\n执行最小改动。\n', 'utf8');
    process.env.CONTROL_PLANE_SUPPLY_ROOT = root;
    process.env.CONTROL_PLANE_DB_PATH = path.join(root, 'control-plane.sqlite3');

    const revision: ConfigurationRevision = {
      configName: configurationName('coder-session'),
      revisionId: configurationRevisionId('revision-1'),
      schemaVersion: 1,
      defaultMarker: { kind: 'unknown', reason: 'test', observedAt: new Date().toISOString() },
      scopeBoundary: { kind: 'known', value: 'test' },
      availability: { kind: 'known', value: 'resolved' },
      capabilities: [
        { kind: 'instruction', name: 'agentroles.coder:memory.md', source: 'project-capability', summary: 'memory', sourceRef: 'roles/coder/memory.md', contentFingerprint: 'sha256:test' },
        { kind: 'skill', name: 'minimal-change', source: 'project-capability', summary: 'skill', sourceRef: 'roles/coder/skills/minimal-change', contentFingerprint: 'sha256:test' },
      ],
      createdAt: new Date().toISOString(),
      triggerCategory: 'new-scenario',
      evidenceRef: 'test',
      supersedesRevisionId: null,
    };
    const result = await materializeClaudeContent(revision, invocationDir);

    const adapter = new ClaudeAgentAdapter();
    const prepared = await adapter.prepare({ operationId: 'operation-1', revision });
    expect(prepared.manifestHash).toMatch(/^[0-9a-f]{64}$/u);
    await adapter.abort?.({ operationId: 'operation-1', revision, prepared });
    expect(result.instructions.appendSystemPromptText).toBe('只做聚焦修改。\n');
    expect(result.instructions.failures).toHaveLength(0);
    expect(result.skills.failures).toHaveLength(0);
    expect(result.skills.pluginDirPath).not.toBeNull();
    const pluginManifest = path.join(result.skills.pluginDirPath!, '.claude-plugin', 'plugin.json');
    const projectedSkill = path.join(result.skills.pluginDirPath!, 'skills', 'minimal-change', 'SKILL.md');
    await access(pluginManifest);
    await access(projectedSkill);
    expect(JSON.parse(await readFile(pluginManifest, 'utf8'))).toMatchObject({ name: 'agent-system-materialized-skills', skills: './skills/' });
    expect(await readFile(projectedSkill, 'utf8')).toContain('执行最小改动');
  });

  test('reports missing required content without creating a successful projection', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'control-plane-claude-materializer-'));
    process.env.CONTROL_PLANE_DB_PATH = path.join(root, 'control-plane.sqlite3');
    const invocationDir = path.join(root, 'invocation');
    await mkdir(invocationDir, { recursive: true });
    process.env.CONTROL_PLANE_SUPPLY_ROOT = root;

    const revision: ConfigurationRevision = {
      configName: configurationName('missing'),
      revisionId: configurationRevisionId('revision-1'),
      schemaVersion: 1,
      defaultMarker: { kind: 'unknown', reason: 'test', observedAt: new Date().toISOString() },
      scopeBoundary: { kind: 'known', value: 'test' },
      availability: { kind: 'known', value: 'resolved' },
      capabilities: [{ kind: 'instruction', name: 'missing', source: 'project-capability', summary: 'missing', sourceRef: 'roles/missing.md', contentFingerprint: undefined }],
      createdAt: new Date().toISOString(),
      triggerCategory: 'new-scenario',
      evidenceRef: 'test',
      supersedesRevisionId: null,
    };
    const result = await materializeClaudeContent(revision, invocationDir);

    expect(result.instructions.appendSystemPromptText).toBeNull();
    expect(result.instructions.failures).toHaveLength(1);
    await expect(new ClaudeAgentAdapter().prepare({ operationId: 'operation-missing', revision })).rejects.toThrow('content-materialization-failed');
  });
});

