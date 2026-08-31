import { createHash } from 'node:crypto';
import type { AgentRegistry } from './ports/agent-registry';
import type { ConfigurationRepository } from './ports/configuration-repository';
import type { AgentScheduleRepository } from './ports/schedule-repository';
import type { DispatchOperationRepository } from './ports/dispatch-repository';
import type { AgentSchedulerPort } from './ports/scheduler';
import { agentId, validateAgentCapabilitySnapshot, type AgentId, type AgentCapabilitySnapshot, type AgentKey, type SupportLevel } from '../domain/agent';
import { validateConfigurationRevision, type ConfigurationRevision } from '../domain/configuration';
import {
  createAgentScheduleIntent,
  createOrcaAutomationReceipt,
  type AgentScheduleIntent,
  type OrcaAutomationReceipt,
  type ScheduleTarget,
  type ScheduleTrigger,
} from '../domain/schedule';
import {
  createDispatchOperation,
  isTerminalDispatchPhase,
  transitionDispatchOperation,
  type DispatchOperation,
  type DispatchOperationEvent,
} from '../domain/dispatch-operation';

export interface SchedulingDependencies {
  readonly configurations: ConfigurationRepository;
  readonly registry: AgentRegistry;
  readonly scheduler: AgentSchedulerPort;
  readonly schedules: AgentScheduleRepository;
  readonly operations: DispatchOperationRepository;
  readonly now?: () => string;
}

export interface ScheduleValidationDependencies {
  readonly configurations: ConfigurationRepository;
  readonly registry: AgentRegistry;
}

export interface CreateAgentScheduleInput {
  readonly scheduleId: string;
  readonly agentId: string;
  readonly revisionId: string;
  readonly trigger: ScheduleTrigger;
  readonly target: ScheduleTarget;
  readonly precheckRef?: string | null;
  readonly sourceContextRef?: string | null;
  readonly sessionPolicy: AgentScheduleIntent['sessionPolicy'];
  readonly createdAt?: string;
}

export interface DispatchAgentScheduleInput {
  readonly scheduleId: string;
  readonly operationId?: string;
  readonly manifestHash?: string;
  readonly precheck?: { readonly ok: boolean; readonly reason?: string };
}

export interface CancelAgentScheduleInput {
  readonly scheduleId: string;
  readonly operationId: string;
}

export interface ReconcileAgentDispatchInput {
  readonly scheduleId: string;
  readonly operationId: string;
  readonly agentId: string;
  readonly revisionId: string;
  readonly target: ScheduleTarget;
  readonly manifestHash: string;
  readonly outcome: 'succeeded' | 'degraded' | 'failed' | 'skipped' | 'unknown' | 'incomplete' | 'not-available';
  readonly reason?: string;
}

export type SchedulingErrorCode =
  | 'agent-not-found'
  | 'agent-capability-unsupported'
  | 'revision-not-found'
  | 'revision-agent-mismatch'
  | 'schedule-not-found'
  | 'duplicate-schedule'
  | 'operation-not-found'
  | 'duplicate-operation'
  | 'operation-correlation-mismatch'
  | 'automation-missing'
  | 'correlation-mismatch'
  | 'invalid-precheck';

export class SchedulingError extends Error {
  override readonly name = 'SchedulingError';
  constructor(readonly code: SchedulingErrorCode, message: string) {
    super(message);
  }
}

function currentTime(deps: SchedulingDependencies): string {
  return deps.now?.() ?? new Date().toISOString();
}

function targetsEqual(left: ScheduleTarget, right: ScheduleTarget): boolean {
  if (left.kind !== right.kind || left.selector !== right.selector) return false;
  if (left.kind === 'project' && right.kind === 'project') return left.host === right.host;
  return true;
}

function triggersEqual(left: ScheduleTrigger, right: ScheduleTrigger): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'preset' && right.kind === 'preset') return left.value === right.value;
  if (left.kind === 'cron' && right.kind === 'cron') return left.expression === right.expression;
  if (left.kind === 'rrule' && right.kind === 'rrule') return left.value === right.value;
  return false;
}

