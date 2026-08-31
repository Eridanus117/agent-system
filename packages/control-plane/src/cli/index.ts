#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import { defaultDbPath } from './db-path';
import { defaultSupplyRoot } from './supply-root';
import { defaultSelfUpdateStatePath } from './self-update-state-path';
import { CONFIGS_VERSION } from './version';
import { readYesNo } from './confirm-prompt';
import { t } from './i18n';
import { readCandidateFile, readStdinText, isStdinTTY } from './candidate-source';
import { renderConfirmationSummary, renderCompare, renderDetail, renderFailure, renderHandoffLine, renderList, renderQueryFailure, renderSearchResults, renderStatus } from './render';
import { SqliteStore } from '../adapters/sqlite/store';
import { SqliteConfigRevisionRepository } from '../adapters/sqlite/repository';
import { SqliteConfigRevisionWriter } from '../adapters/sqlite/config-revision-writer';
import { SqliteActivationOperationRepository } from '../adapters/sqlite/activation-operation-repository';
import { SqliteLaunchObservationRepository } from '../adapters/sqlite/launch-observation-repository';
import { findDenylistedForwardedArg } from '../adapters/omp/process-port';
import { InMemoryAgentAdapterRegistry, OmpAgentAdapter, ClaudeAgentAdapter } from '../adapters/clients/agent-adapters';
import { agentId as toAgentId } from '../domain/agent';
import { prepareActivation, confirmActivation, rejectActivation, executeActivation, recoverActivation, getActivationStatus, requestConfigurationSwitch, type ActivationDependencies } from '../application/activation';
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
}
export interface FullDeps extends ActivationDependencies { readonly store: SqliteStore; readonly configurations: SqliteConfigRevisionRepository; readonly operations: SqliteActivationOperationRepository; readonly observations: SqliteLaunchObservationRepository; }

export function openDeps(overrides: CliOverrides = {}): FullDeps {
  const store = new SqliteStore(overrides.databasePath ?? defaultDbPath());
  const configurations = new SqliteConfigRevisionRepository(store);
  const operations = new SqliteActivationOperationRepository(store);
  const observations = new SqliteLaunchObservationRepository(store);
  const adapters = overrides.adapters ?? new InMemoryAgentAdapterRegistry([new OmpAgentAdapter(), new ClaudeAgentAdapter()]);
  return { store, configurations, operations, observations, adapters };
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
  validateCommandBeforeStore(command, argv.slice(1));
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
