import {
  createDispatchOperation,
  transitionDispatchOperation,
  type DispatchOperation,
} from '../../domain/dispatch-operation';
import { agentId, type AgentId } from '../../domain/agent';
import {
  validateOrcaAutomationReceipt,
  validateScheduleTarget,
  type AgentScheduleIntent,
  type OrcaAutomationReceipt,
  type ScheduleTarget,
  type ScheduleTrigger,
} from '../../domain/schedule';
import type { AgentSchedulerPort } from '../../application/ports/scheduler';

export type OrcaDispatchFailureCode = 'correlation-mismatch' | 'invalid-operation' | 'invalid-receipt';

export class OrcaDispatchCorrelationError extends Error {
  readonly code: OrcaDispatchFailureCode;

  constructor(code: OrcaDispatchFailureCode, message: string) {
    super(message);
    this.name = 'OrcaDispatchCorrelationError';
    this.code = code;
  }
}

export interface OrcaDispatchCorrelation {
  readonly operationId: string;
  readonly scheduleId: string;
  readonly agentId: AgentId;
  readonly revisionId: string;
  readonly target: ScheduleTarget;
  readonly manifestHash: string;
  readonly receipt: OrcaAutomationReceipt;
  readonly expectedTrigger?: ScheduleTrigger;
}

export interface OrcaDispatchRequest {
  readonly operation: DispatchOperation;
  readonly schedule: AgentScheduleIntent;
}

function targetsEqual(left: ScheduleTarget, right: ScheduleTarget): boolean {
  if (left.kind !== right.kind || left.selector !== right.selector) return false;
  if (left.kind === 'project' && right.kind === 'project') return left.host === right.host;
  return true;
}

function triggersEqual(left: ScheduleTrigger, right: ScheduleTrigger): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'cron' && right.kind === 'cron') return left.expression === right.expression;
  if (left.kind === 'preset' && right.kind === 'preset') return left.value === right.value;
  if (left.kind === 'rrule' && right.kind === 'rrule') return left.value === right.value;
  return false;
}

function providerMatchesAgent(provider: string, agent: AgentId): boolean {
  if (provider === String(agent)) return true;
  return (provider === 'claude' || provider === 'claude-code')
    && (String(agent) === 'claude' || String(agent) === 'claude-code');
}
function assertCorrelation(input: OrcaDispatchCorrelation): void {
  try {
    validateScheduleTarget(input.target);
    validateOrcaAutomationReceipt(input.receipt);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'receipt or target is invalid';
    throw new OrcaDispatchCorrelationError('invalid-receipt', message);
  }
  if (!providerMatchesAgent(input.receipt.provider, input.agentId)) {
    throw new OrcaDispatchCorrelationError('correlation-mismatch', 'receipt provider does not match dispatch agent');
  }
  if (!targetsEqual(input.receipt.target, input.target)) {
    throw new OrcaDispatchCorrelationError('correlation-mismatch', 'receipt target does not match dispatch target');
  }
  if (input.expectedTrigger !== undefined && !triggersEqual(input.receipt.trigger, input.expectedTrigger)) {
    throw new OrcaDispatchCorrelationError('correlation-mismatch', 'receipt trigger does not match schedule trigger');
  }
}

export function correlateOrcaAutomationReceipt(input: OrcaDispatchCorrelation): DispatchOperation {
  assertCorrelation(input);
  const planned = createDispatchOperation({
    operationId: input.operationId,
    scheduleId: input.scheduleId,
    agentId: agentId(input.agentId),
    revisionId: input.revisionId,
    target: input.target,
    manifestHash: input.manifestHash,
    createdAt: input.receipt.createdAt,
  });
  const transitioned = transitionDispatchOperation(planned, {
    type: 'dispatched',
    automationId: input.receipt.automationId,
  });
  if (!transitioned.ok) throw new OrcaDispatchCorrelationError('invalid-operation', transitioned.reason);
  return transitioned.operation;
}

export class OrcaDispatchAdapter {
  constructor(private readonly scheduler: AgentSchedulerPort) {}

  async dispatch(request: OrcaDispatchRequest): Promise<DispatchOperation> {
    if (request.operation.phase !== 'planned' || request.operation.automationId !== null) {
      throw new OrcaDispatchCorrelationError('invalid-operation', 'dispatch operation must be planned without automationId');
    }
    if (request.operation.scheduleId !== request.schedule.scheduleId
      || request.operation.agentId !== request.schedule.agentId
      || request.operation.revisionId !== request.schedule.revisionId
      || !targetsEqual(request.operation.target, request.schedule.target)) {
      throw new OrcaDispatchCorrelationError('correlation-mismatch', 'schedule and dispatch operation fields do not match');
    }
    const receipt = await this.scheduler.create(request.schedule);
    return correlateOrcaAutomationReceipt({
      operationId: request.operation.operationId,
      scheduleId: request.operation.scheduleId,
      agentId: request.operation.agentId,
      revisionId: request.operation.revisionId,
      target: request.operation.target,
      manifestHash: request.operation.manifestHash,
      receipt,
      expectedTrigger: request.schedule.trigger,
    });
  }
}

export function createOrcaDispatchAdapter(scheduler: AgentSchedulerPort): OrcaDispatchAdapter {
  return new OrcaDispatchAdapter(scheduler);
}
