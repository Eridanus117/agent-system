
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

type LaunchContextStatus =
  | { readonly kind: 'direct' }
  | { readonly kind: 'managed'; readonly context: LaunchContextFile }
  | {
    readonly kind: 'managed-unavailable';
    readonly path: string;
    readonly reason: 'missing-file' | 'unreadable' | 'malformed' | 'invalid-shape';
  };

function isLaunchContextFile(value: unknown): value is LaunchContextFile {
  if (value === null || typeof value !== 'object') return false;
  const context = value as Record<string, unknown>;
  return context.version === 1
    && stringValue(context.operationId) !== null
    && stringValue(context.configName) !== null
    && stringValue(context.revisionId) !== null
    && stringValue(context.client) !== null;
}

export interface RepoContext {
  readonly root: string;
  readonly branch: string | null;
  readonly defaultBranch: string | null;
  readonly isLinkedWorktree: boolean;
}

/**
 * 写入目标的仓库归属，三态显式区分。
 *
 * 之前这里是 `RepoContext | null`，而 `null` 同时表示「确证不在任何 Git 仓库里」
 * 和「说不清」，守卫一律拒绝。后果是 agent 在任何仓外目录都动不了——包括只读操作。
 * 2026-09-07 实测：Multica 派给 agent 的受管工作目录
 * （`~/multica_workspaces/<workspace>/<run>/workdir`）天然不是 Git 仓库，于是
 * 每一次 run 的**全部**工具调用都被以 `repo=unknown` 拒绝，连 `multica issue get`
 * 这种只读命令都执行不了，派工整条路不可用。
 *
 * 守卫要保护的是「不在受管仓的主检出上写」。确证落在所有仓之外的路径不在其管辖内，
 * 放行；确认不了的仍然拒绝，保守方向不变。
 */
export type RepoResolution =
  | { readonly kind: 'repo'; readonly context: RepoContext }
  | { readonly kind: 'outside' }
  | { readonly kind: 'unknown' };

export type RepoContextReader = (
  directory: string,
) => RepoResolution | Promise<RepoResolution>;

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

function defaultRepoContextReader(directory: string): RepoResolution {
  const root = findRepoRoot(directory);
  // findRepoRoot 一路向上走到盘符根都没找到 .git，才会返回 null。
  // 这是「确证仓外」，不是「说不清」。
  //
  // 已知局限：向上走时 gitDirectoryForRoot 把文件系统异常（权限、IO）也吞成
  // 「此层没有 .git」，因此这类异常同样落进 outside。要收紧的话得让那一层区分
  // 「没有」与「读不了」，属于另一件事，这里不顺手改。
  if (root === null) return { kind: 'outside' };
  const gitDirectory = gitDirectoryForRoot(root);
  // findRepoRoot 的返回值必然满足 gitDirectoryForRoot !== null，所以这条实际走不到；
  // 保留是为了让「说不清就拒绝」这条契约在类型上闭合，不依赖调用方的巧合。
  if (gitDirectory === null) return { kind: 'unknown' };
  const commonDirectory = commonGitDirectory(gitDirectory);
  return {
    kind: 'repo',
    context: {
      root,
      branch: branchFromHead(gitDirectory),
      defaultBranch: defaultBranchFromOriginHead(commonDirectory),
      isLinkedWorktree: isLinkedWorktree(root),
    },
  };
}

