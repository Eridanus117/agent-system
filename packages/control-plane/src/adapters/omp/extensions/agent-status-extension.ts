import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
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

/** 一个仓库检出的事实；directWritePaths 来自该仓自己的写入策略文件。 */
export interface RepoContext {
  readonly root: string;
  readonly branch: string | null;
  readonly defaultBranch: string | null;
  readonly isLinkedWorktree: boolean;
  /** 该仓声明的、允许直接写主干的路径前缀（相对仓根，POSIX 分隔符，以 / 结尾）。 */
  readonly directWritePaths?: readonly string[];
}

/**
 * 仓库解析结果三态。
 * 旧实现用 `RepoContext | null` 表达，把「确证不在任何仓库内」与「无法确认」压成同一个值，
 * 于是正当的仓外配置维护被拒，而元数据损坏的仓也无法与仓外区分。三态把两者分开。
 */
export type RepoResolution =
  | { readonly kind: 'repo'; readonly context: RepoContext }
  | { readonly kind: 'outside' }
  | { readonly kind: 'unknown'; readonly reason: string };

export type RepoResolver = (
  directory: string,
) => RepoResolution | Promise<RepoResolution>;

/** 仓级写入策略文件名；放在仓根，随仓走，不在守卫里硬编码仓名。 */
export const WRITE_POLICY_FILE = '.agent-write-policy.json';

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

/**
 * 会写文件的 shell 命令，以及目标参数在哪里。
 * `last` 取最后一个非选项参数，`all` 取全部非选项参数。
 * 这是启发式：负责人 2026-09-08 裁定守卫只需防粗心，不需防规避。
 */
const SHELL_WRITE_COMMANDS: Record<string, 'last' | 'all'> = {
  cp: 'last',
  mv: 'last',
  install: 'last',
  rm: 'all',
  rmdir: 'all',
  touch: 'all',
  mkdir: 'all',
  tee: 'all',
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

/** 按引号把一个 segment 切成 token；不做变量展开，展开不了的原样保留。 */
function shellTokens(segment: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let started = false;
  for (const character of segment) {
    if (escaped) {
      current += character;
      escaped = false;
      started = true;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      else current += character;
      started = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      started = true;
      continue;
    }
    if (/\s/u.test(character)) {
      if (started) tokens.push(current);
      current = '';
      started = false;
      continue;
    }
    current += character;
    started = true;
  }
  if (started) tokens.push(current);
  return tokens;
}

/**
 * `sed` 原本在只读白名单里，但 `sed -i` 是原地写。2026-09-08 实测该项放行了对主检出的改写，
 * 故移出白名单，改由 shell 目标提取处理。
 */
function isReadOnlyShellSegment(segment: string): boolean {
  return /^(?:(?:git\s+(?:-[^\s]+\s+)*(?:status|diff|log|show|show-ref|branch|rev-parse|rev-list|merge-base|remote|describe|blame|ls-files|cat-file|for-each-ref|symbolic-ref|worktree|check-ignore|ls-remote|config\s+--get(?:-[^\s]+)?))|(?:pwd|cd|dir|ls|type|cat|findstr|where|which|echo|printf|node\s+--version|bun\s+--version|npm\s+--version|python\s+--version))(?:\s|$)/iu.test(segment)
    && !/[<>]/u.test(segment);
}

export function isReadOnlyBashCommand(command: string): boolean {
  const trimmed = command.trim();
  return trimmed.length === 0 || shellSegments(trimmed).every(isReadOnlyShellSegment);
}

function isReadOnlyGitHubCall(event: MinimalToolCallEvent): boolean {
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

/**
 * 解析目标的真实路径：先上溯到最近存在的祖先做 realpath，再把剩余段接回去。
 * 没有这一步时，指向受保护仓库的 junction 或 symlink 只靠词法父目录判断会被漏掉。
 */
function realPathOfNearestExisting(target: string): string {
  let current = path.resolve(target);
  const trailing: string[] = [];
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    trailing.unshift(path.basename(current));
    current = parent;
  }
  let resolved: string;
  try {
    resolved = realpathSync(current);
  } catch {
    resolved = current;
  }
  return trailing.length === 0 ? resolved : path.join(resolved, ...trailing);
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
    if (statSync(marker).isDirectory()) return marker;
  } catch {
    return null;
  }
  const content = readText(marker);
  if (content === null || !content.startsWith('gitdir:')) return null;
  return path.resolve(path.dirname(marker), content.slice('gitdir:'.length).trim());
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

function branchFromHead(gitDirectory: string): string | null {
  const head = readText(path.join(gitDirectory, 'HEAD'));
  if (head === null || !head.startsWith('ref:')) return null;
  const reference = head.slice('ref:'.length).trim();
  return reference.length === 0 ? null : reference;
}

function defaultBranchFromOriginHead(gitDirectory: string): string | null {
  const head = readText(path.join(gitDirectory, 'refs', 'remotes', 'origin', 'HEAD'));
  if (head === null || !head.startsWith('ref:')) return null;
  const reference = head.slice('ref:'.length).trim();
  return reference.length === 0 ? null : reference;
}

/** 归一化一条策略前缀：统一 POSIX 分隔符、去掉首斜杠、补尾斜杠。 */
function normalizePolicyPrefix(value: string): string {
  const posix = value.trim().split('\\').join('/').replace(/^\/+/u, '');
  return posix.endsWith('/') ? posix : `${posix}/`;
}

/**
 * 读取仓级写入策略。文件缺失、无法解析或字段类型不对时一律返回空清单，
 * 即回落到「全仓保护」——不因策略文件坏掉而放宽。
 */
function directWritePathsForRoot(root: string): readonly string[] {
  const text = readText(path.join(root, WRITE_POLICY_FILE));
  if (text === null) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object') return [];
    const value = (parsed as { directWritePaths?: unknown }).directWritePaths;
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map(normalizePolicyPrefix);
  } catch {
    return [];
  }
}

