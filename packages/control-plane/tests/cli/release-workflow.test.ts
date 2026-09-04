import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('release workflow is registered, pinned, deterministic, and attested', async () => {
  const workflow = await readFile(path.resolve(import.meta.dir, '../../../../.github/workflows/release-configs.yml'), 'utf8');
  const lockfile = await readFile(path.resolve(import.meta.dir, '../../../../bun.lock'), 'utf8');
  // PR 门禁自 PR #41 起统一在 packages-checks.yml；release 工作流只在打 tag / 手动触发时跑。
  expect(workflow).not.toContain('pull_request:');
  const gate = await readFile(path.resolve(import.meta.dir, '../../../../.github/workflows/packages-checks.yml'), 'utf8');
  expect(gate).toContain('package: [control-plane, harness-engine, sk]');
  expect(gate).toContain('bun-version: 1.3.14');
  expect(workflow).toContain('workflow_dispatch:');
  expect(workflow).toContain('bun-version: 1.3.14');
  expect(lockfile).toContain('"packages/control-plane"');
  expect(workflow.match(/run: bun install --frozen-lockfile/g)).toHaveLength(1);
  const topLevel = workflow.slice(0, workflow.indexOf('jobs:'));
  expect(topLevel).toContain('permissions:\n  contents: read');
  expect(topLevel).not.toContain('contents: write');
  expect(workflow).toContain("if: github.event_name == 'push'\n    permissions:\n      attestations: write\n      contents: write\n      id-token: write");
  expect(workflow).toContain('tag version $VERSION does not match package.json $PACKAGE_VERSION');
  expect(workflow).toContain('git merge-base --is-ancestor "$GITHUB_SHA" origin/main');
  expect(workflow).toContain('actions/attest-build-provenance@e8998f949152b193b063cb0ec769d69d929409be');
  expect(workflow).toContain('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1');
  expect(workflow).toContain('oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6');
  expect(workflow).not.toMatch(/uses:\s+\S+@(?![0-9a-f]{40}\b)\S+/);
  expect(workflow).toContain('attestations: write');
  expect(workflow).toContain('id-token: write');
  expect(workflow).toContain('LC_ALL=C sha256sum configs-darwin-arm64 configs-darwin-x64 configs-linux-x64 configs-windows-x64.exe');
  for (const target of ['configs-windows-x64.exe', 'configs-linux-x64', 'configs-darwin-x64', 'configs-darwin-arm64']) expect(workflow).toContain(target);
  expect(workflow).toContain('gh release create "$GITHUB_REF_NAME" packages/control-plane/dist/*');
});
