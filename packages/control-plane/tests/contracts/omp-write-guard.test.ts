import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import registerAgentStatusExtension, {
  evaluateWriteGuard,
  isProtectedBranch,
  isReadOnlyBashCommand,
  WRITE_POLICY_FILE,
  type RepoResolution,
  type RepoResolver,
} from '../../src/adapters/omp/extensions/agent-status-extension';

type ToolCall = Parameters<typeof evaluateWriteGuard>[0];

function toolCall(toolName: string, input: Record<string, unknown> = {}): ToolCall {
  return { type: 'tool_call', toolName, toolCallId: 'test-call', input };
}

/** 注入一个「所有目标都属于同一个仓」的解析器。 */
function repoFacts(
  branch: string | null,
  defaultBranch: string | null = 'main',
  isLinkedWorktree = true,
  directWritePaths: readonly string[] = [],
): RepoResolver {
  return async () => ({
    kind: 'repo',
    context: { root: 'C:/repo', branch, defaultBranch, isLinkedWorktree, directWritePaths },
  });
}

function normalize(directory: string): string {
  return directory.split('\\').join('/').toLowerCase();
}

/**
 * 注入一个双仓解析器：`C:/trunk-checkout` 是主检出且在 main 上，
 * 其余一律视为任务分支上的 linked worktree。
 */
const trunkAndTaskWorktree: RepoResolver = async (directory) => {
  if (normalize(directory).includes('/trunk-checkout')) {
    return {
      kind: 'repo',
      context: {
        root: 'C:/trunk-checkout',
        branch: 'main',
        defaultBranch: 'main',
        isLinkedWorktree: false,
      },
    };
  }
  return {
    kind: 'repo',
    context: {
      root: 'C:/worktrees/task',
      branch: 'feature/guard',
      defaultBranch: 'main',
      isLinkedWorktree: true,
    },
  };
};

/** 建一个最小的假仓库检出，用于走真实解析器的端到端用例。 */
function makeCheckout(branch: string, policy?: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  mkdirSync(path.join(root, '.git'), { recursive: true });
  writeFileSync(path.join(root, '.git', 'HEAD'), `ref: refs/heads/${branch}\n`, 'utf8');
  if (policy !== undefined) {
    writeFileSync(path.join(root, WRITE_POLICY_FILE), JSON.stringify(policy), 'utf8');
  }
  return root;
}

