import { describe, expect, test } from 'bun:test';
import type { AgentAdapter, AgentAdapterInput, AgentCapabilitySnapshot, ObservedLaunch, PreparedActivation, StartedProcess } from '../../src/application/ports/agent-adapter';
import { InMemoryAgentRegistry } from '../../src/application/agent-registry';
import { InMemoryAgentAdapterRegistry, ClaudeAgentAdapter, OmpAgentAdapter } from '../../src/adapters/clients/agent-adapters';
import { OrcaAgentProvider } from '../../src/adapters/orca/agent-provider';
import { agentId } from '../../src/domain/agent';
import { configurationName, configurationRevisionId, type ConfigurationRevision } from '../../src/domain/configuration';

const revision: ConfigurationRevision = {
  configName: configurationName('default'),
  revisionId: configurationRevisionId('revision-registry-test'),
  schemaVersion: 1,
  defaultMarker: { kind: 'known', value: true },
  scopeBoundary: { kind: 'known', value: 'project' },
  availability: { kind: 'known', value: 'resolved' },
  capabilities: [],
  createdAt: '2026-08-31T00:00:00.000Z',
  triggerCategory: 'new-scenario',
  evidenceRef: 'tests/contracts/agent-registry.test.ts',
  supersedesRevisionId: null,
};

class ProbeAdapter implements AgentAdapter {
  readonly agentId = agentId('fixture');
  readonly snapshot: AgentCapabilitySnapshot = {
    probeId: 'fixture-probe',
    agentId: this.agentId,
    level: 'degraded',
    version: { kind: 'known', value: 'fixture-1' },
    capabilities: { launch: 'supported', scheduling: 'unknown', worktree: 'degraded', sessionPolicy: 'unsupported' },
    observedAt: '2026-08-31T00:00:00.000Z',
    evidenceRef: 'fixture:probe',
  };

  async probe(): Promise<AgentCapabilitySnapshot> {
    return this.snapshot;
  }
  async prepare(_input: AgentAdapterInput): Promise<PreparedActivation> {
    return { manifestHash: 'fixture-manifest', context: {} };
  }
  async start(_input: AgentAdapterInput & { readonly prepared: PreparedActivation }): Promise<StartedProcess> {
    return { processReference: { token: 'fixture-process' }, exitCode: 0, signal: null };
  }
  async observe(_input: AgentAdapterInput & { readonly started: StartedProcess }): Promise<ObservedLaunch> {
    return { outcome: 'succeeded', reason: undefined };
  }
}

describe('Agent registry contracts', () => {
  test('lists known Orca provider descriptors with source evidence', async () => {
    const descriptor = { id: agentId('codex'), displayName: 'Codex', provider: 'orca', sourceEvidence: 'orca:agent-context:codex' };
    const registry = new InMemoryAgentRegistry({ provider: new OrcaAgentProvider({ descriptors: [descriptor] }), adapters: new InMemoryAgentAdapterRegistry([]) });

    await expect(registry.list()).resolves.toEqual([descriptor]);
    await expect(registry.get(descriptor.id)).resolves.toEqual(descriptor);
    expect(descriptor.sourceEvidence).toBe('orca:agent-context:codex');
  });

  test('returns null for an unknown AgentId', async () => {
    const registry = new InMemoryAgentRegistry({ provider: new OrcaAgentProvider({ descriptors: [{ id: agentId('omp'), displayName: 'OMP', provider: 'orca', sourceEvidence: 'orca:agent-context:omp' }] }), adapters: new InMemoryAgentAdapterRegistry([]) });

    await expect(registry.get(agentId('missing'))).resolves.toBeNull();
  });

  test('returns unknown instead of supported when provider discovery has no evidence', async () => {
    const registry = new InMemoryAgentRegistry({ provider: new OrcaAgentProvider(), adapters: new InMemoryAgentAdapterRegistry([]) });

    const snapshot = await registry.probe(agentId('codex'));
    expect(snapshot.level).toBe('unknown');
    expect(Object.values(snapshot.capabilities)).not.toContain('supported');
    expect(snapshot.evidenceRef).toBe('unknown:orca-provider-inventory-unavailable');
  });

  test('preserves independent capability levels from provider evidence', async () => {
    const snapshot: AgentCapabilitySnapshot = {
      probeId: 'orca-codex-probe',
      agentId: agentId('codex'),
      level: 'degraded',
      version: { kind: 'known', value: '1.4.192' },
      capabilities: { launch: 'supported', scheduling: 'degraded', worktree: 'unsupported', sessionPolicy: 'unknown' },
      observedAt: '2026-08-31T00:00:00.000Z',
      evidenceRef: 'orca:agent-context:codex',
    };
    const registry = new InMemoryAgentRegistry({ provider: new OrcaAgentProvider({ snapshots: [snapshot] }), adapters: new InMemoryAgentAdapterRegistry([]) });

    await expect(registry.probe(snapshot.agentId)).resolves.toEqual(snapshot);
  });

  test('returns OMP and Claude adapters through the registry', () => {
    const adapters = new InMemoryAgentAdapterRegistry([new OmpAgentAdapter(), new ClaudeAgentAdapter()]);
    const registry = new InMemoryAgentRegistry({ provider: new OrcaAgentProvider(), adapters });

    expect(registry.adapter(agentId('omp'))).toBeInstanceOf(OmpAgentAdapter);
    expect(registry.adapter(agentId('claude-code'))).toBeInstanceOf(ClaudeAgentAdapter);
    expect(registry.adapter(agentId('unknown'))).toBeNull();
  });

  test('probes a native adapter before asking the Orca provider', async () => {
    const adapter = new ProbeAdapter();
    const provider = new OrcaAgentProvider({ snapshots: [{ ...adapter.snapshot, level: 'supported' }] });
    const registry = new InMemoryAgentRegistry({ provider, adapters: new InMemoryAgentAdapterRegistry([adapter]) });

    await expect(registry.probe(adapter.agentId, revision)).resolves.toEqual(adapter.snapshot);
  });
});
