#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import { defaultDbPath } from './db-path';
import { defaultSupplyRoot } from './supply-root';
import { defaultSelfUpdateStatePath } from './self-update-state-path';
import { CONFIGS_VERSION } from './version';
import { readYesNo } from './confirm-prompt';
import { t } from './i18n';
import { readCandidateFile, readStdinText, isStdinTTY } from './candidate-source';
import { renderConfirmationSummary, renderCompare, renderDetail, renderFailure, renderHandoffLine, renderList, renderQueryFailure, renderSearchResults, renderStatus, renderAgentListJson, renderAgentProbeJson, renderScheduleDryRunJson, renderScheduleJson, renderSchedulingFailure } from './render';
import { SqliteStore } from '../adapters/sqlite/store';
import { SqliteConfigRevisionRepository } from '../adapters/sqlite/repository';
import { SqliteConfigRevisionWriter } from '../adapters/sqlite/config-revision-writer';
import { SqliteActivationOperationRepository } from '../adapters/sqlite/activation-operation-repository';
import { SqliteLaunchObservationRepository } from '../adapters/sqlite/launch-observation-repository';
import { SqliteScheduleRepository } from '../adapters/sqlite/schedule-repository';
import { SqliteDispatchOperationRepository } from '../adapters/sqlite/dispatch-repository';
import { findDenylistedForwardedArg } from '../adapters/omp/process-port';
import { InMemoryAgentAdapterRegistry, OmpAgentAdapter, ClaudeAgentAdapter } from '../adapters/clients/agent-adapters';
import { OrcaAgentProvider } from '../adapters/orca/agent-provider';
import { createOrcaScheduler, buildOrcaCreateArgs, type OrcaCommandPort } from '../adapters/orca/orca-scheduler';
import { agentId as toAgentId } from '../domain/agent';
import { type AgentScheduleIntent, type ScheduleTarget, type ScheduleTrigger } from '../domain/schedule';
import { type DispatchOperation } from '../domain/dispatch-operation';
import { prepareActivation, confirmActivation, rejectActivation, executeActivation, recoverActivation, getActivationStatus, requestConfigurationSwitch, type ActivationDependencies } from '../application/activation';
import { validateAgentSchedule, buildAgentScheduleManifestHash, createAgentSchedule, dispatchAgentSchedule, cancelAgentSchedule, type SchedulingDependencies } from '../application/scheduling';
import type { AgentRegistry } from '../application/ports/agent-registry';
import type { AgentSchedulerPort } from '../application/ports/scheduler';
import type { AgentScheduleRepository } from '../application/ports/schedule-repository';
import type { DispatchOperationRepository } from '../application/ports/dispatch-repository';
import type { ConfigurationRepository, ConfigurationSearchRepository } from '../application/ports/configuration-repository';
import { InMemoryAgentRegistry } from '../application/agent-registry';
import { compareConfigRevisions, getConfigRevisionDetail, listConfigRevisions, rebuildConfigSearch, searchConfigRevisions } from '../application/queries';
import { parseCandidateRevision, parseEvidenceRef, parseSupersedesRevisionId, parseTriggerCategory, InvalidCandidateError, InvalidTriggerCategoryError, MissingEvidenceError, MissingSupersedesError, NoCandidateSourceError } from '../application/establish';
import { loadSupplyGroups, buildSupplyCandidate } from '../adapters/sources/supply-fs';
import { buildRoleCandidate, loadRoleSource } from '../adapters/sources/role-fs';
import { readSelfUpdateState, writeSelfUpdateState, isCheckDue } from '../adapters/self-update/check-state';
import { GithubReleaseUpdater } from '../adapters/self-update/github-release-updater';
import type { SelfUpdatePort } from '../application/ports/self-update';
import type { AgentAdapterRegistry } from '../application/ports/agent-adapter';
import { runTui } from './tui';

