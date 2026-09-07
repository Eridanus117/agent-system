
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

interface MinimalExtensionUi {
  notify(message: string, type?: string): void;
  setStatus(key: string, text?: string): void;
}
interface MinimalExtensionContext {
  readonly ui: MinimalExtensionUi;
  readonly cwd: string;
}

interface MinimalSessionStartEvent {
  readonly type: 'session_start';
}

interface MinimalToolCallEvent {
  readonly type: 'tool_call';
  readonly toolName: string;
  readonly toolCallId: string;
  readonly input: Record<string, unknown>;
}

interface MinimalToolCallResult {
  readonly block?: boolean;
  readonly reason?: string;
}

interface MinimalExtensionAPI {
  on(
    event: 'session_start',
    handler: (
      event: MinimalSessionStartEvent,
      ctx: MinimalExtensionContext,
    ) => void | Promise<void>,
  ): void;
  on(
    event: 'tool_call',
    handler: (
      event: MinimalToolCallEvent,
      ctx: MinimalExtensionContext,
    ) => MinimalToolCallResult | void | Promise<MinimalToolCallResult | void>,
  ): void;
  registerCommand(
    name: string,
    opts: {
      description?: string;
      handler: (args: string[], ctx: MinimalExtensionContext) => void | Promise<void>;
    },
  ): void;
}

/** 对应 control-plane 写入的启动上下文，仅保留扩展展示所需字段。 */
interface LaunchContextFile {
  readonly version: 1;
  readonly operationId: string;
  readonly configName: string;
  readonly revisionId: string;
  readonly client: string;
}

export interface RepoContext {
  readonly root: string;
  readonly branch: string | null;
  readonly defaultBranch: string | null;
  readonly isLinkedWorktree: boolean;
}

export type RepoContextReader = (
  directory: string,
) => RepoContext | null | Promise<RepoContext | null>;

const READ_ONLY_TOOL_NAMES: Record<string, true> = {
  read: true,
  grep: true,
  glob: true,
};
const READ_ONLY_GITHUB_OPS: Record<string, true> = {
  repo_view: true,
  file_read: true,
  search_issues: true,
  search_prs: true,
  search_code: true,
  search_commits: true,
  search_repos: true,
  run_watch: true,
};
const PROTECTED_BRANCHES: Record<string, true> = {
  main: true,
  master: true,
  trunk: true,
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeBranch(value: string): string {
  return value.trim().toLowerCase().replace(/^(?:refs\/heads\/|origin\/)+/u, '');
}

export function isProtectedBranch(branch: string, defaultBranch: string | null = null): boolean {
  const normalized = normalizeBranch(branch);
  return PROTECTED_BRANCHES[normalized] === true
    || (defaultBranch !== null && normalized === normalizeBranch(defaultBranch));
}

function shellSegments(command: string): string[] {
  const segments: string[] = [];
  let segmentStart = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    const operatorLength = command.startsWith('&&', index) || command.startsWith('||', index)
      ? 2
      : character === ';' || character === '|'
        ? 1
        : 0;
    if (operatorLength === 0) continue;
    const segment = command.slice(segmentStart, index).trim();
    if (segment.length > 0) segments.push(segment);
    index += operatorLength - 1;
    segmentStart = index + 1;
  }
  const tail = command.slice(segmentStart).trim();
  if (tail.length > 0) segments.push(tail);
  return segments;
}

function isReadOnlyShellSegment(segment: string): boolean {
  return /^(?:(?:git\s+(?:-[^\s]+\s+)*(?:status|diff|log|show|show-ref|branch|rev-parse|rev-list|merge-base|remote|describe|blame|ls-files|cat-file|for-each-ref|symbolic-ref|worktree|check-ignore|ls-remote|config\s+--get(?:-[^\s]+)?))|(?:pwd|cd|dir|ls|type|cat|sed|findstr|where|which|echo|printf|node\s+--version|bun\s+--version|npm\s+--version|python\s+--version))(?:\s|$)/iu.test(segment)
    && !/[<>]/u.test(segment);
}

export function isReadOnlyBashCommand(command: string): boolean {
  const trimmed = command.trim();
  return trimmed.length === 0 || shellSegments(trimmed).every(isReadOnlyShellSegment);
}

