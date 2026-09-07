import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import registerAgentStatusExtension, {
  evaluateWriteGuard,
  isProtectedBranch,
  isReadOnlyBashCommand,
  type RepoContextReader,
  type RepoResolution,
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
  return async () => ({
    kind: 'repo',
    context: { root: 'C:/repo', branch, defaultBranch, isLinkedWorktree },
  });
}

/** 确证不在任何 Git 仓库里，例如 Multica 派给 agent 的受管工作目录。 */
const outside: RepoContextReader = async () => ({ kind: 'outside' });
/** 说不清所在仓库，守卫必须保守拒绝。 */
const unknown: RepoContextReader = async () => ({ kind: 'unknown' });

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
        kind: 'repo',
        context: {
          root: isProtected ? path.resolve(import.meta.dir, '..', '..') : sessionRoot,
          branch: isProtected ? 'main' : 'feature/guard',
          defaultBranch: 'main',
          isLinkedWorktree: true,
        },
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
    // 这条走的是默认 reader，会真读文件系统，所以要一个确定性的落点。
    //
    // 原来它传 cwd='C:/Workspace/agent-system' 加一个仓内相对路径。那条路径只在
    // 作者本机存在：Windows CI 上会退到 `C:\`，Linux 上 `C:/...` 根本不是绝对路径。
    // 它此前之所以通过，靠的正是「确证仓外 → 拒绝」这个已被本次修掉的行为——
    // 换句话说，测接线的用例在拿一个 bug 当断言依据。
    //
    // 改成就地造一个最小仓：.git 是真目录（即主检出，非 linked worktree），
    // HEAD 指向 main。不调 git，不依赖机器上已有的仓，各平台结果一致。
    const repoRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'guard-wiring-')));
    mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
    writeFileSync(path.join(repoRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
    const result = await handler(
      toolCall('write', { path: path.join(repoRoot, 'src', 'index.ts') }),
      { cwd: repoRoot },
    );
    expect(result).toMatchObject({ block: true });
  });

  test('blocks detached or unclassifiable repository context instead of guessing permission', async () => {
    await expect(evaluateWriteGuard(toolCall('edit', { path: 'src/index.ts' }), 'C:/repo', repoFacts(null))).resolves.toMatchObject({ block: true });
    const blocked = await evaluateWriteGuard(toolCall('write', { path: 'src/index.ts' }), 'C:/repo', unknown);
    expect(blocked).toMatchObject({ block: true });
    expect(blocked?.reason).toContain('repo=unknown');
    expect(blocked?.reason).toContain('无法确认写入目标所在的 Git 仓库状态');
  });

  test('allows writes provably outside every repository, which is what the guard does not govern', async () => {
    // 回归 2026-09-07 的实测故障：Multica 给每个 run 分配的受管工作目录
    // （~/multica_workspaces/<workspace>/<run>/workdir）不是 Git 仓库，旧实现把
    // 「确证仓外」和「说不清」都压成拒绝，于是整条派工路不可用——连只读命令都被拦。
    await expect(evaluateWriteGuard(
      toolCall('write', { path: 'C:/Users/Morni/multica_workspaces/ws/run/workdir/report.md' }),
      'C:/Users/Morni/multica_workspaces/ws/run/workdir',
      outside,
    )).resolves.toBeUndefined();
    await expect(evaluateWriteGuard(
      toolCall('bash', { command: 'multica issue get ERID-1 --output json' }),
      'C:/Users/Morni/multica_workspaces/ws/run/workdir',
      outside,
    )).resolves.toBeUndefined();
  });

  test('does not let an outside target launder a protected-branch target in the same call', async () => {
    // 放行仓外不等于放行整次调用：只要有一个目标落在受管仓的主干上，仍然拒绝。
    //
    // 目标路径必须平台中立：targetDirectories 会 path.resolve 再取最近的现存目录，
    // 而 `C:/...` 在 POSIX 上不是绝对路径，会被解析到 cwd 底下，两个目标于是塌成
    // 同一个——本用例最初就是这样在 Linux CI 上假过的。改用「文件系统根」与「本测试
    // 文件所在目录」这两个各平台都真实存在且必然不同的位置。
    const outsideDir = path.parse(process.cwd()).root;
    const insideDir = import.meta.dir;
    const mixed: RepoContextReader = async (directory) => (
      path.resolve(directory) === path.resolve(outsideDir)
        ? { kind: 'outside' }
        : { kind: 'repo', context: { root: insideDir, branch: 'main', defaultBranch: 'main', isLinkedWorktree: true } }
    );
    const blocked = await evaluateWriteGuard(
      toolCall('write', { paths: [path.join(outsideDir, 'outside.md'), path.join(insideDir, 'inside.ts')] }),
      insideDir,
      mixed,
    );
    expect(blocked).toMatchObject({ block: true });
    expect(blocked?.reason).toContain('repo=outside');
    expect(blocked?.reason).toContain('branch=main');
  });

  test('keeps read-only tools and read-only shell commands available on protected branches', async () => {
    let gitCalls = 0;
    const noGitCalls: RepoContextReader = async () => {
      gitCalls += 1;
      return { kind: 'unknown' } satisfies RepoResolution;
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
      kind: 'repo',
      context: { root: 'C:/repo', branch, defaultBranch: 'main', isLinkedWorktree: true },
    });
    const event = toolCall('edit', { path: 'src/index.ts' });
    await expect(evaluateWriteGuard(event, 'C:/repo', dynamicRunGit)).resolves.toMatchObject({ block: true });
    branch = 'feature/guard';
    await expect(evaluateWriteGuard(event, 'C:/repo', dynamicRunGit)).resolves.toBeUndefined();
  });
});