export interface CliOverrides {
  readonly databasePath?: string;
  readonly adapters?: AgentAdapterRegistry;
  readonly configurations?: ConfigurationRepository & ConfigurationSearchRepository;
  readonly registry?: AgentRegistry;
  readonly scheduler?: AgentSchedulerPort;
  readonly schedules?: AgentScheduleRepository;
  readonly dispatches?: DispatchOperationRepository;
  readonly readOnly?: boolean;
  readonly now?: () => string;
}
export interface FullDeps extends Omit<ActivationDependencies, 'configurations'> {
  readonly configurations: ConfigurationRepository & ConfigurationSearchRepository;
  readonly store: SqliteStore;
  readonly registry: AgentRegistry;
  readonly schedules: AgentScheduleRepository;
  readonly dispatches: DispatchOperationRepository;
  readonly schedulerFactory: () => AgentSchedulerPort;
  readonly now?: () => string;
}

function createDefaultOrcaCommand(): OrcaCommandPort {
  return {
    async run(args) {
      const executable = Bun.which(args[0] ?? 'orca');
      if (executable === null) return { exitCode: 127, stdout: '', stderr: '' };
      const process = Bun.spawn([executable, ...args.slice(1)], { stdout: 'pipe', stderr: 'pipe' });
      const read = async (stream: ReadableStream<Uint8Array> | null): Promise<string> => stream === null ? '' : new TextDecoder().decode(await new Response(stream).arrayBuffer());
      const [stdout, stderr, exitCode] = await Promise.all([read(process.stdout), read(process.stderr), process.exited]);
      return { exitCode, stdout, stderr };
    },
  };
}

function createAgentRegistry(overrides: CliOverrides): AgentRegistry {
  const adapters = overrides.adapters ?? new InMemoryAgentAdapterRegistry([new OmpAgentAdapter(), new ClaudeAgentAdapter()]);
  return overrides.registry ?? new InMemoryAgentRegistry({ provider: new OrcaAgentProvider({ candidateAgentIds: [toAgentId('omp'), toAgentId('claude-code')] }), adapters });
}

export function openDeps(overrides: CliOverrides = {}): FullDeps {
  const store = new SqliteStore(overrides.databasePath ?? defaultDbPath(), { readOnly: overrides.readOnly });
  const configurations = overrides.configurations ?? new SqliteConfigRevisionRepository(store);
  const operations = new SqliteActivationOperationRepository(store);
  const observations = new SqliteLaunchObservationRepository(store);
  const adapters = overrides.adapters ?? new InMemoryAgentAdapterRegistry([new OmpAgentAdapter(), new ClaudeAgentAdapter()]);
  const registry = createAgentRegistry(overrides);
  const schedules = overrides.schedules ?? new SqliteScheduleRepository(store);
  const dispatches = overrides.dispatches ?? new SqliteDispatchOperationRepository(store);
  const schedulerFactory = () => overrides.scheduler ?? createOrcaScheduler(createDefaultOrcaCommand());
  return { store, configurations, operations, observations, adapters, registry, schedules, dispatches, schedulerFactory, now: overrides.now };
}

function closeDeps(deps: FullDeps): void { deps.store.close(); }

export const SELF_UPDATE_WORKER_ARG = '--self-update-worker';

export function reportPendingSelfUpdateNotice(params: { readonly statePath: string; readonly currentVersion: string; readonly argv: readonly string[] }): void {
  if (params.argv[0] === '--version') return;
  const state = readSelfUpdateState(params.statePath);
  if (state.pendingNoticeVersion !== params.currentVersion) return;
  writeSelfUpdateState(params.statePath, { ...state, pendingNoticeVersion: null });
  try { console.log(t('selfUpdate.updated', { version: params.currentVersion })); } catch { /* 中文注释：提示失败不能影响主命令。 */ }
}

