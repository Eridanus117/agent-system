import type { AgentCapabilitySnapshot, AgentId, AgentKey } from '../../domain/agent';
import type { ConfigurationRevision } from '../../domain/configuration';
import type { ProcessReference } from '../../domain/launch-observation';

export type { AgentCapabilitySnapshot, AgentId, AgentKey } from '../../domain/agent';

export interface PreparedActivation {
  readonly manifestHash: string;
  readonly context: Record<string, unknown>;
}

export interface StartedProcess {
  readonly processReference: ProcessReference;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly context?: Record<string, unknown>;
  readonly terminate?: () => Promise<void>;
  readonly waitForExit?: Promise<{ readonly exitCode: number; readonly signal: string | null }>;
}

export interface ObservedLaunch {
  readonly outcome: 'succeeded' | 'degraded' | 'failed' | 'incomplete' | 'unknown' | 'not-available';
  readonly reason: string | undefined;
}

export interface AgentAdapterInput {
  readonly operationId: string;
  readonly revision: ConfigurationRevision;
  readonly forwardedArgs?: readonly string[];
}

export interface AgentAdapter {
  readonly agentId: AgentId;
  probe(input?: { readonly revision: ConfigurationRevision }): Promise<AgentCapabilitySnapshot>;
  prepare(input: AgentAdapterInput): Promise<PreparedActivation>;
  start(input: AgentAdapterInput & { readonly prepared: PreparedActivation }): Promise<StartedProcess>;
  observe(input: AgentAdapterInput & { readonly started: StartedProcess }): Promise<ObservedLaunch>;
  abort?(input: AgentAdapterInput & { readonly prepared: PreparedActivation; readonly started?: StartedProcess }): Promise<void>;
}

export type AgentAdapterLookup = AgentKey | AgentId;

export interface AgentAdapterRegistry {
  get(key: AgentAdapterLookup): AgentAdapter | null;
}