function providerMatchesAgent(provider: string, requestedAgent: AgentId): boolean {
  if (provider === requestedAgent) return true;
  return (provider === 'claude' || provider === 'claude-code')
    && (requestedAgent === 'claude' || requestedAgent === 'claude-code');
}

export function buildAgentScheduleManifestHash(schedule: AgentScheduleIntent, revision: { readonly revisionId: string; readonly capabilities: readonly unknown[] }): string {
  return createHash('sha256').update(JSON.stringify({
    agentId: schedule.agentId,
    revisionId: revision.revisionId,
    capabilities: revision.capabilities,
    trigger: schedule.trigger,
    target: schedule.target,
    sessionPolicy: schedule.sessionPolicy,
  })).digest('hex');
}

function requireManifestHash(value: string | undefined, schedule: AgentScheduleIntent, revision: { readonly revisionId: string; readonly capabilities: readonly unknown[] }): string {
  if (value === undefined) return buildAgentScheduleManifestHash(schedule, revision);
  if (value.trim().length === 0) throw new SchedulingError('correlation-mismatch', 'manifest hash must not be empty');
  return value.trim();
}


function assertSupportedCapability(snapshot: AgentCapabilitySnapshot, schedule: AgentScheduleIntent): void {
  if (snapshot.agentId !== schedule.agentId) throw new SchedulingError('agent-capability-unsupported', 'capability snapshot Agent mismatch');
  if (snapshot.level !== 'supported') throw new SchedulingError('agent-capability-unsupported', `Agent capability is ${snapshot.level}`);
  if (snapshot.version.kind !== 'known' || snapshot.version.value.trim().length === 0) {
    throw new SchedulingError('agent-capability-unsupported', 'Agent version evidence is unknown');
  }
  const schedulingLevel = snapshot.capabilities.scheduling;
  if (schedulingLevel !== 'supported') throw new SchedulingError('agent-capability-unsupported', `scheduling capability is ${schedulingLevel ?? 'unknown'}`);
}

export interface ValidatedSchedule {
  readonly schedule: AgentScheduleIntent;
  readonly revision: ConfigurationRevision;
  readonly snapshot: AgentCapabilitySnapshot;
}

