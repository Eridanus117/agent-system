import type { AgentAdapter, AgentAdapterRegistry } from './agent-adapter';
import type { AgentCapabilitySnapshot, AgentDescriptor, AgentId, AgentKey, AgentSourceId, AgentSourceError, DiscoveryRecord, SourceResult } from '../../domain/agent';
import type { ConfigurationRevision } from '../../domain/configuration';

export interface AgentSourcePort {
  readonly sourceId: AgentSourceId;
  discover(): Promise<SourceResult<readonly DiscoveryRecord[]>>;
  probe?(key: AgentKey, revision?: ConfigurationRevision): Promise<SourceResult<AgentCapabilitySnapshot>>;
}

export type RegistryMutationResult =
  | { readonly status: 'inserted' | 'updated' | 'merged' | 'unchanged'; readonly descriptor: AgentDescriptor }
  | { readonly status: 'conflict'; readonly error: 'duplicate-key' | 'identity-mismatch' | 'provider-mismatch' | 'migration-conflict' | 'invalid-record' };

export type AgentLookup = AgentKey | AgentId;

export interface AgentRegistry {
  list(): Promise<readonly AgentDescriptor[]>;
  get(key: AgentLookup): Promise<AgentDescriptor | null>;
  probe(key: AgentLookup, revision?: ConfigurationRevision): Promise<AgentCapabilitySnapshot>;
  adapter(key: AgentLookup): AgentAdapter | null;
  register?(record: DiscoveryRecord): Promise<RegistryMutationResult>;
  upsert?(record: DiscoveryRecord): Promise<RegistryMutationResult>;
  merge?(record: DiscoveryRecord): Promise<RegistryMutationResult>;
}

export type { AgentAdapterRegistry, AgentCapabilitySnapshot, AgentDescriptor, AgentId, AgentKey, AgentSourceError, DiscoveryRecord, SourceResult };