/**
 * 从某个目录出发逐级上溯定位仓库。
 * 与旧实现的区别：遇到存在但解析不了的 `.git` 标记时返回 unknown 并停止上溯，
 * 不再跳过坏标记继续找父级——那会把「元数据损坏」误报成「属于外层仓库」。
 */
function defaultRepoResolver(directory: string): RepoResolution {
  let current: string;
  try {
    current = realPathOfNearestExisting(directory);
  } catch {
    return { kind: 'unknown', reason: '目标路径无法解析为真实路径' };
  }
  for (;;) {
    const marker = path.join(current, '.git');
    let markerExists: boolean;
    try {
      markerExists = existsSync(marker);
    } catch {
      return { kind: 'unknown', reason: `无法读取 ${marker}` };
    }
    if (markerExists) {
      const gitDirectory = gitDirectoryForRoot(current);
      if (gitDirectory === null) {
        return { kind: 'unknown', reason: `${marker} 存在但无法解析为 Git 目录` };
      }
      const commonDirectory = commonGitDirectory(gitDirectory);
      return {
        kind: 'repo',
        context: {
          root: current,
          branch: branchFromHead(gitDirectory),
          defaultBranch: defaultBranchFromOriginHead(commonDirectory),
          isLinkedWorktree: isLinkedWorktree(current),
          directWritePaths: directWritePathsForRoot(current),
        },
      };
    }
    const parent = path.dirname(current);
    if (parent === current) return { kind: 'outside' };
    current = parent;
  }
}

/** 一个待判定的写入目标。absolutePath 为 null 表示只知道所在目录（如 bash 的有效 cwd）。 */
interface WriteTarget {
  readonly directory: string;
  readonly absolutePath: string | null;
}

function targetFromPath(candidate: string, cwd: string): WriteTarget {
  const absolute = realPathOfNearestExisting(path.resolve(cwd, candidate));
  return { directory: path.dirname(absolute), absolutePath: absolute };
}

