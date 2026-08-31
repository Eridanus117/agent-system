import { describe, expect, test } from 'bun:test';
import type { AgentAdapter, AgentAdapterInput, AgentCapabilitySnapshot, ObservedLaunch, PreparedActivation, StartedProcess } from '../../src/application/ports/agent-adapter';
import { agentId } from '../../src/domain/agent';
import { configurationName, configurationRevisionId, type ConfigurationRevision } from '../../src/domain/configuration';

const revision: ConfigurationRevision = {
  configName: configurationName('default'),
  revisionId: configurationRevisionId('revision-1'),
  schemaVersion: 1,
  defaultMarker: { kind: 'known', value: true },
  scopeBoundary: { kind: 'known', value: 'project' },
  availability: { kind: 'known', value: 'resolved' },
  capabilities: [],
  createdAt: '2026-08-31T00:00:00.000Z',
  triggerCategory: 'new-scenario',
  evidenceRef: 'tests/contracts/agent-adapter.test.ts',
  supersedesRevisionId: null,
};

class ContractAdapter implements AgentAdapter {
  readonly agentId = agentId('test-agent');
  readonly snapshot: AgentCapabilitySnapshot = {
    probeId: 'probe-1',
    agentId: this.agentId,
    level: 'degraded',
    version: { kind: 'unknown', reason: 'version unavailable', observedAt: revision.createdAt },
    capabilities: { instruction: 'supported', skill: 'degraded', mcp: 'unsupported', hook: 'unknown' },
    observedAt: revision.createdAt,
    evidenceRef: 'fixture:probe-1',
  };

  async probe(_input?: { readonly revision: ConfigurationRevision }): Promise<AgentCapabilitySnapshot> {
    return this.snapshot;
  }
  async prepare(input: AgentAdapterInput): Promise<PreparedActivation> {
    return { manifestHash: input.revision.revisionId, context: { operationId: input.operationId } };
  }
  async start(input: AgentAdapterInput & { readonly prepared: PreparedActivation }): Promise<StartedProcess> {
    return { processReference: { token: `started:${input.prepared.manifestHash}` }, exitCode: 0, signal: null };
  }
  async observe(_input: AgentAdapterInput & { readonly started: StartedProcess }): Promise<ObservedLaunch> {
    return { outcome: 'succeeded', reason: undefined };
  }
}

describe('AgentAdapter contract', () => {
  test('keeps agent identity and immutable support snapshot evidence', async () => {
    const adapter = new ContractAdapter();
    const snapshot = await adapter.probe({ revision });
    expect(adapter.agentId).toBe(agentId('test-agent'));
    expect(snapshot).toBe(adapter.snapshot);
    expect(snapshot.capabilities).toEqual({ instruction: 'supported', skill: 'degraded', mcp: 'unsupported', hook: 'unknown' });
    expect(snapshot.version).toEqual({ kind: 'unknown', reason: 'version unavailable', observedAt: revision.createdAt });
  });

  test('passes prepared activation through start and observes the launch', async () => {
    const adapter = new ContractAdapter();
    const input = { operationId: 'operation-1', revision };
    const prepared = await adapter.prepare(input);
    const started = await adapter.start({ ...input, prepared });
    await expect(adapter.observe({ ...input, started })).resolves.toEqual({ outcome: 'succeeded', reason: undefined });
    expect(started.processReference).toEqual({ token: 'started:revision-1' });
  });
});
