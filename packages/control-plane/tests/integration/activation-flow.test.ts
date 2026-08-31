import { describe, expect, test } from 'bun:test';
import { SqliteStore } from '../../src/adapters/sqlite/store';
import { SqliteConfigRevisionRepository } from '../../src/adapters/sqlite/repository';
import { SqliteConfigRevisionWriter } from '../../src/adapters/sqlite/config-revision-writer';
import { SqliteActivationOperationRepository } from '../../src/adapters/sqlite/activation-operation-repository';
import { SqliteLaunchObservationRepository } from '../../src/adapters/sqlite/launch-observation-repository';
import { prepareActivation, confirmActivation, executeActivation, getActivationStatus, requestConfigurationSwitch } from '../../src/application/activation';
import type { AgentAdapter, AgentCapabilitySnapshot, AgentAdapterInput, ObservedLaunch, PreparedActivation, StartedProcess } from '../../src/application/ports/agent-adapter';
import { createActivationOperation, transitionActivationOperation } from '../../src/domain/activation-operation';
import { configurationName } from '../../src/domain/configuration';
import { agentId, type AgentId } from '../../src/domain/agent';

class FakeAdapter implements AgentAdapter {
  readonly agentId = agentId('fake');
  starts = 0;
  async probe(): Promise<AgentCapabilitySnapshot> { return { probeId: 'fake-probe', agentId: this.agentId, level: 'supported', version: { kind: 'known', value: 'test' }, capabilities: {}, observedAt: new Date().toISOString(), evidenceRef: 'integration' }; }
  async prepare(input: AgentAdapterInput): Promise<PreparedActivation> { return { manifestHash: input.revision.revisionId, context: { operationId: input.operationId } }; }
  async start(_input: AgentAdapterInput & { readonly prepared: PreparedActivation }): Promise<StartedProcess> { this.starts += 1; return { processReference: { token: 'fake-process' }, exitCode: 0, signal: null }; }
  async observe(_input: AgentAdapterInput & { readonly started: StartedProcess }): Promise<ObservedLaunch> { return { outcome: 'succeeded', reason: undefined }; }
}

describe('activation integration', () => {
  test('does not start an agent before confirmation and records operation plus observation stages', async () => {
    const store = new SqliteStore(':memory:');
    const configurations = new SqliteConfigRevisionRepository(store);
    const revision = await new SqliteConfigRevisionWriter(store).create({ triggerCategory: 'new-scenario', evidenceRef: 'integration', candidate: { configName: 'default', defaultMarker: { kind: 'known', value: true }, scopeBoundary: { kind: 'unknown', reason: 'test', observedAt: new Date().toISOString() }, availability: { kind: 'known', value: 'resolved' }, capabilities: [] }, supersedesRevisionId: null });
    const adapter = new FakeAdapter();
    const deps = { configurations, operations: new SqliteActivationOperationRepository(store), observations: new SqliteLaunchObservationRepository(store), adapters: { get: (id: AgentId) => id === adapter.agentId ? adapter : null } };
    const operation = await prepareActivation(deps, { revisionId: revision.revisionId, agentId: 'fake', operationId: 'op-integration' });
    expect(operation.phase).toBe('awaiting-confirmation');
    expect(adapter.starts).toBe(0);
    await confirmActivation(deps, operation.operationId);
    const attempts = await Promise.allSettled([executeActivation(deps, operation.operationId), executeActivation(deps, operation.operationId)]);
    expect(adapter.starts).toBe(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const completed = attempts.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof executeActivation>>> => result.status === 'fulfilled')?.value;
    expect(completed?.phase).toBe('succeeded');
    const status = await getActivationStatus(deps, operation.operationId);
    expect(status.observations.map((item) => item.stage)).toEqual(['context-written', 'process-started', 'process-exited', 'outcome-observed']);
    expect(status.nextStep).toBe('no further action is required');
    store.close();
  });

  test('switch requires an existing completed operation and marks restart explicitly', async () => {
    const store = new SqliteStore(':memory:');
    const configurations = new SqliteConfigRevisionRepository(store);
    const writer = new SqliteConfigRevisionWriter(store);
    const first = await writer.create({ triggerCategory: 'new-scenario', evidenceRef: 'integration', candidate: { configName: 'default', defaultMarker: { kind: 'known', value: true }, scopeBoundary: { kind: 'known', value: 'project' }, availability: { kind: 'known', value: 'resolved' }, capabilities: [] }, supersedesRevisionId: null });
    const second = await writer.create({ triggerCategory: 'known-insufficiency', evidenceRef: 'integration', candidate: { configName: 'default', defaultMarker: { kind: 'known', value: true }, scopeBoundary: { kind: 'known', value: 'project' }, availability: { kind: 'known', value: 'resolved' }, capabilities: [] }, supersedesRevisionId: first.revisionId });
    const operations = new SqliteActivationOperationRepository(store);
    const observations = new SqliteLaunchObservationRepository(store);
    const adapter = new FakeAdapter();
    const deps = { configurations, operations, observations, adapters: { get: () => adapter } };
    await expect(requestConfigurationSwitch(deps, { currentOperationId: 'missing', newRevisionId: second.revisionId, agentId: 'fake' })).rejects.toThrow('activation operation not found');
    const missing = await prepareActivation(deps, { revisionId: 'missing-revision', agentId: 'fake', operationId: 'op-missing' });
    expect(missing.phase).toBe('failed');
    expect(missing.revisionId).toBeNull();
    let current = createActivationOperation({ operationId: 'op-current', revisionId: first.revisionId, configName: configurationName('default'), agentId: agentId('fake'), planHash: 'hash', createdAt: '2026-08-29T00:00:00.000Z' });
    for (const event of [{ type: 'awaiting-confirmation' }, { type: 'confirmed' }, { type: 'succeeded' }] as const) {
      const transitioned = transitionActivationOperation(current, event);
      if (!transitioned.ok) throw new Error(transitioned.reason);
      current = transitioned.operation;
    }
    await operations.insert(current);
    await expect(requestConfigurationSwitch(deps, { currentOperationId: current.operationId, newRevisionId: 'missing-target', agentId: 'fake' })).rejects.toThrow('revision not found');
    expect((await operations.findById(current.operationId))?.phase).toBe('succeeded');
    const switched = await requestConfigurationSwitch(deps, { currentOperationId: current.operationId, newRevisionId: second.revisionId, agentId: 'fake' });
    expect(switched.previous.phase).toBe('requires-restart');
    expect(switched.next.phase).toBe('awaiting-confirmation');
    store.close();
  });
});