function isReadOnlyGitHubCall(event: MinimalToolCallEvent): boolean {
  if (event.toolName !== 'write' || stringValue(event.input.path) !== 'xd://github') return false;
  const content = stringValue(event.input.content);
  if (content === null) return false;
  try {
    const payload: unknown = JSON.parse(content);
    const operation = payload !== null && typeof payload === 'object' && 'op' in payload
      ? payload.op
      : null;
    return typeof operation === 'string' && READ_ONLY_GITHUB_OPS[operation] === true;
  } catch {
    return false;
  }
}

function isMutationCandidate(event: MinimalToolCallEvent): boolean {
  if (READ_ONLY_TOOL_NAMES[event.toolName] === true || isReadOnlyGitHubCall(event)) return false;
  if (event.toolName !== 'bash') return true;
  const command = stringValue(event.input.command);
  return command === null || !isReadOnlyBashCommand(command);
}


function nearestExistingDirectory(directory: string): string {
  let current = directory;
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function targetDirectories(event: MinimalToolCallEvent, cwd: string): readonly string[] {
  if (event.toolName === 'bash') return [cwd];
  const paths = Array.isArray(event.input.paths)
    ? event.input.paths.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  const directPath = stringValue(event.input.path);
  const candidates = paths.length > 0 ? paths : directPath === null ? [] : [directPath];
  if (candidates.length === 0) return [cwd];
  return candidates.map((candidate) => nearestExistingDirectory(path.dirname(path.resolve(cwd, candidate))));
}

function readText(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf8').trim();
  } catch {
    return null;
  }
}

function gitDirectoryForRoot(root: string): string | null {
  const marker = path.join(root, '.git');
  try {
    if (!existsSync(marker)) return null;
    if (statSync(marker).isDirectory()) return marker;
    const content = readText(marker);
    if (content === null || !content.startsWith('gitdir:')) return null;
    return path.resolve(path.dirname(marker), content.slice('gitdir:'.length).trim());
  } catch {
    return null;
  }
}
function isLinkedWorktree(root: string): boolean {
  try {
    return !statSync(path.join(root, '.git')).isDirectory();
  } catch {
    return false;
  }
}

function commonGitDirectory(gitDirectory: string): string {
  const commonDirectory = readText(path.join(gitDirectory, 'commondir'));
  return commonDirectory === null
    ? gitDirectory
    : path.resolve(gitDirectory, commonDirectory);
}