function spawnSelfUpdateWorker(): void {
  const child = spawn(process.execPath, [SELF_UPDATE_WORKER_ARG], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

export function scheduleSelfUpdateCheck(params: { readonly statePath: string; readonly nowMs: number; readonly cooldownMs?: number; readonly spawnWorker?: () => void }): boolean {
  try {
    const state = readSelfUpdateState(params.statePath);
    if (!isCheckDue(state, params.nowMs, params.cooldownMs)) return false;
    if (!writeSelfUpdateState(params.statePath, { ...state, lastCheckedAtMs: params.nowMs })) return false;
    (params.spawnWorker ?? spawnSelfUpdateWorker)();
    return true;
  } catch { return false; }
}

export async function runSelfUpdateWorker(params: { readonly statePath: string; readonly currentVersion: string; readonly nowMs?: number; readonly updater?: SelfUpdatePort }): Promise<void> {
  try {
    const updatedVersion = await (params.updater ?? new GithubReleaseUpdater()).checkAndApply(params.currentVersion);
    const state = readSelfUpdateState(params.statePath);
    writeSelfUpdateState(params.statePath, { lastCheckedAtMs: params.nowMs ?? Date.now(), pendingNoticeVersion: updatedVersion ?? state.pendingNoticeVersion });
  } catch { /* 中文注释：自更新失败只影响下一次检查。 */ }
}

function parseAgent(args: string[]): { readonly agentId: string; readonly args: string[] } {
  const index = args.indexOf('--client');
  if (index === -1) return { agentId: 'omp', args };
  const value = args[index + 1];
  if (value !== 'omp' && value !== 'claude-code' && value !== 'claude') throw new Error(`unsupported agent: ${value ?? '(missing)'}`);
  return { agentId: value === 'claude' ? 'claude-code' : value, args: [...args.slice(0, index), ...args.slice(index + 2)] };
}
function hasYes(args: string[]): boolean { return args.includes('--yes'); }
function stripYes(args: string[]): string[] { return args.filter((arg) => arg !== '--yes'); }
function splitForwarded(args: string[]): { readonly commandArgs: string[]; readonly forwardedArgs: string[] } {
  const separator = args.indexOf('--');
  return separator === -1 ? { commandArgs: args, forwardedArgs: [] } : { commandArgs: args.slice(0, separator), forwardedArgs: args.slice(separator + 1) };
}
function validateCommandBeforeStore(command: string | undefined, args: readonly string[]): void {
  if (command === 'search') {
    const searchArgs = [...args];
    if (searchArgs.includes('--rebuild')) {
      if (searchArgs.length !== 1) throw new Error('search --rebuild does not accept other options');
      return;
    }
    let queryCount = 0;
    let jsonCount = 0;
    for (let index = 0; index < searchArgs.length; index += 1) {
      const value = searchArgs[index] ?? '';
      if (value === '--json') jsonCount += 1;
      else if (value === '--limit') {
        if (index + 1 >= searchArgs.length) throw new Error('search --limit requires a positive integer');
        const limit = Number(searchArgs[++index]);
        if (!Number.isInteger(limit) || limit < 1) throw new Error('search limit must be a positive integer');
      } else if (value.startsWith('--')) throw new Error(`unknown search option: ${value}`);
      else queryCount += 1;
    }
    if (jsonCount > 1) throw new Error('search --json may only be specified once');
    if (queryCount !== 1) throw new Error(queryCount === 0 ? 'search requires a query' : 'search accepts exactly one query');
  }
  if (command === 'use' || command === 'switch') {
    const split = splitForwarded([...args]);
    const commandArgs = stripYes(split.commandArgs);
    const parsed = parseAgent(commandArgs);
    if (parsed.args.length !== 1 || parsed.args[0]?.startsWith('--')) throw new Error(`${command} requires exactly one revision id`);
    const denied = findDenylistedForwardedArg(split.forwardedArgs);
    if (denied !== null) throw new Error(`forwarded argument is reserved by Agent System: ${denied}`);
  }
}

async function runActivationCommand(deps: FullDeps, mode: 'use' | 'switch', revisionId: string, agentId: string, yes: boolean, forwardedArgs: readonly string[]): Promise<number> {
  const latest = await deps.operations.findLatestForAgent(toAgentId(agentId));
  if (mode === 'use' && latest !== null && ['prepared', 'awaiting-confirmation', 'applying'].includes(latest.phase)) {
    throw new Error(`activation ${latest.operationId} is still ${latest.phase}; run configs recover ${latest.operationId} before starting another agent`);
  }
  let operation;
  if (mode === 'switch') {
    if (latest === null) throw new Error(`switch requires an existing completed operation for ${agentId}; use configs use ${revisionId} --client ${agentId}`);
    const switched = await requestConfigurationSwitch(deps, { currentOperationId: latest.operationId, newRevisionId: revisionId, agentId });
    operation = switched.next;
  } else operation = await prepareActivation(deps, { revisionId, agentId });
  if (operation.phase !== 'awaiting-confirmation') { console.log(renderFailure(operation)); return 1; }
  const revision = await getConfigRevisionDetail(deps.configurations, revisionId);
  console.log(renderConfirmationSummary(operation, revision));
  if (!yes && !(await readYesNo(t('confirmation.prompt')))) { const cancelled = await rejectActivation(deps, operation.operationId); console.log(renderFailure(cancelled)); return 1; }
  await confirmActivation(deps, operation.operationId);
  console.log(renderHandoffLine());
  const finalOperation = await executeActivation(deps, operation.operationId, forwardedArgs);
  if (finalOperation.phase === 'succeeded' || finalOperation.phase === 'degraded') { console.log(renderStatus(await getActivationStatus(deps, finalOperation.operationId))); return 0; }
  console.log(renderFailure(finalOperation));
  return 1;
}
async function runEstablish(deps: FullDeps | null, args: string[], mode: 'establish' | 'revise', overrides: CliOverrides = {}): Promise<number> {
  const trigger = args[args.indexOf('--trigger-category') + 1];
  const evidence = args[args.indexOf('--evidence') + 1];
  const sourceIndex = args.indexOf('--from');
  const source = sourceIndex === -1 ? null : args[sourceIndex + 1] ?? null;
  try {
    const triggerCategory = parseTriggerCategory(trigger);
    const evidenceRef = parseEvidenceRef(evidence);
    const supersedes = mode === 'revise' ? parseSupersedesRevisionId(args[args.indexOf('--supersedes') + 1]) : null;
    if (source === null && isStdinTTY()) throw new NoCandidateSourceError();
    const raw = source === null ? await readStdinText() : await readCandidateFile(source);
    const candidate = parseCandidateRevision(JSON.parse(raw));
    const activeDeps = deps ?? openDeps(overrides);
    try {
      if (supersedes !== null) {
        const target = await activeDeps.configurations.findById(supersedes);
        if (target === null) throw new Error(`supersedes target revision not found: ${supersedes}`);
        if (target.configName !== candidate.configName) throw new Error(`supersedes target belongs to ${target.configName}, expected ${candidate.configName}`);
      }
      const revision = await new SqliteConfigRevisionWriter(activeDeps.store).create({ triggerCategory, evidenceRef, candidate, supersedesRevisionId: supersedes });
      console.log(renderDetail(revision));
      return 0;
    } finally { if (deps === null) closeDeps(activeDeps); }
  } catch (error) {
    console.error(renderQueryFailure(error));
    return 1;
  }
}

class SchedulingCliError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SchedulingCliError';
    this.code = code;
  }
}
function flagValue(args: readonly string[], flag: string): string {
  const index = args.indexOf(flag);
  if (index === -1 || args[index + 1] === undefined || args[index + 1]!.startsWith('--')) throw new SchedulingCliError('invalid-arguments', `${flag} requires a value`);
  return args[index + 1]!;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9._~/-]+$/;
