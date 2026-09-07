import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import registerAgentStatusExtension, {
  evaluateWriteGuard,
  isProtectedBranch,
  isReadOnlyBashCommand,
  type RepoContextReader,
} from '../../src/adapters/omp/extensions/agent-status-extension';

type ToolCall = Parameters<typeof evaluateWriteGuard>[0];

function toolCall(toolName: string, input: Record<string, unknown> = {}): ToolCall {
  return { type: 'tool_call', toolName, toolCallId: 'test-call', input };
}

function repoFacts(
  branch: string | null,
  defaultBranch: string | null = 'main',
  isLinkedWorktree = true,
): RepoContextReader {
  return async () => ({ root: 'C:/repo', branch, defaultBranch, isLinkedWorktree });
}

describe('OMP branch-aware write guard', () => {
  test('recognizes configured defaults and the standard protected branch names', () => {
    expect(isProtectedBranch('main')).toBe(true);
    expect(isProtectedBranch('refs/heads/master')).toBe(true);
    expect(isProtectedBranch('release', 'release')).toBe(true);
    expect(isProtectedBranch('feature/guard', 'release')).toBe(false);
  });

  test('blocks direct writes on a protected branch and allows a task branch', async () => {
    const event = toolCall('write', { path: 'src/index.ts' });
    const blocked = await evaluateWriteGuard(event, 'C:/repo', repoFacts('main'));
    expect(blocked).toMatchObject({ block: true });
    expect(blocked?.reason).toContain('branch=main');
    expect(blocked?.reason).toContain('origin-default=main');
    expect(blocked?.reason).toContain('不要在当前 cwd 重试');
    await expect(evaluateWriteGuard(event, 'C:/repo', repoFacts('feature/guard'))).resolves.toBeUndefined();
  });

  test('explains that the main worktree, not only the branch, is the blocker', async () => {
    const blocked = await evaluateWriteGuard(
      toolCall('edit', { path: 'src/index.ts' }),
      'C:/repo',
      repoFacts('feature/guard', 'main', false),
    );
    expect(blocked).toMatchObject({ block: true });
    expect(blocked?.reason).toContain('branch=feature/guard');
    expect(blocked?.reason).toContain('worktree=main');
    expect(blocked?.reason).toContain('先确认主干事实');
  });

  test('checks the repository owning a direct target path instead of trusting session cwd', async () => {
    const targetPath = path.resolve(import.meta.dir, '..', '..', 'src', 'index.ts');
    const sessionRoot = path.parse(process.cwd()).root;
    const readRepoContext: RepoContextReader = async (directory) => {
      const isProtected = directory.toLowerCase().includes('control-plane');
      return {
        root: isProtected ? path.resolve(import.meta.dir, '..', '..') : sessionRoot,
        branch: isProtected ? 'main' : 'feature/guard',
        defaultBranch: 'main',
        isLinkedWorktree: true,
      };
    };
    await expect(evaluateWriteGuard(
      toolCall('write', { path: targetPath }),
      sessionRoot,
      readRepoContext,
    )).resolves.toMatchObject({ block: true });
  });

  test('wires the blocking guard into the OMP tool_call extension event', async () => {
    type ExtensionApi = Parameters<typeof registerAgentStatusExtension>[0];
    type ToolHandler = (event: ToolCall, context: { readonly cwd: string }) => Promise<unknown>;
    let handler: ToolHandler | undefined;
    const api = {
      on(event: string, callback: ToolHandler): void {
        if (event === 'tool_call') handler = callback;
      },
      registerCommand(): void {},
    } as unknown as ExtensionApi;
    registerAgentStatusExtension(api);
    if (handler === undefined) throw new Error('tool_call handler was not registered');
    const result = await handler(
      toolCall('write', { path: 'packages/control-plane/src/index.ts' }),
      { cwd: 'C:/Workspace/agent-system' },
    );
    expect(result).toMatchObject({ block: true });
  });

  test('blocks unknown or detached repository context instead of guessing permission', async () => {
    await expect(evaluateWriteGuard(toolCall('edit', { path: 'src/index.ts' }), 'C:/not-a-repo', repoFacts(null))).resolves.toMatchObject({ block: true });
    await expect(evaluateWriteGuard(toolCall('write', { path: 'src/index.ts' }), 'C:/repo', async () => null)).resolves.toMatchObject({ block: true });
  });

  test('keeps read-only tools and read-only shell commands available on protected branches', async () => {
    let gitCalls = 0;
    const noGitCalls: RepoContextReader = async () => {
      gitCalls += 1;
      return null;
    };
    await expect(evaluateWriteGuard(toolCall('read', { path: 'src/index.ts' }), 'C:/repo', noGitCalls)).resolves.toBeUndefined();

    await expect(evaluateWriteGuard(toolCall('bash', { command: 'git status --short && git diff --stat' }), 'C:/repo', repoFacts('main'))).resolves.toBeUndefined();
    expect(gitCalls).toBe(0);
    expect(isReadOnlyBashCommand('git show-ref --heads --remotes')).toBe(true);
    expect(isReadOnlyBashCommand('git config --get-regexp "^(branch|remote\\.origin\\.)"')).toBe(true);
    expect(isReadOnlyBashCommand('git rev-list --left-right --count main...feature')).toBe(true);
    expect(isReadOnlyBashCommand('git merge-base --is-ancestor main feature')).toBe(true);
    expect(isReadOnlyBashCommand('git commit -am change')).toBe(false);
  });
  test('distinguishes an unclassified shell command from a transient write failure', async () => {
    const blocked = await evaluateWriteGuard(
      toolCall('bash', { command: 'git commit -am change' }),
      'C:/repo',
      repoFacts('feature/guard', 'main', false),
    );
    expect(blocked).toMatchObject({ block: true });
    expect(blocked?.reason).toContain('shell 命令未被守卫证明为只读');
    expect(blocked?.reason).toContain('不要重复重试同一命令');
  });

  test('keeps read-only GitHub device calls available without allowing remote mutations', async () => {
    const readOnlyGitHubCall = toolCall('write', {
      path: 'xd://github',
      content: JSON.stringify({ op: 'repo_view' }),
    });
    await expect(evaluateWriteGuard(readOnlyGitHubCall, 'C:/repo', repoFacts('main'))).resolves.toBeUndefined();
    await expect(evaluateWriteGuard(toolCall('write', {
      path: 'xd://github',
      content: JSON.stringify({ op: 'pr_merge', pr: '52' }),
    }), 'C:/repo', repoFacts('main'))).resolves.toMatchObject({ block: true });
  });

  test('rechecks the branch on every write so a branch switch takes effect immediately', async () => {
    let branch: string | null = 'main';
    const dynamicRunGit: RepoContextReader = async () => ({
      root: 'C:/repo',
      branch,
      defaultBranch: 'main',
      isLinkedWorktree: true,
    });
    const event = toolCall('edit', { path: 'src/index.ts' });
    await expect(evaluateWriteGuard(event, 'C:/repo', dynamicRunGit)).resolves.toMatchObject({ block: true });
    branch = 'feature/guard';
    await expect(evaluateWriteGuard(event, 'C:/repo', dynamicRunGit)).resolves.toBeUndefined();
  });
});