function findRepoRoot(directory: string): string | null {
  let current = path.resolve(directory);
  while (true) {
    if (gitDirectoryForRoot(current) !== null) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function branchFromHead(gitDirectory: string): string | null {
  const head = readText(path.join(gitDirectory, 'HEAD'));
  const prefix = 'ref: refs/heads/';
  if (head === null || !head.startsWith(prefix)) return null;
  const branch = head.slice(prefix.length).trim();
  return branch.length === 0 ? null : branch;
}

function defaultBranchFromOriginHead(gitDirectory: string): string | null {
  const originHead = readText(path.join(gitDirectory, 'refs', 'remotes', 'origin', 'HEAD'));
  const prefix = 'ref: refs/remotes/origin/';
  if (originHead === null || !originHead.startsWith(prefix)) return null;
  const branch = originHead.slice(prefix.length).trim();
  return branch.length === 0 ? null : normalizeBranch(branch);
}

function defaultRepoContextReader(directory: string): RepoContext | null {
  const root = findRepoRoot(directory);
  if (root === null) return null;
  const gitDirectory = gitDirectoryForRoot(root);
  if (gitDirectory === null) return null;
  const commonDirectory = commonGitDirectory(gitDirectory);
  return {
    root,
    branch: branchFromHead(gitDirectory),
    defaultBranch: defaultBranchFromOriginHead(commonDirectory),
    isLinkedWorktree: isLinkedWorktree(root),
  };
}

/** 每次潜在写入前重新读取 Git 状态，避免分支切换后继续沿用旧许可。 */
export async function evaluateWriteGuard(
  event: MinimalToolCallEvent,
  cwd: string,
  repoContextReader: RepoContextReader = defaultRepoContextReader,
): Promise<MinimalToolCallResult | undefined> {
  if (!isMutationCandidate(event)) return undefined;
  const contexts = await Promise.all(
    targetDirectories(event, cwd).map((directory) => repoContextReader(directory)),
  );
  if (contexts.some((context) => context === null || context.branch === null || !context.isLinkedWorktree)) {
    return {
      block: true,
      reason: blockedReason(
        event,
        '写入守卫拒绝执行：写入目标必须位于 Git 仓库的 linked worktree，且必须能确认当前分支。',
        contexts,
      ),
    };
  }
  const protectedContext = contexts.find(
    (context): context is RepoContext =>
      context !== null
      && context.branch !== null
      && isProtectedBranch(context.branch, context.defaultBranch),
  );
  if (protectedContext !== undefined) {
    return {
      block: true,
      reason: blockedReason(
        event,
        `写入守卫拒绝执行：Agent 不得在受保护分支 ${protectedContext.branch} 上修改文件。请切换到任务分支或使用独立 worktree。`,
        contexts,
      ),
    };
  }
  return undefined;
}
function formatRepoContext(context: RepoContext | null): string {
  if (context === null) return 'repo=unknown';
  return [
    `repo=${context.root}`,
    `branch=${context.branch ?? 'detached'}`,
    `origin-default=${context.defaultBranch ?? 'unknown'}`,
    `worktree=${context.isLinkedWorktree ? 'linked' : 'main'}`,
  ].join(', ');
}

function formatGuardContext(contexts: readonly (RepoContext | null)[]): string {
  return contexts.map(formatRepoContext).join(' | ');
}

function recoveryHint(event: MinimalToolCallEvent): string {
  const command = stringValue(event.input.command);
  if (event.toolName === 'bash' && command !== null && !isReadOnlyBashCommand(command)) {
    return '这条 shell 命令未被守卫证明为只读；不要重复重试同一命令，改用 read/grep/glob 或先切到 linked worktree。';
  }
  return '这不是瞬时错误；不要在当前 cwd 重试，先确认主干事实并切到 linked worktree。';
}

function blockedReason(
  event: MinimalToolCallEvent,
  message: string,
  contexts: readonly (RepoContext | null)[],
): string {
  return `${message} 当前事实：${formatGuardContext(contexts)} ${recoveryHint(event)}`;
}

/** 读取一次启动上下文；不轮询、不监听，也不在事件之间重复读取。 */
async function readLaunchContext(): Promise<LaunchContextFile | null> {
  const contextPath = process.env.AGENT_SYSTEM_LAUNCH_CONTEXT;
  if (contextPath === undefined || contextPath.length === 0) {
    return null;
  }
  try {
    const text = await Bun.file(contextPath).text();
    return JSON.parse(text) as LaunchContextFile;
  } catch {
    return null;
  }
}

function formatStatusLine(context: LaunchContextFile | null): string {
  if (context === null) {
    return 'Agent System: launch context unavailable';
  }
  return `Agent System: ${context.configName}@${context.revisionId} [${context.client}]`;
}

function formatDetail(context: LaunchContextFile | null): string {
  if (context === null) {
    return 'Agent System launch context is unavailable (AGENT_SYSTEM_LAUNCH_CONTEXT not set or unreadable).';
  }
  return [
    `configName: ${context.configName}`,
    `revisionId: ${context.revisionId}`,
    `client: ${context.client}`,
    `operationId: ${context.operationId}`,
  ].join('\n');
}

export default function registerAgentStatusExtension(pi: MinimalExtensionAPI): void {
  pi.on('session_start', async (_event, ctx) => {
    const context = await readLaunchContext();
    ctx.ui.setStatus('agent-system-config', formatStatusLine(context));
  });

  pi.on('tool_call', async (event, ctx) => evaluateWriteGuard(event, ctx.cwd));

  pi.registerCommand('agent-config', {
    description: 'Show the Agent System configuration and launch status for this OMP session',
    handler: async (_args, ctx) => {
      const context = await readLaunchContext();
      ctx.ui.notify(formatDetail(context));
    },
  });

  pi.registerCommand('agent-switch-config', {
    description: 'Switch the Agent System configuration (forwards to the external Agent System CLI)',
    handler: async (_args, ctx) => {
      const context = await readLaunchContext();
      const hint = 'run `configs switch <revision-id> --client omp` in the Agent System CLI';
      ctx.ui.notify(`To switch configuration: ${hint}`);
    },
  });
}