const SAFE_SELECTOR = /^[A-Za-z0-9._~:/@-]+$/;
const SAFE_CRON = /^[0-9*/?,\s-]+$/;
const SAFE_RRULE = /^FREQ=(?:MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)(?:;(?:INTERVAL|BYDAY|BYHOUR|BYMINUTE|BYMONTHDAY|BYMONTH|COUNT|UNTIL|WKST|BYSETPOS)=[A-Za-z0-9,.*?+TZ-]+)*$/;

function assertSafeIdentifier(value: string, code: 'invalid-arguments' | 'invalid-target' | 'invalid-trigger', message: string): string {
  if (!SAFE_IDENTIFIER.test(value) || value.includes('://') || value.includes('=')) throw new SchedulingCliError(code, message);
  return value;
}

function parseScheduleTrigger(value: string): ScheduleTrigger {
  const separator = value.indexOf(':');
  if (separator <= 0) throw new SchedulingCliError('invalid-trigger', 'trigger must use kind:value');
  const kind = value.slice(0, separator);
  const item = value.slice(separator + 1);
  if (kind === 'preset' && ['hourly', 'daily', 'weekdays', 'weekly'].includes(item)) return { kind: 'preset', value: item as 'hourly' | 'daily' | 'weekdays' | 'weekly' };
  if (kind === 'cron' && SAFE_CRON.test(item) && item.trim().length > 0) return { kind: 'cron', expression: item };
  if (kind === 'rrule' && SAFE_RRULE.test(item)) return { kind: 'rrule', value: item };
  throw new SchedulingCliError('invalid-trigger', 'trigger must be preset, cron or rrule');
}