describe('OMP write guard：判定对象是写入目标，不是会话 cwd', () => {
  test('识别标准受保护分支名与配置的默认分支', () => {
    expect(isProtectedBranch('main')).toBe(true);
    expect(isProtectedBranch('refs/heads/master')).toBe(true);
    expect(isProtectedBranch('release', 'release')).toBe(true);
    expect(isProtectedBranch('feature/guard', 'release')).toBe(false);
  });

  test('受保护分支上拒绝直接写入，任务分支放行', async () => {
    const event = toolCall('write', { path: 'src/index.ts' });
    const blocked = await evaluateWriteGuard(event, 'C:/repo', repoFacts('main'));
    expect(blocked).toMatchObject({ block: true });
    expect(blocked?.reason).toContain('branch=main');
    expect(blocked?.reason).toContain('origin-default=main');
    await expect(evaluateWriteGuard(event, 'C:/repo', repoFacts('feature/guard'))).resolves.toBeUndefined();
  });

  test('主检出即便在任务分支上也拒绝，理由里说清是 worktree 而不只是分支', async () => {
    const blocked = await evaluateWriteGuard(
      toolCall('edit', { path: 'src/index.ts' }),
      'C:/repo',
      repoFacts('feature/guard', 'main', false),
    );
    expect(blocked).toMatchObject({ block: true });
    expect(blocked?.reason).toContain('worktree=main');
  });

  test('按目标所属仓库判定，不信任会话 cwd', async () => {
    const targetPath = path.resolve(import.meta.dir, '..', '..', 'src', 'index.ts');
    const sessionRoot = path.parse(process.cwd()).root;
    const readRepoContext: RepoResolver = async (directory) => {
      const isProtected = normalize(directory).includes('control-plane');
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

  test('已注册到 OMP 的 tool_call 事件上', async () => {
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
});

describe('OMP write guard：bash 与结构化工具走同一条判定路径', () => {
  test('bash 的 cp 写进受保护检出时被拒绝', async () => {
    const blocked = await evaluateWriteGuard(
      toolCall('bash', { command: 'cp /tmp/x C:/trunk-checkout/AGENTS.md' }),
      'C:/worktrees/task',
      trunkAndTaskWorktree,
    );
    expect(blocked).toMatchObject({ block: true });
    expect(blocked?.reason).toContain('trunk-checkout');
  });

  test('bash 的输出重定向写进受保护检出时被拒绝', async () => {
    await expect(evaluateWriteGuard(
      toolCall('bash', { command: 'echo x >> C:/trunk-checkout/AGENTS.md' }),
      'C:/worktrees/task',
      trunkAndTaskWorktree,
    )).resolves.toMatchObject({ block: true });
  });

  test('bash 的 cd 会改变有效 cwd，cd 到受保护检出后提交被拒绝', async () => {
    await expect(evaluateWriteGuard(
      toolCall('bash', { command: 'cd C:/trunk-checkout && git commit -am x' }),
      'C:/worktrees/task',
      trunkAndTaskWorktree,
    )).resolves.toMatchObject({ block: true });
  });

  test('sed -i 不再被判为只读，并按其目标判定', async () => {
    expect(isReadOnlyBashCommand("sed -i 's/a/b/' file.md")).toBe(false);
    await expect(evaluateWriteGuard(
      toolCall('bash', { command: "sed -i 's/a/b/' C:/trunk-checkout/AGENTS.md" }),
      'C:/worktrees/task',
      trunkAndTaskWorktree,
    )).resolves.toMatchObject({ block: true });
  });

  test('bash 在自己的任务 worktree 内写入仍然放行', async () => {
    await expect(evaluateWriteGuard(
      toolCall('bash', { command: 'cp /tmp/x C:/worktrees/task/note.md' }),
      'C:/worktrees/task',
      trunkAndTaskWorktree,
    )).resolves.toBeUndefined();
  });

  test('提取不出目标的 bash 命令仍按有效 cwd 判定，不因此放宽', async () => {
    await expect(evaluateWriteGuard(
      toolCall('bash', { command: 'node scripts/build.js' }),
      'C:/trunk-checkout',
      trunkAndTaskWorktree,
    )).resolves.toMatchObject({ block: true });
  });
});

describe('OMP write guard：仓库解析三态', () => {
  test('确证在任何仓库之外的结构化写入放行', async () => {
    const outside: RepoResolver = async () => ({ kind: 'outside' });
    await expect(evaluateWriteGuard(
      toolCall('edit', { path: 'C:/Users/example/.config/app/settings.toml' }),
      'C:/worktrees/task',
      outside,
    )).resolves.toBeUndefined();
  });

  test('无法确认归属时拒绝，且理由与「确证仓外」区分开', async () => {
    const unknown: RepoResolver = async () => ({ kind: 'unknown', reason: '.git 存在但无法解析' });
    const blocked = await evaluateWriteGuard(
      toolCall('write', { path: 'src/index.ts' }),
      'C:/repo',
      unknown,
    );
    expect(blocked).toMatchObject({ block: true });
    expect(blocked?.reason).toContain('repo=unknown');
    expect(blocked?.reason).not.toContain('repo=none');
  });

  test('分支无法确认（detached 或 HEAD 不可读）时拒绝', async () => {
    await expect(evaluateWriteGuard(
      toolCall('edit', { path: 'src/index.ts' }),
      'C:/repo',
      repoFacts(null),
    )).resolves.toMatchObject({ block: true });
  });

  test('多目标中混入受保护或未知目标时整次拒绝', async () => {
    const mixed: RepoResolver = async (directory) =>
      normalize(directory).includes('/trunk-checkout')
        ? { kind: 'unknown', reason: '无法读取 .git' }
        : {
          kind: 'repo',
          context: {
            root: 'C:/worktrees/task',
            branch: 'feature/guard',
            defaultBranch: 'main',
            isLinkedWorktree: true,
          },
        } satisfies RepoResolution;
    await expect(evaluateWriteGuard(
      toolCall('write', { paths: ['C:/worktrees/task/a.ts', 'C:/trunk-checkout/b.ts'] }),
      'C:/worktrees/task',
      mixed,
    )).resolves.toMatchObject({ block: true });
  });
});

describe('OMP write guard：仓级写入策略', () => {
  test('声明为可直写的路径即便在 main 的主检出上也放行，未声明的路径仍拒绝', async () => {
    const root = makeCheckout('main', { schemaVersion: 1, directWritePaths: ['logs/'] });
    mkdirSync(path.join(root, 'logs'), { recursive: true });
    await expect(evaluateWriteGuard(
      toolCall('write', { path: path.join(root, 'logs', 'day.md') }),
      root,
    )).resolves.toBeUndefined();
    await expect(evaluateWriteGuard(
      toolCall('write', { path: path.join(root, 'src', 'index.ts') }),
      root,
    )).resolves.toMatchObject({ block: true });
  });

  test('策略文件损坏时回落到全仓保护，不因解析失败而放宽', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'guard-'));
    mkdirSync(path.join(root, '.git'), { recursive: true });
    writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
    writeFileSync(path.join(root, WRITE_POLICY_FILE), '{ this is not json', 'utf8');
    mkdirSync(path.join(root, 'logs'), { recursive: true });
    await expect(evaluateWriteGuard(
      toolCall('write', { path: path.join(root, 'logs', 'day.md') }),
      root,
    )).resolves.toMatchObject({ block: true });
  });

  test('没有策略文件的仓库行为与今天一致：全仓保护', async () => {
    const root = makeCheckout('main');
    await expect(evaluateWriteGuard(
      toolCall('write', { path: path.join(root, 'logs', 'day.md') }),
      root,
    )).resolves.toMatchObject({ block: true });
  });

  test('声明前缀不做子串匹配，logs 不会顺带放行 logs-archive', async () => {
    const root = makeCheckout('main', { schemaVersion: 1, directWritePaths: ['logs/'] });
    await expect(evaluateWriteGuard(
      toolCall('write', { path: path.join(root, 'logs-archive', 'day.md') }),
      root,
    )).resolves.toMatchObject({ block: true });
  });
});

describe('OMP write guard：真实路径解析', () => {
  test('经 junction 指入受保护检出的目标按真实归属拒绝', async () => {
    const base = mkdtempSync(path.join(os.tmpdir(), 'guard-link-'));
    const repo = path.join(base, 'repo');
    mkdirSync(path.join(repo, '.git'), { recursive: true });
    writeFileSync(path.join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
    const link = path.join(base, 'link');
    try {
      symlinkSync(repo, link, 'junction');
    } catch {
      return; // 该平台不支持 junction 时跳过，不伪造通过
    }
    await expect(evaluateWriteGuard(
      toolCall('write', { path: path.join(link, 'src', 'index.ts') }),
      base,
    )).resolves.toMatchObject({ block: true });
  });
});

describe('OMP write guard：只读路径保持可用', () => {
  test('只读工具与只读 shell 命令在受保护分支上仍可用，且不触发 Git 读取', async () => {
    let resolverCalls = 0;
    const counting: RepoResolver = async () => {
      resolverCalls += 1;
      return { kind: 'unknown', reason: 'should not be reached' };
    };
    await expect(evaluateWriteGuard(toolCall('read', { path: 'src/index.ts' }), 'C:/repo', counting)).resolves.toBeUndefined();
    await expect(evaluateWriteGuard(
      toolCall('bash', { command: 'git status --short && git diff --stat' }),
      'C:/repo',
      counting,
    )).resolves.toBeUndefined();
    expect(resolverCalls).toBe(0);
    expect(isReadOnlyBashCommand('git show-ref --heads --remotes')).toBe(true);
    expect(isReadOnlyBashCommand('git config --get-regexp "^(branch|remote\\.origin\\.)"')).toBe(true);
    expect(isReadOnlyBashCommand('git rev-list --left-right --count main...feature')).toBe(true);
    expect(isReadOnlyBashCommand('git merge-base --is-ancestor main feature')).toBe(true);
    expect(isReadOnlyBashCommand('git commit -am change')).toBe(false);
  });

  test('未分类的 shell 命令给出可执行的恢复提示，而不是暗示重试', async () => {
    const blocked = await evaluateWriteGuard(
      toolCall('bash', { command: 'git commit -am change' }),
      'C:/repo',
      repoFacts('feature/guard', 'main', false),
    );
    expect(blocked).toMatchObject({ block: true });
    expect(blocked?.reason).toContain('不要重复重试同一命令');
  });

  test('只读 GitHub 设备调用可用，远端变更调用仍拒绝', async () => {
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

  test('每次写入都重读分支，切换后立即生效', async () => {
    let branch: string | null = 'main';
    const dynamic: RepoResolver = async () => ({
      kind: 'repo',
      context: { root: 'C:/repo', branch, defaultBranch: 'main', isLinkedWorktree: true },
    });
    const event = toolCall('edit', { path: 'src/index.ts' });
    await expect(evaluateWriteGuard(event, 'C:/repo', dynamic)).resolves.toMatchObject({ block: true });
    branch = 'feature/guard';
    await expect(evaluateWriteGuard(event, 'C:/repo', dynamic)).resolves.toBeUndefined();
  });
});
