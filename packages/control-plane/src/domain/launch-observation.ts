import type { AgentId } from './agent';

export type LaunchObservationStage = 'process-started' | 'context-written' | 'process-exited' | 'outcome-observed';
export type LaunchObservationOutcome = 'succeeded' | 'degraded' | 'failed' | 'incomplete' | 'unknown' | 'not-available';

export interface ProcessReference {
  readonly pid?: number;
  readonly token?: string;
}

const MAX_PROCESS_TOKEN_LENGTH = 256;
export function normalizeProcessReference(value: ProcessReference): ProcessReference {
  if (typeof value !== 'object' || value === null) throw new Error('process reference must be an object');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'pid' && key !== 'token')) throw new Error('process reference contains unknown fields');
  const normalized: { pid?: number; token?: string } = {};
  if (input.pid !== undefined) {
    if (typeof input.pid !== 'number' || !Number.isInteger(input.pid) || input.pid <= 0 || input.pid > 2_147_483_647) throw new Error('process reference pid must be a positive 32-bit integer');
    normalized.pid = input.pid;
  }
  if (input.token !== undefined) {
    if (typeof input.token !== 'string' || input.token.length === 0 || input.token.length > MAX_PROCESS_TOKEN_LENGTH || /[\u0000-\u001f\u007f]/u.test(input.token)) throw new Error('process reference token is invalid');
    normalized.token = input.token;
  }
  if (normalized.pid === undefined && normalized.token === undefined) throw new Error('process reference must identify a process');
  return normalized;
}

function normalizeReason(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 256 || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new Error('observation reason is invalid');
  return normalized;
}

export interface LaunchObservation {
  readonly observationId: string;
  readonly operationId: string;
  readonly agentId: AgentId;
  readonly stage: LaunchObservationStage;
  readonly outcome: LaunchObservationOutcome;
  readonly processReference: ProcessReference | undefined;
  readonly reason: string | undefined;
  readonly observedAt: string;
}

export function createLaunchObservation(params: Omit<LaunchObservation, 'observationId'> & { readonly observationId?: string }): LaunchObservation {
  const processReference = params.processReference === undefined ? undefined : normalizeProcessReference(params.processReference);
  return { ...params, processReference, reason: normalizeReason(params.reason), observationId: params.observationId ?? crypto.randomUUID() };
}