function parseScheduleTarget(value: string): ScheduleTarget {
  const separator = value.indexOf(':');
  if (separator <= 0) throw new SchedulingCliError('invalid-target', 'target must use kind:value');
  const kind = value.slice(0, separator);
  const selector = value.slice(separator + 1).trim();
  if (selector.length === 0 || !['repo', 'workspace', 'project', 'runtime'].includes(kind) || !SAFE_SELECTOR.test(selector) || selector.includes('://') || selector.includes('=')) {
    throw new SchedulingCliError('invalid-target', 'target must be repo, workspace, project or runtime');
  }
  return { kind: kind as ScheduleTarget['kind'], selector } as ScheduleTarget;
}

interface ParsedScheduleOptions {
  readonly scheduleId: string;
  readonly agentId: string;
  readonly revisionId: string;
  readonly trigger: ScheduleTrigger;
  readonly target: ScheduleTarget;
  readonly sessionPolicy: AgentScheduleIntent['sessionPolicy'];
  readonly precheckRef: string | null;
  readonly sourceContextRef: string | null;
  readonly dryRun: boolean;
  readonly yes: boolean;
  readonly createdAt: string;
}

function parseScheduleOptions(args: readonly string[], now: string): ParsedScheduleOptions {
  const allowedFlags = new Set(['--schedule-id', '--agent', '--revision', '--trigger', '--target', '--session-policy', '--precheck', '--source-context', '--dry-run', '--yes']);
  const valueFlags = new Set(['--schedule-id', '--agent', '--revision', '--trigger', '--target', '--session-policy', '--precheck', '--source-context']);
  const seenFlags = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith('--')) throw new SchedulingCliError('invalid-arguments', 'schedule options must use named flags');
    if (!allowedFlags.has(arg) || seenFlags.has(arg)) throw new SchedulingCliError('invalid-arguments', 'unknown or duplicate schedule option');
    seenFlags.add(arg);
    if (valueFlags.has(arg)) index += 1;
  }
  const agent = assertSafeIdentifier(flagValue(args, '--agent'), 'invalid-arguments', 'agent id is not safe');
  const revision = assertSafeIdentifier(flagValue(args, '--revision'), 'invalid-arguments', 'revision id is not safe');
  const trigger = parseScheduleTrigger(flagValue(args, '--trigger'));
  const target = parseScheduleTarget(flagValue(args, '--target'));
  const sessionPolicy = flagValue(args, '--session-policy');
  if (sessionPolicy !== 'fresh' && sessionPolicy !== 'reuse') throw new SchedulingCliError('invalid-session-policy', 'session policy must be fresh or reuse');
  const scheduleId = assertSafeIdentifier(args.includes('--schedule-id') ? flagValue(args, '--schedule-id') : `schedule-${Date.now()}`, 'invalid-arguments', 'schedule id is not safe');
  return {
    scheduleId, agentId: agent, revisionId: revision, trigger, target,
    sessionPolicy, precheckRef: args.includes('--precheck') ? flagValue(args, '--precheck') : null,
    sourceContextRef: args.includes('--source-context') ? flagValue(args, '--source-context') : null,
    dryRun: args.includes('--dry-run'), yes: args.includes('--yes'), createdAt: now,
  };
}