/**
 * 从一条 shell 命令里尽力提取写入目标，并跟踪 `cd` 对有效 cwd 的改变。
 * 提取不出目标的命令只贡献有效 cwd——这保留了旧实现「agent 就在受保护检出里干活」的拦截，
 * 同时补上旧实现完全没有的「agent 在别处、但写进受保护检出」的拦截。
 */
function shellWriteTargets(command: string, cwd: string): readonly WriteTarget[] {
  const targets: WriteTarget[] = [];
  const seenCwd = new Set<string>();
  let effectiveCwd = realPathOfNearestExisting(cwd);
  const pushCwd = (directory: string): void => {
    if (seenCwd.has(directory)) return;
    seenCwd.add(directory);
    targets.push({ directory, absolutePath: null });
  };
  pushCwd(effectiveCwd);

  for (const segment of shellSegments(command)) {
    for (const match of segment.matchAll(/(?:^|\s)>>?\s*("[^"]+"|'[^']+'|[^\s>|;&]+)/gu)) {
      const captured = match[1];
      if (captured === undefined) continue;
      targets.push(targetFromPath(captured.replace(/^["']|["']$/gu, ''), effectiveCwd));
    }
    const tokens = shellTokens(segment);
    const commandName = tokens[0];
    if (commandName === undefined) continue;
    const head = path.basename(commandName).toLowerCase();
    const args = tokens.slice(1).filter((token) => !token.startsWith('-'));
    const firstArgument = args[0];
    const lastArgument = args[args.length - 1];
    if (head === 'cd') {
      if (firstArgument !== undefined) {
        effectiveCwd = realPathOfNearestExisting(path.resolve(effectiveCwd, firstArgument));
        pushCwd(effectiveCwd);
      }
      continue;
    }
    if (head === 'sed' && tokens.some((token) => /^-[a-z]*i/iu.test(token))) {
      if (lastArgument !== undefined) targets.push(targetFromPath(lastArgument, effectiveCwd));
      continue;
    }
    const shape = SHELL_WRITE_COMMANDS[head];
    if (shape === undefined || lastArgument === undefined) continue;
    const chosen = shape === 'last' ? [lastArgument] : args;
    for (const argument of chosen) targets.push(targetFromPath(argument, effectiveCwd));
  }
  return targets;
}

function structuredWriteTargets(event: MinimalToolCallEvent, cwd: string): readonly WriteTarget[] {
  const paths = Array.isArray(event.input.paths)
    ? event.input.paths.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  const directPath = stringValue(event.input.path);
  const candidates = paths.length > 0 ? paths : directPath === null ? [] : [directPath];
  if (candidates.length === 0) {
    return [{ directory: realPathOfNearestExisting(cwd), absolutePath: null }];
  }
  return candidates.map((candidate) => targetFromPath(candidate, cwd));
}

function writeTargets(event: MinimalToolCallEvent, cwd: string): readonly WriteTarget[] {
  if (event.toolName !== 'bash') return structuredWriteTargets(event, cwd);
  const command = stringValue(event.input.command);
  if (command === null) return [{ directory: realPathOfNearestExisting(cwd), absolutePath: null }];
  return shellWriteTargets(command, cwd);
}

/** 目标是否落在该仓声明的可直写路径内。只知道目录（absolutePath 为 null）时一律判为否。 */
function isDeclaredDirectWrite(target: WriteTarget, context: RepoContext): boolean {
  const declared = context.directWritePaths ?? [];
  if (declared.length === 0 || target.absolutePath === null) return false;
  const relative = path.relative(context.root, target.absolutePath).split('\\').join('/');
  if (relative.length === 0 || relative.startsWith('../')) return false;
  return declared.some((prefix) => `${relative}/`.startsWith(prefix));
}

type Verdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly message: string };

function judge(target: WriteTarget, resolution: RepoResolution): Verdict {
  if (resolution.kind === 'outside') return { allowed: true };
  if (resolution.kind === 'unknown') {
    return {
      allowed: false,
      message: `写入守卫拒绝执行：无法确认写入目标归属哪个仓库（${resolution.reason}）。这不是「已证明在仓库之外」，故按未知处理并拒绝。`,
    };
  }
  const context = resolution.context;
  if (isDeclaredDirectWrite(target, context)) return { allowed: true };
  if (context.branch === null) {
    return {
      allowed: false,
      message: '写入守卫拒绝执行：无法确认目标仓库的当前分支（detached HEAD 或 HEAD 不可读）。',
    };
  }
  if (isProtectedBranch(context.branch, context.defaultBranch)) {
    return {
      allowed: false,
      message: `写入守卫拒绝执行：Agent 不得在受保护分支 ${context.branch} 上修改文件。请切换到任务分支或使用独立 worktree。`,
    };
  }
  if (!context.isLinkedWorktree) {
    return {
      allowed: false,
      message: '写入守卫拒绝执行：写入目标位于仓库的主检出，即便当前是任务分支也不放行。请改用 linked worktree。',
    };
  }
  return { allowed: true };
}

function formatTargetFact(target: WriteTarget, resolution: RepoResolution): string {
  const where = target.absolutePath ?? `${target.directory}（仅目录）`;
  if (resolution.kind === 'outside') return `target=${where}, repo=none`;
  if (resolution.kind === 'unknown') return `target=${where}, repo=unknown(${resolution.reason})`;
  const context = resolution.context;
  return [
    `target=${where}`,
    `repo=${context.root}`,
    `branch=${context.branch ?? 'detached'}`,
    `origin-default=${context.defaultBranch ?? 'unknown'}`,
    `worktree=${context.isLinkedWorktree ? 'linked' : 'main'}`,
  ].join(', ');
}

function recoveryHint(event: MinimalToolCallEvent): string {
  const command = stringValue(event.input.command);
  if (event.toolName === 'bash' && command !== null && !isReadOnlyBashCommand(command)) {
    return '不要重复重试同一命令；先确认这条命令要写哪个文件，再切到该目标允许的位置。';
  }
  return '这不是瞬时错误；不要在当前 cwd 重试，先确认主干事实并切到 linked worktree。';
}

function blockedReason(
  event: MinimalToolCallEvent,
  message: string,
  facts: readonly string[],
): string {
  const context = facts.length === 0 ? '无可用目标事实' : facts.join(' | ');
  return `${message} 当前事实：${context} ${recoveryHint(event)}`;
}

/**
 * 每次潜在写入前重新读取 Git 状态，避免分支切换后继续沿用旧许可。
 * 判定对象是**每个能确定的写入目标**，不是会话 cwd；bash 也走同一条路径。
 */
export async function evaluateWriteGuard(
  event: MinimalToolCallEvent,
  cwd: string,
  repoResolver: RepoResolver = defaultRepoResolver,
): Promise<MinimalToolCallResult | undefined> {
  if (!isMutationCandidate(event)) return undefined;
  let targets: readonly WriteTarget[];
  try {
    targets = writeTargets(event, cwd);
  } catch {
    return {
      block: true,
      reason: blockedReason(event, '写入守卫拒绝执行：无法解析本次调用的写入目标。', []),
    };
  }
  const resolutions = await Promise.all(targets.map((target) => repoResolver(target.directory)));
  const evaluated: Array<{ readonly target: WriteTarget; readonly resolution: RepoResolution }> = [];
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const resolution = resolutions[index];
    if (target === undefined || resolution === undefined) continue;
    evaluated.push({ target, resolution });
  }
  const facts = evaluated.map((entry) => formatTargetFact(entry.target, entry.resolution));
  for (const entry of evaluated) {
    const verdict = judge(entry.target, entry.resolution);
    if (!verdict.allowed) {
      return { block: true, reason: blockedReason(event, verdict.message, facts) };
    }
  }
  return undefined;
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