/** 每次潜在写入前重新读取 Git 状态，避免分支切换后继续沿用旧许可。 */
export async function evaluateWriteGuard(
  event: MinimalToolCallEvent,
  cwd: string,
  repoContextReader: RepoContextReader = defaultRepoContextReader,
): Promise<MinimalToolCallResult | undefined> {
  if (!isMutationCandidate(event)) return undefined;
  const resolutions = await Promise.all(
    targetDirectories(event, cwd).map((directory) => repoContextReader(directory)),
  );
  // 说不清就拒绝，保守方向与原实现一致。
  if (resolutions.some((resolution) => resolution.kind === 'unknown')) {
    return {
      block: true,
      reason: blockedReason(
        event,
        '写入守卫拒绝执行：无法确认写入目标所在的 Git 仓库状态。',
        resolutions,
      ),
    };
  }
  // kind === 'outside' 的目标不在守卫管辖内，直接跳过；只审落在受管仓里的那些。
  const contexts = resolutions.flatMap(
    (resolution) => (resolution.kind === 'repo' ? [resolution.context] : []),
  );
  if (contexts.some((context) => context.branch === null || !context.isLinkedWorktree)) {
    return {
      block: true,
      reason: blockedReason(
        event,
        '写入守卫拒绝执行：写入目标位于 Git 仓库内时，必须在 linked worktree 且能确认当前分支。',
        resolutions,
      ),
    };
  }
  const protectedContext = contexts.find(
    (context): context is RepoContext =>
      context.branch !== null
      && isProtectedBranch(context.branch, context.defaultBranch),
  );
  if (protectedContext !== undefined) {
    return {
      block: true,
      reason: blockedReason(
        event,
        `写入守卫拒绝执行：Agent 不得在受保护分支 ${protectedContext.branch} 上修改文件。请切换到任务分支或使用独立 worktree。`,
        resolutions,
      ),
    };
  }
  return undefined;
}
function formatRepoContext(resolution: RepoResolution): string {
  if (resolution.kind === 'outside') return 'repo=outside';
  if (resolution.kind === 'unknown') return 'repo=unknown';
  const context = resolution.context;
  return [
    `repo=${context.root}`,
    `branch=${context.branch ?? 'detached'}`,
    `origin-default=${context.defaultBranch ?? 'unknown'}`,
    `worktree=${context.isLinkedWorktree ? 'linked' : 'main'}`,
  ].join(', ');
}

function formatGuardContext(resolutions: readonly RepoResolution[]): string {
  return resolutions.map(formatRepoContext).join(' | ');
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
  resolutions: readonly RepoResolution[],
): string {
  return `${message} 当前事实：${formatGuardContext(resolutions)} ${recoveryHint(event)}`;
}

/** 读取一次启动上下文并保留 direct/managed/不可用三态。 */
async function readLaunchContextStatus(): Promise<LaunchContextStatus> {
  const rawPath = process.env.AGENT_SYSTEM_LAUNCH_CONTEXT;
  if (rawPath === undefined || rawPath.trim().length === 0) {
    return { kind: 'direct' };
  }
  const contextPath = rawPath.trim();
  if (!existsSync(contextPath)) {
    return { kind: 'managed-unavailable', path: contextPath, reason: 'missing-file' };
  }
  let text: string;
  try {
    text = await Bun.file(contextPath).text();
  } catch {
    return { kind: 'managed-unavailable', path: contextPath, reason: 'unreadable' };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: 'managed-unavailable', path: contextPath, reason: 'malformed' };
  }
  return isLaunchContextFile(value)
    ? { kind: 'managed', context: value }
    : { kind: 'managed-unavailable', path: contextPath, reason: 'invalid-shape' };
}

async function readLaunchContext(): Promise<LaunchContextFile | null> {
  const status = await readLaunchContextStatus();
  return status.kind === 'managed' ? status.context : null;
}

function formatStatusLine(status: LaunchContextStatus): string {
  if (status.kind === 'direct') {
    return 'Agent System: direct OMP launch';
  }
  if (status.kind === 'managed-unavailable') {
    return `Agent System: managed launch context unavailable (${status.reason})`;
  }
  const context = status.context;
  return `Agent System: ${context.configName}@${context.revisionId} [${context.client}]`;
}

function formatDetail(status: LaunchContextStatus): string {
  if (status.kind === 'direct') {
    return 'Agent System: direct OMP launch';
  }
  if (status.kind === 'managed-unavailable') {
    return [
      'Agent System: managed launch context unavailable',
      `reason: ${status.reason}`,
      `path: ${status.path}`,
    ].join('\n');
  }
  const context = status.context;
  return [
    `configName: ${context.configName}`,
    `revisionId: ${context.revisionId}`,
    `client: ${context.client}`,
    `operationId: ${context.operationId}`,
  ].join('\n');
}

export default function registerAgentStatusExtension(pi: MinimalExtensionAPI): void {
  pi.on('session_start', async (_event, ctx) => {
    const status = await readLaunchContextStatus();
    ctx.ui.setStatus('agent-system-config', formatStatusLine(status));
  });

  pi.on('tool_call', async (event, ctx) => evaluateWriteGuard(event, ctx.cwd));

  pi.registerCommand('agent-config', {
    description: 'Show the Agent System configuration and launch status for this OMP session',
    handler: async (_args, ctx) => {
      const status = await readLaunchContextStatus();
      ctx.ui.notify(formatDetail(status));
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