function schedulingDependencies(deps: FullDeps): SchedulingDependencies {
  return { configurations: deps.configurations, registry: deps.registry, scheduler: deps.schedulerFactory(), schedules: deps.schedules, operations: deps.dispatches, now: deps.now };
}

interface AgentCommandDependencies {
  readonly registry: AgentRegistry;
}

async function runAgentsCommand(deps: AgentCommandDependencies, args: readonly string[]): Promise<number> {
  if (args[0] === 'list' && args.length === 1) {
    const descriptors = await deps.registry.list();
    const items = await Promise.all(descriptors.map(async (descriptor) => ({ descriptor, snapshot: await deps.registry.probe(descriptor.id) })));
    console.log(renderAgentListJson(items));
    return 0;
  }
  if (args[0] === 'probe' && args.length === 2) {
    const descriptor = await deps.registry.get(toAgentId(args[1]!));
    if (descriptor === null) throw new SchedulingCliError('agent-not-found', 'agent not found');
    console.log(renderAgentProbeJson(descriptor, await deps.registry.probe(descriptor.id)));
    return 0;
  }
  throw new SchedulingCliError('invalid-arguments', 'agents requires list or probe <agent-id>');
}

async function runScheduleDryRun(
  configurations: ConfigurationRepository,
  registry: AgentRegistry,
  args: readonly string[],
  now: string,
): Promise<number> {
  const parsed = parseScheduleOptions(args, now);
  if (!parsed.dryRun) throw new SchedulingCliError('invalid-arguments', 'dry-run command requires --dry-run');
  const validated = await validateAgentSchedule({ configurations, registry }, parsed);
  const manifestHash = buildAgentScheduleManifestHash(validated.schedule, validated.revision);
  console.log(renderScheduleDryRunJson(validated, manifestHash, buildOrcaCreateArgs(validated.schedule)));
  return 0;
}

async function findScheduleOperation(deps: FullDeps, schedule: AgentScheduleIntent): Promise<DispatchOperation | null> {
  const operations = await deps.dispatches.listByAgent(schedule.agentId);
  return operations.find((operation) => operation.scheduleId === schedule.scheduleId) ?? null;
}

async function runScheduleCommand(deps: FullDeps, args: readonly string[]): Promise<number> {
  const subcommand = args[0];
  if (subcommand === 'create') {
    if (args.includes('--help')) {
      console.log('configs schedule create --agent <agent-id> --revision <revision-id> --trigger <kind:value> --target <kind:selector> --session-policy <fresh|reuse> --dry-run');
      return 0;
    }
    const parsed = parseScheduleOptions(args.slice(1), deps.now?.() ?? new Date().toISOString());
    if (!parsed.dryRun && !parsed.yes) throw new SchedulingCliError('confirmation-required', 'non-dry-run schedule creation requires --yes');
    const validated = await validateAgentSchedule({ configurations: deps.configurations, registry: deps.registry }, parsed);
    const manifestHash = buildAgentScheduleManifestHash(validated.schedule, validated.revision);
    const argv = buildOrcaCreateArgs(validated.schedule);
    if (parsed.dryRun) {
      console.log(renderScheduleDryRunJson(validated, manifestHash, argv));
      return 0;
    }
    const scheduleDeps = schedulingDependencies(deps);
    const schedule = await createAgentSchedule(scheduleDeps, parsed);
    const operation = await dispatchAgentSchedule(scheduleDeps, { scheduleId: schedule.scheduleId });
    console.log(renderScheduleJson(schedule, operation));
    return 0;
  }
  if (subcommand === 'show' && args.length === 2) {
    const schedule = await deps.schedules.findById(args[1]!);
    if (schedule === null) throw new SchedulingCliError('schedule-not-found', 'schedule not found');
    console.log(renderScheduleJson(schedule, await findScheduleOperation(deps, schedule)));
    return 0;
  }
  if (subcommand === 'cancel' && (args.length === 2 || args.length === 3)) {
    if (!args.includes('--yes')) throw new SchedulingCliError('confirmation-required', 'schedule cancellation requires --yes');
    const schedule = await deps.schedules.findById(args[1]!);
    if (schedule === null) throw new SchedulingCliError('schedule-not-found', 'schedule not found');
    const operation = await findScheduleOperation(deps, schedule);
    if (operation === null) throw new SchedulingCliError('operation-not-found', 'operation not found');
    const scheduleDeps = schedulingDependencies(deps);
    const cancelled = await cancelAgentSchedule(scheduleDeps, { scheduleId: schedule.scheduleId, operationId: operation.operationId });
    console.log(renderScheduleJson(schedule, cancelled));
    return 0;
  }
  throw new SchedulingCliError('invalid-arguments', 'schedule requires create, show or cancel');
}

