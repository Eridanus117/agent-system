import { describe, expect, test } from 'bun:test';
import { InMemoryAgentRegistry } from '../../src/application/agent-registry';
import { InMemoryAgentAdapterRegistry } from '../../src/adapters/clients/agent-adapters';
import { OrcaAgentProvider } from '../../src/adapters/orca/agent-provider';
import { agentId, emptyUnknownReasons, type AgentCapabilitySnapshot, type AgentDescriptor, type AgentKey, type DiscoveryRecord, type SourceResult } from '../../src/domain/agent';

const key: AgentKey = { sourceId: 'orca', agentId: agentId('pi') };

function snapshot(): AgentCapabilitySnapshot {
  return {
    key,
    sourceId: key.sourceId,
    agentId: key.agentId,
    probeId: 'orca-pi-probe',
    level: 'degraded',
    version: { kind: 'known', value: '1.4.192' },
    capabilities: { launch: 'supported', scheduling: 'degraded', worktree: 'unsupported', sessionPolicy: 'unknown' },
    evidence: [],
    observedAt: '2026-08-31T00:00:00.000Z',
    unknownReasons: emptyUnknownReasons(),
  };
}

describe('Orca agent source contracts', () => {
  test('discovers only descriptors supplied as structured source records', async () => {
    const record: DiscoveryRecord = { sourceId: key.sourceId, agentId: key.agentId, providerId: 'pi-provider' };
    const provider = new OrcaAgentProvider({ descriptors: [record] });

    await expect(provider.discover()).resolves.toEqual({ status: 'complete', value: [record], attempts: 1 });
  });

  test('does not invent inventory when Orca supplies no provider descriptors', async () => {
    const provider = new OrcaAgentProvider();

    await expect(provider.discover()).resolves.toEqual({ status: 'complete', value: [], attempts: 1 });
    const result = await provider.probe({ sourceId: 'orca', agentId: agentId('hermes') });
    expect(result.status).toBe('complete');
    expect(result.value!.level).toBe('unknown');
    expect(result.value!.unknownReasons?.probe).toBe('probe-unavailable');
  });

  test('represents explicit candidates as source-only discovery records', async () => {
    const provider = new OrcaAgentProvider({ candidateAgentIds: [agentId('hermes')] });

    await expect(provider.discover()).resolves.toMatchObject({
      status: 'complete',
      value: [{ sourceId: 'orca', agentId: agentId('hermes'), providerId: null, unknownReason: 'source-only-discovery' }],
    });
  });

  test('returns the structured capability snapshot without collapsing support levels', async () => {
    const provider = new OrcaAgentProvider({ snapshots: [snapshot()] });

    await expect(provider.probe(key)).resolves.toEqual({ status: 'complete', value: snapshot(), attempts: 1 });
  });

  test('converts structured Orca discovery and probe into source-scoped results', async () => {
    const record: DiscoveryRecord = { sourceId: key.sourceId, agentId: key.agentId, providerId: 'pi-provider' };
    const provider = new OrcaAgentProvider({ descriptors: [record], snapshots: [snapshot()] });

    expect(provider.sourceId).toBe('orca');
    const discovered = await provider.discover() as SourceResult<readonly DiscoveryRecord[]>;
    expect(discovered.status).toBe('complete');
    expect(discovered.value).toEqual([record]);
    const probed = await provider.probe(key);
    expect(probed.status).toBe('complete');
    expect(probed.value!).toMatchObject({ key, sourceId: 'orca', agentId: key.agentId });
  });
  test('rejects foreign source records and snapshots with typed invalid-record results', async () => {
    const foreignKey: AgentKey = { sourceId: 'foreign-source', agentId: agentId('pi') };
    const foreignRecord: DiscoveryRecord = { sourceId: foreignKey.sourceId, agentId: foreignKey.agentId };
    const foreignSnapshot: AgentCapabilitySnapshot = { ...snapshot(), key: foreignKey, sourceId: foreignKey.sourceId, agentId: foreignKey.agentId };
    const provider = new OrcaAgentProvider({ descriptors: [foreignRecord], snapshots: [foreignSnapshot] });

    const discovered = await provider.discover();
    expect(discovered).toMatchObject({ status: 'failed', value: null, error: { code: 'invalid-record', sourceId: 'orca' } });
    const probed = await provider.probe(foreignKey);
    expect(probed).toMatchObject({ status: 'failed', value: null, error: { code: 'invalid-record', sourceId: 'orca' } });
  });
  test('isolates malformed Orca records and snapshots without dropping valid items', async () => {
    const validKey: AgentKey = { sourceId: 'orca', agentId: agentId('valid') };
    const badKey: AgentKey = { sourceId: 'orca', agentId: agentId('bad') };
    const validRecord: DiscoveryRecord = { sourceId: validKey.sourceId, agentId: validKey.agentId, providerId: 'provider' };
    const malformedLegacy = { id: badKey.agentId, displayName: '', provider: '', sourceEvidence: ' ' } as unknown as AgentDescriptor;
    const validSnapshot: AgentCapabilitySnapshot = { ...snapshot(), key: validKey, sourceId: validKey.sourceId, agentId: validKey.agentId };
    const malformedSnapshot: AgentCapabilitySnapshot = { ...snapshot(), key: badKey, sourceId: badKey.sourceId, agentId: badKey.agentId, capabilities: null as unknown as AgentCapabilitySnapshot['capabilities'] };
    const provider = new OrcaAgentProvider({ descriptors: [validRecord, malformedLegacy], snapshots: [validSnapshot, malformedSnapshot] });

    await expect(provider.discover()).resolves.toMatchObject({ status: 'partial', value: [validRecord], error: { code: 'invalid-record' } });
    await expect(provider.probe(validKey)).resolves.toMatchObject({ status: 'complete', value: validSnapshot });
    await expect(provider.probe(badKey)).resolves.toMatchObject({ status: 'failed', value: null, error: { code: 'invalid-record' } });
  });
  test('isolates a discovery record whose nested descriptor key disagrees with its record identity', async () => {
    const validKey: AgentKey = { sourceId: 'orca', agentId: agentId('valid') };
    const badKey: AgentKey = { sourceId: 'orca', agentId: agentId('bad') };
    const validRecord: DiscoveryRecord = { sourceId: validKey.sourceId, agentId: validKey.agentId, providerId: 'provider' };
    const malformedDescriptor: AgentDescriptor = { key: { sourceId: 'other-source', agentId: badKey.agentId }, sourceId: 'other-source', agentId: badKey.agentId, providerId: 'provider', displayName: 'BAD' };
    const malformedRecord = { sourceId: badKey.sourceId, agentId: badKey.agentId, descriptor: malformedDescriptor } as DiscoveryRecord;
    const provider = new OrcaAgentProvider({ descriptors: [validRecord, malformedRecord] });

    await expect(provider.discover()).resolves.toMatchObject({ status: 'partial', value: [validRecord], error: { code: 'invalid-record' } });
    const registry = new InMemoryAgentRegistry({ provider, adapters: new InMemoryAgentAdapterRegistry([]) });
    await expect(registry.list()).resolves.toMatchObject([{ key: validKey, providerId: 'provider' }]);
  });
});
