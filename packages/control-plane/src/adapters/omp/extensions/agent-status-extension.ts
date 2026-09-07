
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
}

export type RepoContextReader = (
  directory: string,
) => RepoContext | null | Promise<RepoContext | null>;

const READ_ONLY_TOOL_NAMES: Record<string, true> = {
  read: true,
  grep: true,
  glob: true,
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
  return command
    .split(/\s*(?:&&|\|\||[;|])\s*/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function isReadOnlyShellSegment(segment: string): boolean {
  return /^(?:(?:git\s+(?:-[^\s]+\s+)*(?:status|diff|log|show|branch|rev-parse|remote|describe|blame|ls-files|cat-file|for-each-ref|symbolic-ref|config\s+--get))|(?:pwd|cd|dir|ls|type|cat|sed|findstr|where|which|echo|printf|node\s+--version|bun\s+--version|npm\s+--version|python\s+--version))(?:\s|$)/iu.test(segment)
    && !/[<>]/u.test(segment);
}

export function isReadOnlyBashCommand(command: string): boolean {
  const trimmed = command.trim();
  return trimmed.length === 0 || shellSegments(trimmed).every(isReadOnlyShellSegment);
}

function isMutationCandidate(event: MinimalToolCallEvent): boolean {
  if (READ_ONLY_TOOL_NAMES[event.toolName] === true) return false;
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
  if (contexts.some((context) => context === null || context.branch === null)) {
    return {
      block: true,
      reason: '写入守卫拒绝执行：当前工作目录或目标路径无法确认 Git 仓库和分支。',
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
      reason: `写入守卫拒绝执行：Agent 不得在受保护分支 ${protectedContext.branch} 上修改文件。请切换到任务分支或使用独立 worktree。`,
    };
  }
  return undefined;
}

export function isAgentSystemSession(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return stringValue(environment.AGENT_SYSTEM_LAUNCH_CONTEXT) !== null;
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

  pi.on('tool_call', async (event, ctx) => {
    if (!isAgentSystemSession()) return undefined;
    return evaluateWriteGuard(event, ctx.cwd);
  });

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
