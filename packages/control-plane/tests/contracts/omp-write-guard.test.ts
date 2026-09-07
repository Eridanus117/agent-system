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
): RepoContextReader {
  return async () => ({ root: 'C:/repo', branch, defaultBranch });
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
    await expect(evaluateWriteGuard(event, 'C:/repo', repoFacts('main'))).resolves.toMatchObject({ block: true });
    await expect(evaluateWriteGuard(event, 'C:/repo', repoFacts('feature/guard'))).resolves.toBeUndefined();
  });

  test('checks the repository owning a direct target path instead of trusting session cwd', async () => {
    const readRepoContext: RepoContextReader = async (directory) => {
      const isProtected = directory.includes('agent-system');
      return {
        root: isProtected ? 'C:/protected' : 'C:/feature',
        branch: isProtected ? 'main' : 'feature/guard',
        defaultBranch: 'main',
      };
    };
    await expect(evaluateWriteGuard(
      toolCall('write', { path: 'C:/Workspace/agent-system/packages/control-plane/src/index.ts' }),
      'C:/Workspace/worktrees/agent-system/branch-write-guard',
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
    const previousLaunchContext = process.env.AGENT_SYSTEM_LAUNCH_CONTEXT;
    delete process.env.AGENT_SYSTEM_LAUNCH_CONTEXT;
    const unguarded = handler(
      toolCall('write', { path: 'packages/control-plane/src/index.ts' }),
      { cwd: 'C:/Workspace/agent-system' },
    );
    if (previousLaunchContext === undefined) delete process.env.AGENT_SYSTEM_LAUNCH_CONTEXT;
    else process.env.AGENT_SYSTEM_LAUNCH_CONTEXT = previousLaunchContext;
    await expect(unguarded).resolves.toBeUndefined();

    const beforeGuardedCall = process.env.AGENT_SYSTEM_LAUNCH_CONTEXT;
    process.env.AGENT_SYSTEM_LAUNCH_CONTEXT = 'test-context';
    const guarded = handler(
      toolCall('write', { path: 'packages/control-plane/src/index.ts' }),
      { cwd: 'C:/Workspace/agent-system' },
    );
    if (beforeGuardedCall === undefined) delete process.env.AGENT_SYSTEM_LAUNCH_CONTEXT;
    else process.env.AGENT_SYSTEM_LAUNCH_CONTEXT = beforeGuardedCall;
    await expect(guarded).resolves.toMatchObject({ block: true });
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
    expect(isReadOnlyBashCommand('git commit -am change')).toBe(false);
  });

  test('rechecks the branch on every write so a branch switch takes effect immediately', async () => {
    let branch: string | null = 'main';
    const dynamicRunGit: RepoContextReader = async () => ({
      root: 'C:/repo',
      branch,
      defaultBranch: 'main',
    });
    const event = toolCall('edit', { path: 'src/index.ts' });
    await expect(evaluateWriteGuard(event, 'C:/repo', dynamicRunGit)).resolves.toMatchObject({ block: true });
    branch = 'feature/guard';
    await expect(evaluateWriteGuard(event, 'C:/repo', dynamicRunGit)).resolves.toBeUndefined();
  });
});