export async function main(argv: readonly string[] = process.argv.slice(2), overrides: CliOverrides = {}): Promise<number> {
  const command = argv[0];
  if (command === undefined) return runTui(overrides);
  if (command === 'establish' || command === 'revise') return runEstablish(null, [...argv.slice(1)], command, overrides);
  if (command === 'supply') {
    const configName = argv[argv.indexOf('--config-name') + 1];
    const groups = argv.flatMap((arg, index) => arg === '--group' ? [argv[index + 1] ?? ''] : []);
    const roleIndex = argv.indexOf('--role');
    const roleRef = roleIndex === -1 ? undefined : argv[roleIndex + 1];
    if (configName === undefined || (groups.length === 0 && roleRef === undefined) || (groups.length > 0 && roleRef !== undefined) || roleRef === '') throw new Error('supply requires exactly one of --role or --group');
    if (roleRef !== undefined) {
      const role = await loadRoleSource(defaultSupplyRoot(), roleRef);
      console.log(JSON.stringify(buildRoleCandidate(configName, role)));
      return 0;
    }
    console.log(JSON.stringify(buildSupplyCandidate(configName, await loadSupplyGroups(defaultSupplyRoot(), groups))));
    return 0;
  }
  if (command === '--version') { console.log(CONFIGS_VERSION); return 0; }
  if (command === 'agents') {
    try {
      return await runAgentsCommand({ registry: createAgentRegistry(overrides) }, argv.slice(1));
    } catch (error) {
      console.error(renderSchedulingFailure(error));
      return 1;
    }
  }
  if (command === 'schedule' && argv[1] === 'create' && argv.includes('--help')) {
    console.log('configs schedule create --agent <agent-id> --revision <revision-id> --trigger <kind:value> --target <kind:selector> --session-policy <fresh|reuse> --dry-run');
    return 0;
  }
  if (command === 'schedule' && argv[1] === 'create' && argv.includes('--dry-run') && overrides.configurations !== undefined) {
    try {
      return await runScheduleDryRun(overrides.configurations, createAgentRegistry(overrides), argv.slice(2), overrides.now?.() ?? new Date().toISOString());
    } catch (error) {
      console.error(renderSchedulingFailure(error));
      return 1;
    }
  }
  if (command === 'schedule' && argv[1] === 'create' && argv.includes('--dry-run')) {
    try {
      const deps = openDeps({ ...overrides, readOnly: true });
      try {
        return await runScheduleCommand(deps, argv.slice(1));
      } finally {
        closeDeps(deps);
      }
    } catch (error) {
      console.error(renderSchedulingFailure(error));
      return 1;
    }
  }
  if (command === 'schedule') {
    let deps: FullDeps;
    try {
      deps = openDeps(overrides);
    } catch (error) {
      console.error(renderSchedulingFailure(error));
      return 1;
    }
    try {
      return await runScheduleCommand(deps, argv.slice(1));
    } catch (error) {
      console.error(renderSchedulingFailure(error));
      return 1;
    } finally {
      closeDeps(deps);
    }
  }
  const deps = openDeps(overrides);
  try {
    if (command === 'list') {
      console.log(renderList(await listConfigRevisions(deps.configurations)));
      return 0;
    }
    if (command === 'show') {
      const revisionId = argv[1];
      if (revisionId === undefined) throw new Error('show requires a revision id');
      console.log(renderDetail(await getConfigRevisionDetail(deps.configurations, revisionId)));
      return 0;
    }
    if (command === 'compare') {
      const revisionIds = argv.slice(1).filter((value) => value.length > 0);
      if (revisionIds.length < 2) throw new Error('compare requires at least two revision ids');
      const result = await compareConfigRevisions(deps.configurations, revisionIds);
      console.log(renderCompare(result));
      return result.resolved.length > 0 ? 0 : 1;
    }
    if (command === 'search') {
      const searchArgs = argv.slice(1);
      if (searchArgs.includes('--rebuild')) {
        if (searchArgs.length !== 1) throw new Error('search --rebuild does not accept other options');
        await rebuildConfigSearch(deps.configurations);
        return 0;
      }
      let query: string | undefined;
      let limit = 20;
      let json = false;
      for (let index = 0; index < searchArgs.length; index += 1) {
        const value = searchArgs[index] ?? '';
        if (value === '--json') {
          if (json) throw new Error('search --json may only be specified once');
          json = true;
        } else if (value === '--limit') {
          if (index + 1 >= searchArgs.length) throw new Error('search --limit requires a positive integer');
          limit = Number(searchArgs[++index]);
          if (!Number.isInteger(limit) || limit < 1) throw new Error('search limit must be a positive integer');
        } else if (value.startsWith('--')) {
          throw new Error(`unknown search option: ${value}`);
        } else if (query === undefined) {
          query = value;
        } else {
          throw new Error('search accepts exactly one query');
        }
      }
      if (query === undefined || query.length === 0) throw new Error('search requires a query');
      const results = await searchConfigRevisions(deps.configurations, query, limit);
      console.log(json ? JSON.stringify(results) : renderSearchResults(results));
      return 0;
    }
    if (command === 'status') {
      const operation = argv[1] ?? (await deps.operations.findLatest())?.operationId;
      if (operation === undefined) throw new Error('no activation operation found');
      console.log(renderStatus(await getActivationStatus(deps, operation)));
      return 0;
    }
    if (command === 'recover') {
      const operationId = argv[1];
      if (operationId === undefined || operationId.startsWith('--')) throw new Error('recover requires an operation id');
      const recovered = await recoverActivation(deps, operationId);
      console.log(renderStatus(await getActivationStatus(deps, recovered.operationId)));
      return 0;
    }
    if (command === 'use' || command === 'switch') {
      const split = splitForwarded([...argv.slice(1)]);
      const commandArgs = stripYes(split.commandArgs);
      const parsed = parseAgent(commandArgs);
      const revisionId = parsed.args.length === 1 ? parsed.args[0] : undefined;
      if (revisionId === undefined || revisionId.startsWith('--')) throw new Error(`${command} requires exactly one revision id`);
      return await runActivationCommand(deps, command, revisionId, parsed.agentId, hasYes(split.commandArgs), split.forwardedArgs);
    }
    throw new Error(`unknown command: ${command}`);
  } catch (error) { console.error(renderQueryFailure(error)); return 1; } finally { closeDeps(deps); }
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv[0] === SELF_UPDATE_WORKER_ARG) {
    await runSelfUpdateWorker({ statePath: defaultSelfUpdateStatePath(), currentVersion: CONFIGS_VERSION });
  } else {
    reportPendingSelfUpdateNotice({ statePath: defaultSelfUpdateStatePath(), currentVersion: CONFIGS_VERSION, argv });
    scheduleSelfUpdateCheck({ statePath: defaultSelfUpdateStatePath(), nowMs: Date.now() });
    process.exit(await main(argv));
  }
}
