import type { ActivationOperation } from '../domain/activation-operation';
import { createActivationOperation, transitionActivationOperation } from '../domain/activation-operation';
import type { ConfigurationRepository } from './ports/configuration-repository';
import type { ActivationOperationRepository } from './ports/activation-operation-repository';
import type { LaunchObservationRepository } from './ports/launch-observation-repository';
import type { AgentAdapter, AgentAdapterRegistry, PreparedActivation, StartedProcess } from './ports/agent-adapter';
import type { AgentRegistry } from './ports/agent-registry';
import { configurationName, type ConfigurationRevision } from '../domain/configuration';
import { agentId, type AgentId } from '../domain/agent';
import { createLaunchObservation, type LaunchObservation } from '../domain/launch-observation';
export interface ActivationDependencies {
  readonly configurations: ConfigurationRepository;
  readonly operations: ActivationOperationRepository;
  readonly observations: LaunchObservationRepository;
  readonly adapters: AgentAdapterRegistry | Pick<AgentRegistry, 'adapter'>;
}

export class ActivationNotFoundError extends Error {
  readonly kind = 'activation-not-found' as const;
  constructor(readonly operationId: string) { super(`activation operation not found: ${operationId}`); this.name = 'ActivationNotFoundError'; }
}
export class AgentAdapterNotFoundError extends Error {
  readonly kind = 'agent-adapter-not-found' as const;
  constructor(readonly agentId: string) { super(`agent adapter not found: ${agentId}`); this.name = 'AgentAdapterNotFoundError'; }
}

function operationFailure(operation: ActivationOperation, reason: string): ActivationOperation {
  const result = transitionActivationOperation(operation, { type: 'failed', reason });
  if (!result.ok) throw new Error(result.reason);
  return result.operation;
}

async function updateOperation(deps: ActivationDependencies, operation: ActivationOperation, next: ActivationOperation): Promise<ActivationOperation> {
  await deps.operations.updateIfVersion(operation.operationId, operation.version, next);
  return next;
}

function resolveAgentAdapter(source: ActivationDependencies['adapters'], requestedAgentId: AgentId): AgentAdapter | null {
  if ('adapter' in source) return source.adapter(requestedAgentId);
  return (source as AgentAdapterRegistry).get(requestedAgentId);
}

export async function prepareActivation(deps: ActivationDependencies, params: { readonly revisionId: string; readonly agentId: string; readonly operationId?: string; readonly now?: string }): Promise<ActivationOperation> {
  const revision = await deps.configurations.findById(params.revisionId);
  const now = params.now ?? new Date().toISOString();
  const configName = revision?.configName ?? configurationName(params.revisionId);
  const operation = createActivationOperation({ operationId: params.operationId ?? `op-${crypto.randomUUID()}`, revisionId: revision?.revisionId ?? null, configName, agentId: agentId(params.agentId), planHash: `${params.revisionId}:${params.agentId}:${now}`, createdAt: now });
  if (revision === null) {
    const failed = operationFailure(operation, `revision-not-found:${params.revisionId}`);
    await deps.operations.insert(failed);
    return failed;
  }
  const transition = transitionActivationOperation(operation, { type: 'awaiting-confirmation' });
  if (!transition.ok) throw new Error(transition.reason);
  await deps.operations.insert(transition.operation);
  return transition.operation;
}

export async function confirmActivation(deps: ActivationDependencies, operationId: string): Promise<ActivationOperation> {
  const operation = await deps.operations.findById(operationId);
  if (operation === null) throw new ActivationNotFoundError(operationId);
  const result = transitionActivationOperation(operation, { type: 'confirmed' });
  if (!result.ok) throw new Error(result.reason);
  return updateOperation(deps, operation, result.operation);
}

export async function rejectActivation(deps: ActivationDependencies, operationId: string): Promise<ActivationOperation> {
  const operation = await deps.operations.findById(operationId);
  if (operation === null) throw new ActivationNotFoundError(operationId);
  const result = transitionActivationOperation(operation, { type: 'cancelled', reason: 'user-rejected-confirmation' });
  if (!result.ok) throw new Error(result.reason);
  return updateOperation(deps, operation, result.operation);
}

async function appendStage(deps: ActivationDependencies, operation: ActivationOperation, adapter: AgentAdapter, stage: LaunchObservation['stage'], outcome: LaunchObservation['outcome'], reason?: string, processReference?: LaunchObservation['processReference']): Promise<void> {
  await deps.observations.append(createLaunchObservation({ operationId: operation.operationId, agentId: adapter.agentId, stage, outcome, reason, processReference, observedAt: new Date().toISOString() }));
}

