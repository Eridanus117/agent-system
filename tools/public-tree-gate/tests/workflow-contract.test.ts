import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const workflowPath = join(import.meta.dir, '../../../.github/workflows/public-tree-gate.yml');

async function workflowText(): Promise<string> {
  return Bun.file(workflowPath).text();
}

describe('public tree gate workflow', () => {
  test('keeps the gate read-only and wired to the adapter and fixtures', async () => {
    const workflow = await workflowText();

    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).toContain('bun tools/public-tree-gate/index.ts');
    expect(workflow).toContain('bun test tools/public-tree-gate/tests');
  });
});
