import type { AgentId } from './agent';
import type { ConfigurationName, ConfigurationRevisionId } from './configuration';

export type ActivationOperationPhase =
  | 'prepared'
  | 'awaiting-confirmation'
  | 'applying'
  | 'succeeded'
  | 'degraded'
  | 'failed'
  | 'cancelled'
  | 'requires-restart';

export interface ActivationOperation {
  readonly operationId: string;
  readonly revisionId: ConfigurationRevisionId | null;
  readonly configName: ConfigurationName;
  readonly agentId: AgentId;
  readonly phase: ActivationOperationPhase;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly planHash: string;
  readonly terminalReason: string | undefined;
}

export type ActivationOperationEvent =
  | { readonly type: 'prepared' }
  | { readonly type: 'awaiting-confirmation' }
  | { readonly type: 'confirmed' }
  | { readonly type: 'succeeded' }
  | { readonly type: 'degraded'; readonly reason?: string }
  | { readonly type: 'failed'; readonly reason: string }
  | { readonly type: 'cancelled'; readonly reason?: string }
  | { readonly type: 'requires-restart'; readonly reason: string };

export function createActivationOperation(params: {
  readonly operationId: string;
  readonly revisionId: ConfigurationRevisionId | null;
  readonly configName: ConfigurationName;
  readonly agentId: AgentId;
  readonly planHash: string;
  readonly createdAt: string;
}): ActivationOperation {
  return { ...params, phase: 'prepared', version: 0, updatedAt: params.createdAt, terminalReason: undefined };
}

export function transitionActivationOperation(
  operation: ActivationOperation,
  event: ActivationOperationEvent,
): { readonly ok: true; readonly operation: ActivationOperation } | { readonly ok: false; readonly reason: string } {
  const nextPhase = nextPhaseFor(operation.phase, event);
  if (nextPhase === null) return { ok: false, reason: `invalid-transition:${operation.phase}:${event.type}` };
  const terminalReason = 'reason' in event ? event.reason : undefined;
  return {
    ok: true,
    operation: {
      ...operation,
      phase: nextPhase,
      version: operation.version + 1,
      updatedAt: new Date().toISOString(),
      terminalReason: terminalReason ?? operation.terminalReason,
    },
  };
}

function nextPhaseFor(phase: ActivationOperationPhase, event: ActivationOperationEvent): ActivationOperationPhase | null {
  if (phase === 'prepared' && event.type === 'awaiting-confirmation') return 'awaiting-confirmation';
  if (phase === 'prepared' && event.type === 'failed') return 'failed';
  if (phase === 'prepared' && event.type === 'cancelled') return 'cancelled';
  if (phase === 'prepared' && event.type === 'requires-restart') return 'requires-restart';
  if (phase === 'awaiting-confirmation' && event.type === 'confirmed') return 'applying';
  if (phase === 'awaiting-confirmation' && event.type === 'cancelled') return 'cancelled';
  if (phase === 'awaiting-confirmation' && event.type === 'failed') return 'failed';
  if (phase === 'applying' && event.type === 'succeeded') return 'succeeded';
  if (phase === 'applying' && event.type === 'degraded') return 'degraded';
  if (phase === 'applying' && event.type === 'failed') return 'failed';
  if (phase === 'applying' && event.type === 'requires-restart') return 'requires-restart';
  if ((phase === 'succeeded' || phase === 'degraded') && event.type === 'requires-restart') return 'requires-restart';
  return null;
}

export function isTerminalActivationPhase(phase: ActivationOperationPhase): boolean {
  return ['succeeded', 'degraded', 'failed', 'cancelled', 'requires-restart'].includes(phase);
}