export async function executeActivation(deps: ActivationDependencies, operationId: string, forwardedArgs: readonly string[] = []): Promise<ActivationOperation> {
  const operation = await deps.operations.findById(operationId);
  if (operation === null) throw new ActivationNotFoundError(operationId);
  if (operation.phase !== 'applying') throw new Error(`activation operation ${operationId} is not applying`);
  const adapter = resolveAgentAdapter(deps.adapters, operation.agentId);
  if (adapter === null) {
    const failed = operationFailure(operation, `agent-adapter-not-found:${operation.agentId}`);
    return updateOperation(deps, operation, failed);
  }
  const revision = operation.revisionId === null ? null : await deps.configurations.findById(operation.revisionId);
  if (revision === null) {
    const failed = operationFailure(operation, 'revision-not-found-before-execution');
    return updateOperation(deps, operation, failed);
  }
  let capability;
  try {
    capability = await adapter.probe({ revision });
  } catch {
    const failed = operationFailure(operation, 'agent-probe-failed');
    return updateOperation(deps, operation, failed);
  }
  if (capability.level !== 'supported' && capability.level !== 'degraded') {
    const failed = operationFailure(operation, `agent-capability-${capability.level}`);
    return updateOperation(deps, operation, failed);
  }
  const claimed = await deps.operations.claimApplying(operationId, operation.version, new Date().toISOString());
  let prepared: PreparedActivation | undefined;
  let started: StartedProcess | undefined;
  try {
    prepared = await adapter.prepare({ operationId, revision, forwardedArgs });
    await appendStage(deps, claimed, adapter, 'context-written', 'unknown');
    started = await adapter.start({ operationId, revision, forwardedArgs, prepared });
    await appendStage(deps, claimed, adapter, 'process-started', 'unknown', undefined, started.processReference);
    const observed = await adapter.observe({ operationId, revision, started });
    await appendStage(deps, claimed, adapter, 'process-exited', observed.outcome, observed.reason, started.processReference);
    await appendStage(deps, claimed, adapter, 'outcome-observed', observed.outcome, observed.reason, started.processReference);
    if (observed.outcome === 'unknown' || observed.outcome === 'incomplete' || observed.outcome === 'not-available') return claimed;
    const transition = transitionActivationOperation(claimed, observed.outcome === 'succeeded' ? { type: 'succeeded' } : observed.outcome === 'degraded' ? { type: 'degraded', reason: observed.reason } : { type: 'failed', reason: observed.reason ?? 'launch-failed' });
    if (!transition.ok) throw new Error(transition.reason);
    return updateOperation(deps, claimed, transition.operation);
  } catch {
    if (prepared !== undefined) {
      try { await adapter.abort?.({ operationId, revision, prepared, started }); } catch { }
    }
    try { await appendStage(deps, claimed, adapter, 'outcome-observed', 'unknown', 'activation-outcome-unavailable'); } catch { }
    return claimed;
  }
}
export async function recoverActivation(deps: ActivationDependencies, operationId: string, reason = 'manual recovery: agent outcome is unknown'): Promise<ActivationOperation> {
  const operation = await deps.operations.findById(operationId);
  if (operation === null) throw new ActivationNotFoundError(operationId);
  if (operation.phase !== 'applying') throw new Error(`activation operation ${operationId} is not recoverable from phase ${operation.phase}`);
  const claimed = await deps.operations.claimApplying(operationId, operation.version, new Date().toISOString());
  await deps.observations.append(createLaunchObservation({ operationId, agentId: claimed.agentId, stage: 'outcome-observed', outcome: 'unknown', processReference: undefined, reason, observedAt: new Date().toISOString() }));
  const result = transitionActivationOperation(claimed, { type: 'failed', reason });
  if (!result.ok) throw new Error(result.reason);
  return updateOperation(deps, claimed, result.operation);
}

export async function appendLaunchObservation(deps: ActivationDependencies, observation: LaunchObservation): Promise<void> {
  await deps.observations.append(observation);
}

export interface ActivationStatus {
  readonly operation: ActivationOperation;
  readonly observations: readonly LaunchObservation[];
  readonly operationPhase: ActivationOperation['phase'];
  readonly observationStage: LaunchObservation['stage'] | 'none';
  readonly nextStep: string;
}
function nextStep(operation: ActivationOperation, observations: readonly LaunchObservation[]): string {
  if (operation.phase === 'awaiting-confirmation') return 'confirm or cancel this activation';
  if (operation.phase === 'applying') {
    const stage = observations.at(-1)?.stage;
    if (stage === undefined || stage === 'context-written') return `run configs recover ${operation.operationId} after confirming no agent process remains`;
    if (stage === 'process-started') return `run configs recover ${operation.operationId} after confirming no agent process remains`;
    return `run configs recover ${operation.operationId} to record the unknown outcome`;
  }
  if (operation.phase === 'requires-restart') return 'restart the agent, then prepare a new activation';
  if (operation.phase === 'failed') return 'inspect the latest observation reason and retry with a new operation';
  if (operation.phase === 'cancelled') return 'choose a revision to prepare a new activation';
  return 'no further action is required';
}

export async function getActivationStatus(deps: ActivationDependencies, operationId: string): Promise<ActivationStatus> {
  const operation = await deps.operations.findById(operationId);
  if (operation === null) throw new ActivationNotFoundError(operationId);
  const observations = await deps.observations.listByOperation(operationId);
  return { operation, observations, operationPhase: operation.phase, observationStage: observations.at(-1)?.stage ?? 'none', nextStep: nextStep(operation, observations) };
}

export async function requestConfigurationSwitch(deps: ActivationDependencies, params: { readonly currentOperationId: string; readonly newRevisionId: string; readonly agentId: string }): Promise<{ readonly previous: ActivationOperation; readonly next: ActivationOperation }> {
  const current = await deps.operations.findById(params.currentOperationId);
  if (current === null) throw new ActivationNotFoundError(params.currentOperationId);
  if (current.phase !== 'succeeded' && current.phase !== 'degraded') throw new Error(`switch is not allowed from operation phase ${current.phase}; use a new activation explicitly`);
  const target = await deps.configurations.findById(params.newRevisionId);
  if (target === null) throw new Error(`revision not found: ${params.newRevisionId}`);
  if (resolveAgentAdapter(deps.adapters, agentId(params.agentId)) === null) throw new AgentAdapterNotFoundError(params.agentId);
  const transitioned = transitionActivationOperation(current, { type: 'requires-restart', reason: 'configuration-switch-requested' });
  if (!transitioned.ok) throw new Error(transitioned.reason);
  const previous = await updateOperation(deps, current, transitioned.operation);
  const nextOperation = await prepareActivation(deps, { revisionId: target.revisionId, agentId: params.agentId });
  return { previous, next: nextOperation };
}
