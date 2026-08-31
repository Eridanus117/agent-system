import type { AgentAdapter } from './agent-adapter';
import type { AgentCapabilitySnapshot, AgentDescriptor, AgentId } from '../../domain/agent';
import type { ConfigurationRevision } from '../../domain/configuration';

export interface AgentRegistry {
  list(): Promise<readonly AgentDescriptor[]>;
  get(agentId: AgentId): Promise<AgentDescriptor | null>;
  probe(agentId: AgentId, revision?: ConfigurationRevision): Promise<AgentCapabilitySnapshot>;
  adapter(agentId: AgentId): AgentAdapter | null;
}

export interface OrcaAgentProviderPort {
  discover(): Promise<readonly AgentDescriptor[]>;
  probe(agentId: AgentId): Promise<AgentCapabilitySnapshot>;
}