function descriptorMatchesOrcaAgent(descriptor: { readonly key?: AgentKey; readonly sourceId?: string; readonly agentId?: AgentId; readonly id?: AgentId }, requested: AgentId): boolean {
  if (descriptor.key !== undefined) return descriptor.key.sourceId === 'orca' && descriptor.key.agentId === requested;
  if (descriptor.sourceId !== undefined || descriptor.agentId !== undefined) return descriptor.sourceId === 'orca' && descriptor.agentId === requested;
  return descriptor.id === requested;
}
async function validateSchedule(deps: Pick<SchedulingDependencies, 'configurations' | 'registry'>, schedule: AgentScheduleIntent): Promise<ValidatedSchedule> {
  const descriptor = await deps.registry.get(schedule.agentId);
  if (descriptor === null || !descriptorMatchesOrcaAgent(descriptor, schedule.agentId)) throw new SchedulingError('agent-not-found', `Agent not found: ${schedule.agentId}`);
  const revision = await deps.configurations.findById(schedule.revisionId);
  if (revision === null) throw new SchedulingError('revision-not-found', `revision not found: ${schedule.revisionId}`);
  try {
    validateConfigurationRevision(revision);
  } catch (error) {
    throw new SchedulingError('revision-agent-mismatch', `revision evidence invalid: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  if (revision.availability.kind !== 'known' || revision.availability.value !== 'resolved') {
    throw new SchedulingError('revision-agent-mismatch', 'revision availability is not resolved');
  }
  if (revision.revisionId !== schedule.revisionId) throw new SchedulingError('revision-agent-mismatch', 'revision correlation mismatch');
  const snapshot = await deps.registry.probe(schedule.agentId, revision);
  try {
    validateAgentCapabilitySnapshot(snapshot);
  } catch (error) {
    throw new SchedulingError('agent-capability-unsupported', `capability evidence invalid: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  assertSupportedCapability(snapshot, schedule);
  for (const capability of revision.capabilities) {
    const level: SupportLevel | undefined = snapshot.capabilities[capability.name];
    if (level !== 'supported') throw new SchedulingError('agent-capability-unsupported', `capability ${capability.name} is ${level ?? 'unknown'}`);
  }
  return { schedule, revision, snapshot };
}

export async function validateAgentSchedule(deps: ScheduleValidationDependencies, input: CreateAgentScheduleInput): Promise<ValidatedSchedule> {
  const schedule = createAgentScheduleIntent({
    scheduleId: input.scheduleId,
    agentId: agentId(input.agentId),
    revisionId: input.revisionId,
    trigger: input.trigger,
    target: input.target,
    sessionPolicy: input.sessionPolicy,
    precheckRef: input.precheckRef ?? null,
    sourceContextRef: input.sourceContextRef ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
  return validateSchedule(deps, schedule);
}

async function transitionAndPersist(
  deps: SchedulingDependencies,
  operation: DispatchOperation,
  event: DispatchOperationEvent,
): Promise<DispatchOperation> {
  const result = transitionDispatchOperation(operation, event);
  if (!result.ok) throw new SchedulingError('operation-correlation-mismatch', result.reason);
  await deps.operations.updatePhase(operation.operationId, operation.phase, result.operation);
  return result.operation;
}
async function persistUnknownOrThrow(
  deps: SchedulingDependencies,
  operation: DispatchOperation,
  originalError: unknown,
  reasonPrefix = 'scheduler-failure',
): Promise<never> {
  try {
    await transitionAndPersist(deps, operation, {
      type: 'unknown',
      reason: originalError instanceof Error ? `${reasonPrefix}:${originalError.message}` : reasonPrefix,
    });
  } catch (persistenceError) {
    throw new AggregateError([originalError, persistenceError], 'failed to persist dispatch failure');
  }
  throw originalError;
}
export async function createAgentSchedule(deps: SchedulingDependencies, input: CreateAgentScheduleInput): Promise<AgentScheduleIntent> {
  const schedule = createAgentScheduleIntent({
    ...input,
    agentId: agentId(input.agentId),
    precheckRef: input.precheckRef ?? null,
    sourceContextRef: input.sourceContextRef ?? null,
    createdAt: input.createdAt ?? currentTime(deps),
  });
  if (await deps.schedules.findById(schedule.scheduleId) !== null) throw new SchedulingError('duplicate-schedule', `schedule already exists: ${schedule.scheduleId}`);
  await validateSchedule(deps, schedule);
  try {
    await deps.schedules.save(schedule);
  } catch (error) {
    if (await deps.schedules.findById(schedule.scheduleId) !== null) throw new SchedulingError('duplicate-schedule', `schedule already exists: ${schedule.scheduleId}`);
    throw error;
  }
  return schedule;
}
export async function dispatchAgentSchedule(deps: SchedulingDependencies, input: DispatchAgentScheduleInput): Promise<DispatchOperation> {
  const schedule = await deps.schedules.findById(input.scheduleId);
  if (schedule === null) throw new SchedulingError('schedule-not-found', `schedule not found: ${input.scheduleId}`);
  const validated = await validateSchedule(deps, schedule);
  const operationId = input.operationId?.trim() || `operation-${schedule.scheduleId}`;
  if (await deps.operations.findById(operationId) !== null) throw new SchedulingError('duplicate-operation', `operation already exists: ${operationId}`);
  if (input.precheck !== undefined && !input.precheck.ok
    && (input.precheck.reason === undefined || input.precheck.reason.trim().length === 0)) {
    throw new SchedulingError('invalid-precheck', 'precheck failure requires a reason');
  }
  const operation = createDispatchOperation({
    operationId,
    scheduleId: schedule.scheduleId,
    agentId: schedule.agentId,
    revisionId: schedule.revisionId,
    target: schedule.target,
    manifestHash: requireManifestHash(input.manifestHash, schedule, validated.revision),
    createdAt: currentTime(deps),
  });
  await deps.operations.save(operation);
  if (input.precheck !== undefined && !input.precheck.ok) {
    return transitionAndPersist(deps, operation, { type: 'skipped', reason: input.precheck.reason! });
  }
  let receipt: OrcaAutomationReceipt;
  try {
    receipt = createOrcaAutomationReceipt(await deps.scheduler.create(schedule));
  } catch (error) {
    return persistUnknownOrThrow(deps, operation, error);
  }
  if (!providerMatchesAgent(receipt.provider, schedule.agentId)
    || !targetsEqual(receipt.target, schedule.target)
    || !triggersEqual(receipt.trigger, schedule.trigger)) {
    const error = new SchedulingError('correlation-mismatch', `correlation-mismatch: automation receipt does not match schedule: ${schedule.scheduleId}`);
    return persistUnknownOrThrow(deps, operation, error, 'correlation-mismatch');
  }
  const dispatched = await transitionAndPersist(deps, operation, { type: 'dispatched', automationId: receipt.automationId });
  await deps.operations.appendReceipt(dispatched.operationId, receipt);
  return dispatched;
}
export async function cancelAgentSchedule(deps: SchedulingDependencies, input: CancelAgentScheduleInput): Promise<DispatchOperation> {
  const schedule = await deps.schedules.findById(input.scheduleId);
  if (schedule === null) throw new SchedulingError('schedule-not-found', `schedule not found: ${input.scheduleId}`);
  const operation = await deps.operations.findById(input.operationId);
  if (operation === null) throw new SchedulingError('operation-not-found', `operation not found: ${input.operationId}`);
  if (operation.scheduleId !== schedule.scheduleId
    || operation.agentId !== schedule.agentId
    || operation.revisionId !== schedule.revisionId
    || !targetsEqual(operation.target, schedule.target)) {
    throw new SchedulingError('operation-correlation-mismatch', 'operation correlation does not match schedule');
  }
  if (isTerminalDispatchPhase(operation.phase)) {
    if (operation.phase === 'skipped' && operation.automationId !== null) return operation;
    throw new SchedulingError('operation-correlation-mismatch', `cannot cancel terminal operation: ${operation.operationId}`);
  }
  if (operation.automationId === null) throw new SchedulingError('automation-missing', `operation has no automation: ${operation.operationId}`);
  await deps.scheduler.cancel(operation.automationId);
  return transitionAndPersist(deps, operation, { type: 'skipped', reason: 'cancelled' });
}

export async function reconcileAgentDispatch(deps: SchedulingDependencies, input: ReconcileAgentDispatchInput): Promise<DispatchOperation> {
  const schedule = await deps.schedules.findById(input.scheduleId);
  if (schedule === null) throw new SchedulingError('schedule-not-found', `schedule not found: ${input.scheduleId}`);
  const operation = await deps.operations.findById(input.operationId);
  if (operation === null) throw new SchedulingError('operation-not-found', `operation not found: ${input.operationId}`);
  const requestedAgent = agentId(input.agentId);
  if (operation.scheduleId !== schedule.scheduleId
    || operation.agentId !== requestedAgent
    || operation.revisionId !== input.revisionId
    || schedule.agentId !== requestedAgent
    || schedule.revisionId !== input.revisionId
    || !targetsEqual(operation.target, input.target)
    || !targetsEqual(schedule.target, input.target)
    || operation.manifestHash !== input.manifestHash) {
    throw new SchedulingError('correlation-mismatch', 'dispatch evidence correlation mismatch');
  }
  const mappedOutcome: Exclude<ReconcileAgentDispatchInput['outcome'], 'incomplete' | 'not-available'> = input.outcome === 'incomplete' || input.outcome === 'not-available' ? 'unknown' : input.outcome;
  const reason = input.reason ?? (input.outcome === 'incomplete' || input.outcome === 'not-available' ? `incomplete:${input.outcome}` : undefined);
  if (isTerminalDispatchPhase(operation.phase)) {
    if (operation.phase === mappedOutcome) return operation;
    throw new SchedulingError('operation-correlation-mismatch', `operation already terminal: ${operation.operationId}`);
  }
  let current = operation;
  if (current.phase === 'dispatched' && mappedOutcome !== 'skipped' && mappedOutcome !== 'unknown') {
    current = await transitionAndPersist(deps, current, { type: 'observing' });
  }
  return transitionAndPersist(deps, current, { type: mappedOutcome, ...(reason === undefined ? {} : { reason }) } as DispatchOperationEvent);
}

