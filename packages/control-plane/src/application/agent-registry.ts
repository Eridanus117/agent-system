import type { AgentAdapter, AgentAdapterRegistry } from './ports/agent-adapter';
import type { AgentRegistry, OrcaAgentProviderPort } from './ports/agent-registry';
import type { AgentCapabilitySnapshot, AgentDescriptor, AgentId } from '../domain/agent';
import type { ConfigurationRevision } from '../domain/configuration';

export interface AgentRegistryDependencies {
  readonly provider: OrcaAgentProviderPort;
  readonly adapters: AgentAdapterRegistry;
}

/** 将 Orca 发现证据与本地原生 adapter 组合为一个注册表。 */
export class InMemoryAgentRegistry implements AgentRegistry {
  private readonly provider: OrcaAgentProviderPort;
  private readonly adapters: AgentAdapterRegistry;

  constructor(dependencies: AgentRegistryDependencies) {
    this.provider = dependencies.provider;
    this.adapters = dependencies.adapters;
  }

  async list(): Promise<readonly AgentDescriptor[]> {
    return this.provider.discover();
  }

  async get(agentIdValue: AgentId): Promise<AgentDescriptor | null> {
    const descriptors = await this.list();
    return descriptors.find((descriptor) => descriptor.id === agentIdValue) ?? null;
  }

  async probe(agentIdValue: AgentId, revision?: ConfigurationRevision): Promise<AgentCapabilitySnapshot> {
    const adapter = this.adapter(agentIdValue);
    if (adapter !== null) return adapter.probe(revision === undefined ? undefined : { revision });
    return this.provider.probe(agentIdValue);
  }

  adapter(agentIdValue: AgentId): AgentAdapter | null {
    return this.adapters.get(agentIdValue);
  }
}

export function createAgentRegistry(dependencies: AgentRegistryDependencies): AgentRegistry {
  return new InMemoryAgentRegistry(dependencies);
}
