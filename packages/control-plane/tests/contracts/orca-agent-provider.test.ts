import { describe, expect, test } from 'bun:test';
import { OrcaAgentProvider } from '../../src/adapters/orca/agent-provider';
import { agentId, type AgentCapabilitySnapshot } from '../../src/domain/agent';

describe('Orca agent provider contracts', () => {
  test('discovers only descriptors supplied as structured evidence', async () => {
    const descriptor = { id: agentId('pi'), displayName: 'Pi', provider: 'orca', sourceEvidence: 'orca:agent-context:pi' };
    const provider = new OrcaAgentProvider({ descriptors: [descriptor] });

    await expect(provider.discover()).resolves.toEqual([descriptor]);
  });

  test('does not invent inventory when Orca supplies no provider descriptors', async () => {
    const provider = new OrcaAgentProvider();

    await expect(provider.discover()).resolves.toEqual([]);
    const snapshot = await provider.probe(agentId('hermes'));
    expect(snapshot.level).toBe('unknown');
    expect(snapshot.version.kind).toBe('unknown');
    expect(snapshot.evidenceRef).toBe('unknown:orca-provider-inventory-unavailable');
  });

  test('returns unknown-evidence descriptors for explicit candidates without inventory', async () => {
    const provider = new OrcaAgentProvider({ candidateAgentIds: [agentId('hermes')] });

    await expect(provider.discover()).resolves.toEqual([{
      id: agentId('hermes'),
      displayName: 'hermes',
      provider: 'orca',
      sourceEvidence: 'unknown:orca-provider-inventory-unavailable',
    }]);
  });

  test('returns the structured capability snapshot without collapsing support levels', async () => {
    const snapshot: AgentCapabilitySnapshot = {
      probeId: 'orca-pi-probe',
      agentId: agentId('pi'),
      level: 'degraded',
      version: { kind: 'known', value: '1.4.192' },
      capabilities: { launch: 'supported', scheduling: 'degraded', worktree: 'unsupported', sessionPolicy: 'unknown' },
      observedAt: '2026-08-31T00:00:00.000Z',
      evidenceRef: 'orca:agent-context:pi',
    };
    const provider = new OrcaAgentProvider({ snapshots: [snapshot] });

    await expect(provider.probe(snapshot.agentId)).resolves.toBe(snapshot);
  });
});
