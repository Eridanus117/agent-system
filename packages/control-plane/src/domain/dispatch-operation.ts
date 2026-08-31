export type { OrcaAutomationReceipt } from './schedule';
import { agentId, type AgentId } from './agent';
import {
  validateRfc3339Timestamp,
  validateScheduleTarget,
  type ScheduleTarget,
} from './schedule';

export type DispatchOperationPhase =
  | 'planned'
  | 'dispatched'
  | 'observing'
  | 'succeeded'
  | 'degraded'
  | 'failed'
  | 'skipped'
  | 'unknown';

export interface DispatchOperation {
  readonly operationId: string;
  readonly scheduleId: string;
  readonly agentId: AgentId;
  readonly revisionId: string;
  readonly target: ScheduleTarget;
  readonly phase: DispatchOperationPhase;
  readonly automationId: string | null;
  readonly manifestHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly terminalReason: string | null;
}

export type DispatchOperationEvent =
  | { readonly type: 'dispatched'; readonly automationId: string }
  | { readonly type: 'observing' }
  | { readonly type: 'succeeded'; readonly reason?: string }
  | { readonly type: 'degraded'; readonly reason?: string }
  | { readonly type: 'failed'; readonly reason?: string }
  | { readonly type: 'skipped'; readonly reason?: string }
  | { readonly type: 'unknown'; readonly reason?: string };

const DISPATCH_PHASES: readonly DispatchOperationPhase[] = [
  'planned',
  'dispatched',
  'observing',
  'succeeded',
  'degraded',
  'failed',
  'skipped',
  'unknown',
];
const TERMINAL_PHASES: readonly DispatchOperationPhase[] = ['succeeded', 'degraded', 'failed', 'skipped', 'unknown'];

function requireNonEmptyText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must not be empty`);
}

export function validateDispatchOperation(operation: DispatchOperation): void {
  if (typeof operation !== 'object' || operation === null || Array.isArray(operation)) throw new Error('dispatch operation must be an object');
  requireNonEmptyText(operation.operationId, 'operation id');
  requireNonEmptyText(operation.scheduleId, 'schedule id');
  agentId(operation.agentId);
  requireNonEmptyText(operation.revisionId, 'revision id');
  validateScheduleTarget(operation.target);
  if (!DISPATCH_PHASES.includes(operation.phase)) throw new Error(`invalid dispatch phase: ${String(operation.phase)}`);
  if (operation.automationId !== null) requireNonEmptyText(operation.automationId, 'automation id');
  requireNonEmptyText(operation.manifestHash, 'manifest hash');
  validateRfc3339Timestamp(operation.createdAt, 'createdAt');
  validateRfc3339Timestamp(operation.updatedAt, 'updatedAt');
  if (operation.terminalReason !== null) requireNonEmptyText(operation.terminalReason, 'terminal reason');
  if (operation.phase === 'planned' && operation.automationId !== null) throw new Error('planned dispatch must not have an automation id');
  if (['dispatched', 'observing', 'succeeded', 'degraded', 'skipped'].includes(operation.phase) && operation.automationId === null) {
    throw new Error(`${operation.phase} dispatch must have an automation id`);
  }
}

export function createDispatchOperation(input: {
  readonly operationId: string;
  readonly scheduleId: string;
  readonly agentId: AgentId;
  readonly revisionId: string;
  readonly target: ScheduleTarget;
  readonly manifestHash: string;
  readonly createdAt: string;
}): DispatchOperation {
  const operation: DispatchOperation = {
    operationId: input.operationId.trim(),
    scheduleId: input.scheduleId.trim(),
    agentId: agentId(input.agentId),
    revisionId: input.revisionId.trim(),
    target: input.target,
    phase: 'planned',
    automationId: null,
    manifestHash: input.manifestHash.trim(),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    terminalReason: null,
  };
  validateDispatchOperation(operation);
  return operation;
}

export function transitionDispatchOperation(
  operation: DispatchOperation,
  event: DispatchOperationEvent,
): { readonly ok: true; readonly operation: DispatchOperation } | { readonly ok: false; readonly reason: string } {
  validateDispatchOperation(operation);
  const nextPhase = nextPhaseFor(operation.phase, event);
  if (nextPhase === null) return { ok: false, reason: `invalid-transition:${operation.phase}:${event.type}` };

  if (event.type === 'dispatched') {
    try {
      requireNonEmptyText(event.automationId, 'automation id');
    } catch {
      return { ok: false, reason: 'invalid-event:dispatched:automation-id' };
    }
  }
  if (event.type !== 'observing' && event.type !== 'dispatched' && event.reason !== undefined) {
    try {
      requireNonEmptyText(event.reason, 'terminal reason');
    } catch {
      return { ok: false, reason: `invalid-event:${event.type}:reason` };
    }
  }

  const next: DispatchOperation = {
    operationId: operation.operationId,
    scheduleId: operation.scheduleId,
    agentId: operation.agentId,
    revisionId: operation.revisionId,
    target: operation.target,
    phase: nextPhase,
    automationId: event.type === 'dispatched' ? event.automationId.trim() : operation.automationId,
    manifestHash: operation.manifestHash,
    createdAt: operation.createdAt,
    updatedAt: new Date().toISOString(),
    terminalReason: event.type === 'observing' || event.type === 'dispatched' ? operation.terminalReason : event.reason?.trim() ?? operation.terminalReason,
  };
  validateDispatchOperation(next);
  return { ok: true, operation: next };
}

function nextPhaseFor(phase: DispatchOperationPhase, event: DispatchOperationEvent): DispatchOperationPhase | null {
  if (phase === 'planned' && event.type === 'dispatched') return 'dispatched';
  if (phase === 'planned' && (event.type === 'failed' || event.type === 'skipped' || event.type === 'unknown')) return event.type;
  if (phase === 'dispatched' && event.type === 'observing') return 'observing';
  if (phase === 'dispatched' && (event.type === 'failed' || event.type === 'skipped' || event.type === 'unknown')) return event.type;
  if (phase === 'observing' && (event.type === 'succeeded' || event.type === 'degraded' || event.type === 'failed' || event.type === 'unknown')) return event.type;
  return null;
}

export function isTerminalDispatchPhase(phase: DispatchOperationPhase): boolean {
  return TERMINAL_PHASES.includes(phase);
}
