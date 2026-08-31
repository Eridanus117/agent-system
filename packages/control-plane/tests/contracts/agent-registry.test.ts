import { describe, expect, test } from 'bun:test';
import type { AgentAdapter, AgentAdapterInput, AgentCapabilitySnapshot, ObservedLaunch, PreparedActivation, StartedProcess } from '../../src/application/ports/agent-adapter';
import type { AgentSourcePort } from '../../src/application/ports/agent-registry';
import { InMemoryAgentRegistry } from '../../src/application/agent-registry';
import { InMemoryAgentAdapterRegistry } from '../../src/adapters/clients/agent-adapters';
import { OrcaAgentProvider } from '../../src/adapters/orca/agent-provider';
import { agentId, emptyUnknownReasons, type AgentKey, type DiscoveryRecord, type SourceResult } from '../../src/domain/agent';
import { configurationName, configurationRevisionId, type ConfigurationRevision } from '../../src/domain/configuration';

const revision: ConfigurationRevision = {
  configName: configurationName('default'), revisionId: configurationRevisionId('revision-registry-test'), schemaVersion: 1,
  defaultMarker: { kind: 'known', value: true }, scopeBoundary: { kind: 'known', value: 'project' }, availability: { kind: 'known', value: 'resolved' },
  capabilities: [], createdAt: '2026-08-31T00:00:00.000Z', triggerCategory: 'new-scenario', evidenceRef: 'tests/contracts/agent-registry.test.ts', supersedesRevisionId: null,
};

class ProbeAdapter implements AgentAdapter {
  readonly agentId = agentId('fixture');
  readonly snapshot: AgentCapabilitySnapshot = {
    key: { sourceId: 'orca', agentId: this.agentId }, sourceId: 'orca', agentId: this.agentId, probeId: 'fixture-probe', level: 'degraded',
    version: { kind: 'known', value: 'fixture-1' }, capabilities: { launch: 'supported', scheduling: 'unknown', worktree: 'degraded', sessionPolicy: 'unsupported' },
    evidence: [], observedAt: '2026-08-31T00:00:00.000Z', unknownReasons: emptyUnknownReasons(),
  };
  async probe(): Promise<AgentCapabilitySnapshot> { return this.snapshot; }
  async prepare(_input: AgentAdapterInput): Promise<PreparedActivation> { return { manifestHash: 'fixture-manifest', context: {} }; }
  async start(_input: AgentAdapterInput & { readonly prepared: PreparedActivation }): Promise<StartedProcess> { return { processReference: { token: 'fixture-process' }, exitCode: 0, signal: null }; }
  async observe(_input: AgentAdapterInput & { readonly started: StartedProcess }): Promise<ObservedLaunch> { return { outcome: 'succeeded', reason: undefined }; }
}

class ThrowingProbeAdapter extends ProbeAdapter {
  override async probe(): Promise<AgentCapabilitySnapshot> { throw new Error('adapter probe failed'); }
}

function source(sourceId: string, records: readonly DiscoveryRecord[], probe?: AgentSourcePort['probe']): AgentSourcePort {
  return { sourceId, async discover() { return { status: 'complete', value: records, attempts: 1 }; }, probe };
}

describe('Agent registry contracts', () => {
  test('keeps same AgentId isolated by source and makes register replay idempotent', async () => {
    const keyA: AgentKey = { sourceId: 'source-a', agentId: agentId('same-agent') };
    const keyB: AgentKey = { sourceId: 'source-b', agentId: agentId('same-agent') };
    const recordA: DiscoveryRecord = { sourceId: keyA.sourceId, agentId: keyA.agentId, providerId: 'provider-a' };
    const recordB: DiscoveryRecord = { sourceId: keyB.sourceId, agentId: keyB.agentId, providerId: 'provider-b' };
    const registry = new InMemoryAgentRegistry({ sources: [source('source-a', [recordA]), source('source-b', [recordB])], adapters: new InMemoryAgentAdapterRegistry([]) });

    await expect(registry.list()).resolves.toHaveLength(2);
    await expect(registry.get(keyA)).resolves.toMatchObject({ key: keyA, providerId: 'provider-a' });
    await expect(registry.get(keyB)).resolves.toMatchObject({ key: keyB, providerId: 'provider-b' });
    await expect(registry.register!(recordA)).resolves.toMatchObject({ status: 'unchanged' });
    await expect(registry.register!({ ...recordA, providerId: 'provider-conflict' })).resolves.toMatchObject({ status: 'conflict', error: 'provider-mismatch' });
  });

  test('supports upsert and merge without crossing source identity', async () => {
    const key: AgentKey = { sourceId: 'source-a', agentId: agentId('mergeable') };
    const registry = new InMemoryAgentRegistry({ sources: [], adapters: new InMemoryAgentAdapterRegistry([]) });
    await expect(registry.upsert!({ sourceId: key.sourceId, agentId: key.agentId, providerId: 'provider-a', evidence: ['one'] })).resolves.toMatchObject({ status: 'inserted' });
    await expect(registry.merge!({ sourceId: key.sourceId, agentId: key.agentId, providerId: 'provider-a', evidence: ['one', 'two'] })).resolves.toMatchObject({ status: 'merged', descriptor: { evidence: ['one', 'two'] } });
    await expect(registry.upsert!({ sourceId: 'source-b', agentId: key.agentId, providerId: 'provider-b' })).resolves.toMatchObject({ status: 'inserted' });
    await expect(registry.list()).resolves.toHaveLength(2);
  });

  test('projects missing and typed failed probes as unknown without inventing a key', async () => {
    const missing: AgentKey = { sourceId: 'no-probe', agentId: agentId('known') };
    const failed: AgentKey = { sourceId: 'failed-probe', agentId: agentId('known') };
    const failedProbe: NonNullable<AgentSourcePort['probe']> = async (key) => ({ status: 'failed', value: null, error: { code: 'probe-failed', sourceId: key.sourceId, key, retryable: false, attempt: 1, maxAttempts: 1, message: 'probe failed' }, attempts: 1 });
    const registry = new InMemoryAgentRegistry({ sources: [source('no-probe', [{ sourceId: missing.sourceId, agentId: missing.agentId }]), source('failed-probe', [{ sourceId: failed.sourceId, agentId: failed.agentId }], failedProbe)], adapters: new InMemoryAgentAdapterRegistry([]) });

    await registry.list();
    await expect(registry.probe(missing)).resolves.toMatchObject({ key: missing, level: 'unknown', unknownReasons: expect.objectContaining({ probe: 'probe-unavailable' }) });
    await expect(registry.probe(failed)).resolves.toMatchObject({ key: failed, level: 'unknown', unknownReasons: expect.objectContaining({ probe: 'probe-failed' }) });
    await expect(registry.get({ sourceId: 'missing', agentId: agentId('never-discovered') })).resolves.toBeNull();
  });

  test('retains partial discovery rows and projects retry exhaustion after attempts are spent', async () => {
    const key: AgentKey = { sourceId: 'retrying', agentId: agentId('partial') };
    const record: DiscoveryRecord = { sourceId: key.sourceId, agentId: key.agentId };
    let attempts = 0;
    const retrying: AgentSourcePort = { sourceId: key.sourceId, async discover(): Promise<SourceResult<readonly DiscoveryRecord[]>> {
      attempts += 1;
      if (attempts < 3) return { status: 'partial', value: [record], error: { code: 'discovery-failed', sourceId: key.sourceId, key, retryable: true, attempt: attempts, maxAttempts: 3, message: 'retry' }, attempts };
      return { status: 'failed', value: null, error: { code: 'discovery-failed', sourceId: key.sourceId, key, retryable: false, attempt: attempts, maxAttempts: 3, message: 'exhausted' }, attempts };
    } };
    const registry = new InMemoryAgentRegistry({ sources: [retrying], adapters: new InMemoryAgentAdapterRegistry([]), maxAttempts: 3 });

    const listed = await registry.list();
    expect(listed[0]).toMatchObject({ key, unknownReasons: expect.objectContaining({ discovery: 'discovery-failed' }) });
    expect(attempts).toBe(3);
  });

  test('scopes adapter lookup by source while retaining Orca composition compatibility', async () => {
    const adapter = new ProbeAdapter();
    const registry = new InMemoryAgentRegistry({ adapters: new InMemoryAgentAdapterRegistry([adapter]) });
    const orcaKey: AgentKey = { sourceId: 'orca', agentId: adapter.agentId };
    const foreignKey: AgentKey = { sourceId: 'other-source', agentId: adapter.agentId };

    expect(registry.adapter(foreignKey)).toBeNull();
    expect(registry.adapter(orcaKey)).toBe(adapter);
    await expect(registry.probe(foreignKey)).resolves.toMatchObject({ key: foreignKey, level: 'unknown' });
    await expect(registry.probe(orcaKey)).resolves.toEqual(adapter.snapshot);
  });

  test('probes a native adapter before asking the Orca provider', async () => {
    const adapter = new ProbeAdapter();
    const registry = new InMemoryAgentRegistry({ provider: source('orca', [], async () => ({ status: 'failed', value: null, error: { code: 'probe-failed', sourceId: 'orca', retryable: false, attempt: 1, maxAttempts: 1, message: 'should not run' }, attempts: 1 })), adapters: new InMemoryAgentAdapterRegistry([adapter]) });
    await expect(registry.probe(adapter.agentId, revision)).resolves.toEqual(adapter.snapshot);
  });
});

  test('projects thrown source and adapter probes as typed unknown failures', async () => {
    const sourceKey: AgentKey = { sourceId: 'throwing-source', agentId: agentId('source-throw') };
    const timeoutKey: AgentKey = { sourceId: 'throwing-source', agentId: agentId('source-timeout') };
    const records = [sourceKey, timeoutKey].map((key) => ({ sourceId: key.sourceId, agentId: key.agentId }));
    const source: AgentSourcePort = {
      sourceId: 'throwing-source',
      async discover() { return { status: 'complete', value: records, attempts: 1 }; },
      async probe(key) {
        if (key.agentId === sourceKey.agentId) throw new Error('probe failed');
        const error = new Error('probe timeout');
        error.name = 'TimeoutError';
        throw error;
      },
    };
    const adapter = new ProbeAdapter();
    const throwingAdapter = new ThrowingProbeAdapter();
    const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([throwingAdapter]) });

    await expect(registry.probe(sourceKey)).resolves.toMatchObject({ key: sourceKey, level: 'unknown', unknownReasons: expect.objectContaining({ probe: 'probe-failed' }) });
    await expect(registry.probe(timeoutKey)).resolves.toMatchObject({ key: timeoutKey, level: 'unknown', unknownReasons: expect.objectContaining({ probe: 'probe-timeout' }) });
    await expect(registry.probe({ sourceId: 'orca', agentId: adapter.agentId })).resolves.toMatchObject({ level: 'unknown', unknownReasons: expect.objectContaining({ probe: 'probe-failed' }) });
  });

  test('retries retryable partial, failed, and timeout probe results before projecting exhaustion', async () => {
    const keys = {
      partial: { sourceId: 'retry-probe', agentId: agentId('partial') },
      failed: { sourceId: 'retry-probe', agentId: agentId('failed') },
      timeout: { sourceId: 'retry-probe', agentId: agentId('timeout') },
      exhausted: { sourceId: 'retry-probe', agentId: agentId('exhausted') },
    } satisfies Record<string, AgentKey>;
    const calls = new Map<string, number>();
    const records = Object.values(keys).map((key) => ({ sourceId: key.sourceId, agentId: key.agentId }));
    const snapshot = (key: AgentKey): AgentCapabilitySnapshot => ({
      key, sourceId: key.sourceId, agentId: key.agentId, probeId: `${key.agentId}-probe`, level: 'supported',
      version: { kind: 'known', value: '1' }, capabilities: { launch: 'supported' }, evidence: [], observedAt: '2026-08-31T00:00:00.000Z', unknownReasons: emptyUnknownReasons(),
    });
    const source: AgentSourcePort = {
      sourceId: 'retry-probe',
      async discover() { return { status: 'complete', value: records, attempts: 1 }; },
      async probe(key) {
        const attempt = (calls.get(key.agentId) ?? 0) + 1;
        calls.set(key.agentId, attempt);
        if (key.agentId === keys.partial.agentId && attempt === 1) return { status: 'partial', value: snapshot(key), error: { code: 'probe-failed', sourceId: key.sourceId, key, retryable: true, attempt, maxAttempts: 2, message: 'partial' }, attempts: attempt };
        if (key.agentId === keys.failed.agentId && attempt === 1) return { status: 'failed', value: null, error: { code: 'probe-failed', sourceId: key.sourceId, key, retryable: true, attempt, maxAttempts: 2, message: 'failed' }, attempts: attempt };
        if (key.agentId === keys.timeout.agentId && attempt === 1) return { status: 'timeout', value: null, error: { code: 'probe-timeout', sourceId: key.sourceId, key, retryable: true, attempt, maxAttempts: 2, message: 'timeout' }, attempts: attempt };
        if (key.agentId === keys.exhausted.agentId) return { status: 'failed', value: null, error: { code: 'probe-failed', sourceId: key.sourceId, key, retryable: true, attempt, maxAttempts: 2, message: 'exhausted' }, attempts: attempt };
        return { status: 'complete', value: snapshot(key), attempts: attempt };
      },
    };
    const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]), maxAttempts: 2 });

    await expect(registry.probe(keys.partial)).resolves.toMatchObject({ key: keys.partial, level: 'supported' });
    await expect(registry.probe(keys.failed)).resolves.toMatchObject({ key: keys.failed, level: 'supported' });
    await expect(registry.probe(keys.timeout)).resolves.toMatchObject({ key: keys.timeout, level: 'supported' });
    await expect(registry.probe(keys.exhausted)).resolves.toMatchObject({ key: keys.exhausted, level: 'unknown', unknownReasons: expect.objectContaining({ probe: 'retry-exhausted' }) });
    expect(calls).toEqual(new Map([['partial', 2], ['failed', 2], ['timeout', 2], ['exhausted', 2]]));
  });

  test('turns invalid discovery records into safe projections without partial writes', async () => {
    const key: AgentKey = { sourceId: 'invalid-source', agentId: agentId('known') };
    const invalid = { sourceId: key.sourceId, agentId: key.agentId, descriptor: { key: { sourceId: 'wrong-source', agentId: key.agentId }, displayName: 'wrong' } } as unknown as DiscoveryRecord;
    const source: AgentSourcePort = { sourceId: key.sourceId, async discover() { return { status: 'complete', value: [invalid], attempts: 1 }; } };
    const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]) });

    await expect(registry.register!(invalid)).resolves.toMatchObject({ status: 'conflict', error: 'invalid-record' });
    await expect(registry.list()).resolves.toEqual([]);
  });

  test('clears temporary discovery failure reason when a retry completes', async () => {
    const key: AgentKey = { sourceId: 'eventual-source', agentId: agentId('eventual') };
    const record: DiscoveryRecord = { sourceId: key.sourceId, agentId: key.agentId, providerId: 'provider' };
    let attempts = 0;
    const source: AgentSourcePort = {
      sourceId: key.sourceId,
      async discover() {
        attempts += 1;
        if (attempts === 1) return { status: 'partial', value: [record], error: { code: 'discovery-failed', sourceId: key.sourceId, key, retryable: true, attempt: 1, maxAttempts: 2, message: 'temporary' }, attempts };
        return { status: 'complete', value: [record], attempts };
      },
    };
    const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]) });

    const descriptors = await registry.list();
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]!.unknownReasons?.discovery).toBeNull();
    expect(attempts).toBe(2);
  });

  test('keeps legacy AgentId probe composition path source-bound to Orca', async () => {
    const adapter = new ProbeAdapter();
    const registry = new InMemoryAgentRegistry({ provider: new OrcaAgentProvider(), adapters: new InMemoryAgentAdapterRegistry([adapter]) });

    await expect(registry.probe(adapter.agentId, revision)).resolves.toEqual(adapter.snapshot);
  });

test('rejects discovery records that claim a different source', async () => {
  const owned: DiscoveryRecord = { sourceId: 'owned-source', agentId: agentId('owned') };
  const foreign = { sourceId: 'foreign-source', agentId: agentId('foreign') } as DiscoveryRecord;
  const source: AgentSourcePort = { sourceId: 'owned-source', async discover() { return { status: 'complete', value: [foreign], attempts: 1 }; } };
  const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]) });

  await expect(registry.list()).resolves.toEqual([]);
  await expect(registry.register!(owned)).resolves.toMatchObject({ status: 'inserted' });
});

test('validates partial probe snapshot identity just like complete results', async () => {
  const requested: AgentKey = { sourceId: 'partial-identity', agentId: agentId('requested') };
  const foreign: AgentKey = { sourceId: 'partial-identity', agentId: agentId('foreign') };
  const snapshot: AgentCapabilitySnapshot = {
    key: foreign, sourceId: foreign.sourceId, agentId: foreign.agentId, probeId: 'foreign-probe', level: 'supported',
    version: { kind: 'known', value: '1' }, capabilities: {}, evidence: [], observedAt: '2026-08-31T00:00:00.000Z', unknownReasons: emptyUnknownReasons(),
  };
  const source: AgentSourcePort = {
    sourceId: requested.sourceId,
    async discover() { return { status: 'complete', value: [{ sourceId: requested.sourceId, agentId: requested.agentId }], attempts: 1 }; },
    async probe(key) { return { status: 'partial', value: snapshot, error: { code: 'probe-failed', sourceId: key.sourceId, key, retryable: false, attempt: 1, maxAttempts: 1, message: 'foreign partial' }, attempts: 1 }; },
  };
  const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]) });

  await expect(registry.probe(requested)).resolves.toMatchObject({ key: requested, level: 'unknown', unknownReasons: expect.objectContaining({ probe: 'identity-conflict' }) });
});

test('bounds discovery retries with the registry attempt limit when source counters do not advance', async () => {
  const key: AgentKey = { sourceId: 'stuck-source', agentId: agentId('stuck') };
  let calls = 0;
  const source: AgentSourcePort = {
    sourceId: key.sourceId,
    async discover() {
      calls += 1;
      return { status: 'partial', value: [{ sourceId: key.sourceId, agentId: key.agentId }], error: { code: 'discovery-failed', sourceId: key.sourceId, key, retryable: true, attempt: 0, maxAttempts: 99, message: 'counter stuck' }, attempts: 0 };
    },
  };
  const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]), maxAttempts: 2 });

  await expect(registry.list()).resolves.toEqual([]);
  expect(calls).toBe(2);
});

test('materializes an unknown descriptor when a failed discovery names an unseen key', async () => {
  const key: AgentKey = { sourceId: 'named-failure', agentId: agentId('unseen') };
  const source: AgentSourcePort = {
    sourceId: key.sourceId,
    async discover() {
      return { status: 'failed', value: null, error: { code: 'discovery-failed', sourceId: key.sourceId, key, retryable: false, attempt: 1, maxAttempts: 1, message: 'backend failed' }, attempts: 1 };
    },
  };
  const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]) });

  await expect(registry.list()).resolves.toMatchObject([{ key, displayName: 'unseen', unknownReasons: expect.objectContaining({ discovery: 'discovery-failed' }) }]);
});

test('projects thrown discovery without leaking an ordinary error', async () => {
  const source: AgentSourcePort = {
    sourceId: 'throwing-discovery',
    async discover() {
      const error = new Error('discovery timeout');
      error.name = 'TimeoutError';
      throw error;
    },
  };
  const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]) });

  await expect(registry.list()).resolves.toEqual([]);
});

test('rejects malformed complete and partial discovery result shapes', async () => {
  const complete: AgentSourcePort = { sourceId: 'malformed-complete', async discover() { return { status: 'complete', value: { nope: true }, attempts: 1 } as unknown as SourceResult<readonly DiscoveryRecord[]>; } };
  const partial: AgentSourcePort = { sourceId: 'malformed-partial', async discover() { return { status: 'partial', value: [], error: { code: 'discovery-failed', sourceId: 'foreign', retryable: false, attempt: 1, maxAttempts: 1, message: 'foreign error' }, attempts: 1 } as unknown as SourceResult<readonly DiscoveryRecord[]>; } };
  const registry = new InMemoryAgentRegistry({ sources: [complete, partial], adapters: new InMemoryAgentAdapterRegistry([]) });

  await expect(registry.list()).resolves.toEqual([]);
});

test('rejects malformed probe result status, value, and error without leaking TypeError', async () => {
  const key: AgentKey = { sourceId: 'malformed-probe', agentId: agentId('bad') };
  const source: AgentSourcePort = {
    sourceId: key.sourceId,
    async discover() { return { status: 'complete', value: [{ sourceId: key.sourceId, agentId: key.agentId }], attempts: 1 }; },
    async probe() { return { status: 'not-a-status', value: {}, attempts: 1 } as unknown as SourceResult<AgentCapabilitySnapshot>; },
  };
  const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]) });

  await expect(registry.probe(key)).resolves.toMatchObject({ key, level: 'unknown', unknownReasons: expect.objectContaining({ probe: 'probe-failed' }) });
});

test('uses local discovery attempts for retry exhaustion despite non-incrementing source counters', async () => {
  const key: AgentKey = { sourceId: 'nonincrementing', agentId: agentId('named') };
  let calls = 0;
  const source: AgentSourcePort = {
    sourceId: key.sourceId,
    async discover() {
      calls += 1;
      return { status: 'partial', value: [{ sourceId: key.sourceId, agentId: key.agentId }], error: { code: 'discovery-failed', sourceId: key.sourceId, key, retryable: true, attempt: 1, maxAttempts: 99, message: 'retry' }, attempts: 1 };
    },
  };
  const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]), maxAttempts: 2 });

  await expect(registry.list()).resolves.toMatchObject([{ key, unknownReasons: expect.objectContaining({ discovery: 'retry-exhausted' }) }]);
  expect(calls).toBe(2);
});

test('does not write a malformed nested descriptor', async () => {
  const key: AgentKey = { sourceId: 'nested-invalid', agentId: agentId('bad-descriptor') };
  const record = { sourceId: key.sourceId, agentId: key.agentId, descriptor: { key, displayName: '', evidence: 'not-an-array' } } as unknown as DiscoveryRecord;
  const source: AgentSourcePort = { sourceId: key.sourceId, async discover() { return { status: 'complete', value: [record], attempts: 1 }; } };
  const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]) });

  await expect(registry.register!(record)).resolves.toMatchObject({ status: 'conflict', error: 'invalid-record' });
  await expect(registry.list()).resolves.toEqual([]);
});

test('retains a valid terminal non-retryable partial probe snapshot as unknown', async () => {
  const key: AgentKey = { sourceId: 'terminal-partial', agentId: agentId('partial') };
  const value: AgentCapabilitySnapshot = {
    key, sourceId: key.sourceId, agentId: key.agentId, probeId: 'terminal-partial-probe', level: 'supported',
    version: { kind: 'known', value: '1.2.3' }, capabilities: { scheduling: 'degraded' }, evidence: ['evidence://probe/terminal-partial'],
    observedAt: '2026-08-31T00:00:00.000Z', unknownReasons: emptyUnknownReasons(),
  };
  const source: AgentSourcePort = {
    sourceId: key.sourceId,
    async discover() { return { status: 'complete', value: [{ sourceId: key.sourceId, agentId: key.agentId }], attempts: 1 }; },
    async probe() { return { status: 'partial', value, error: { code: 'probe-failed', sourceId: key.sourceId, key, retryable: false, attempt: 1, maxAttempts: 1, message: 'partial terminal result' }, attempts: 1 }; },
  };
  const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]) });

  await expect(registry.probe(key)).resolves.toMatchObject({
    key, level: 'unknown', version: value.version, capabilities: value.capabilities, evidence: value.evidence,
    unknownReasons: expect.objectContaining({ probe: 'probe-failed' }),
  });
});

test('retains the final retryable partial snapshot after registry retry exhaustion', async () => {
  const key: AgentKey = { sourceId: 'terminal-retry-partial', agentId: agentId('partial') };
  const value: AgentCapabilitySnapshot = {
    key, sourceId: key.sourceId, agentId: key.agentId, probeId: 'terminal-retry-partial-probe', level: 'degraded',
    version: { kind: 'known', value: '2.0.0' }, capabilities: { launch: 'degraded' }, evidence: ['evidence://probe/retry-partial'],
    observedAt: '2026-08-31T00:00:00.000Z', unknownReasons: emptyUnknownReasons(),
  };
  let calls = 0;
  const source: AgentSourcePort = {
    sourceId: key.sourceId,
    async discover() { return { status: 'complete', value: [{ sourceId: key.sourceId, agentId: key.agentId }], attempts: 1 }; },
    async probe() {
      calls += 1;
      return { status: 'partial', value, error: { code: 'probe-timeout', sourceId: key.sourceId, key, retryable: true, attempt: 1, maxAttempts: 9, message: 'still partial' }, attempts: 1 };
    },
  };
  const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]), maxAttempts: 2 });

  await expect(registry.probe(key)).resolves.toMatchObject({
    key, level: 'unknown', version: value.version, capabilities: value.capabilities, evidence: value.evidence,
    unknownReasons: expect.objectContaining({ probe: 'retry-exhausted' }),
  });
  expect(calls).toBe(2);
});

test('keeps tuple identities distinct when source and agent ids contain separators', async () => {
  const first: AgentKey = { sourceId: 'a', agentId: agentId('b/c') };
  const second: AgentKey = { sourceId: 'a/b', agentId: agentId('c') };
  const registry = new InMemoryAgentRegistry({
    sources: [
      { sourceId: first.sourceId, async discover(): Promise<SourceResult<readonly DiscoveryRecord[]>> { return { status: 'complete', value: [{ sourceId: first.sourceId, agentId: first.agentId }], attempts: 1 }; } },
      { sourceId: second.sourceId, async discover(): Promise<SourceResult<readonly DiscoveryRecord[]>> { return { status: 'complete', value: [{ sourceId: second.sourceId, agentId: second.agentId }], attempts: 1 }; } },
    ],
    adapters: new InMemoryAgentAdapterRegistry([]),
  });

  await expect(registry.list()).resolves.toMatchObject([{ key: first }, { key: second }]);
});

test('rejects duplicate source registrations instead of silently replacing one', () => {
  const duplicate = { sourceId: 'duplicate', async discover(): Promise<SourceResult<readonly DiscoveryRecord[]>> { return { status: 'complete', value: [], attempts: 1 }; } };

  expect(() => new InMemoryAgentRegistry({ sources: [duplicate, duplicate], adapters: new InMemoryAgentAdapterRegistry([]) })).toThrow(/duplicate source/i);
});

test('rejects malformed SourceResult counters and complete errors as typed failure', async () => {
  const counterKey: AgentKey = { sourceId: 'counter-mismatch', agentId: agentId('counter') };
  const completeKey: AgentKey = { sourceId: 'complete-error', agentId: agentId('complete') };
  const counterSource: AgentSourcePort = {
    sourceId: counterKey.sourceId,
    async discover() { return { status: 'partial', value: [{ sourceId: counterKey.sourceId, agentId: counterKey.agentId }], error: { code: 'discovery-failed', sourceId: counterKey.sourceId, retryable: false, attempt: 1, maxAttempts: 1, message: 'mismatch' }, attempts: 2 } as unknown as SourceResult<readonly DiscoveryRecord[]>; },
  };
  const completeSource: AgentSourcePort = {
    sourceId: completeKey.sourceId,
    async discover() { return { status: 'complete', value: [{ sourceId: completeKey.sourceId, agentId: completeKey.agentId }], attempts: 1, error: { bad: true } } as unknown as SourceResult<readonly DiscoveryRecord[]>; },
  };
  const registry = new InMemoryAgentRegistry({ sources: [counterSource, completeSource], adapters: new InMemoryAgentAdapterRegistry([]) });

  await expect(registry.list()).resolves.toEqual([]);
});

test('rejects malformed top-level discovery record fields without persistence', async () => {
  const key: AgentKey = { sourceId: 'top-level-invalid', agentId: agentId('invalid') };
  const malformed = { sourceId: key.sourceId, agentId: key.agentId, providerId: 42, displayName: 7, evidence: {}, unknownReason: 'not-a-reason' } as unknown as DiscoveryRecord;
  const source: AgentSourcePort = { sourceId: key.sourceId, async discover() { return { status: 'complete', value: [malformed], attempts: 1 }; } };
  const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]) });

  await expect(registry.register!(malformed)).resolves.toMatchObject({ status: 'conflict', error: 'invalid-record' });
  await expect(registry.list()).resolves.toEqual([]);
});
test('rejects empty top-level display names without persisting the record', async () => {
  const key: AgentKey = { sourceId: 'empty-display', agentId: agentId('agent') };
  const record = { sourceId: key.sourceId, agentId: key.agentId, providerId: 'provider', displayName: '' } as DiscoveryRecord;
  const registry = new InMemoryAgentRegistry({ sources: [], adapters: new InMemoryAgentAdapterRegistry([]) });

  await expect(registry.register!(record)).resolves.toMatchObject({ status: 'conflict', error: 'invalid-record' });
  await expect(registry.list()).resolves.toEqual([]);
});

test('rejects discovery and probe timeout status/code mismatches as invalid typed failures', async () => {
  const discoveryCases = [
    { sourceId: 'discovery-timeout-failed', status: 'timeout', code: 'discovery-failed' },
    { sourceId: 'discovery-failed-timeout', status: 'failed', code: 'discovery-timeout' },
  ] as const;
  const discoveryCalls = new Map<string, number>();
  const discoverySources: AgentSourcePort[] = discoveryCases.map(({ sourceId, status, code }) => ({
    sourceId,
    async discover() {
      discoveryCalls.set(sourceId, (discoveryCalls.get(sourceId) ?? 0) + 1);
      return { status, value: null, error: { code, sourceId, retryable: false, attempt: 1, maxAttempts: 1, message: 'mismatch' }, attempts: 1 } as unknown as SourceResult<readonly DiscoveryRecord[]>;
    },
  }));
  const probeCases = [
    { sourceId: 'probe-timeout-failed', status: 'timeout', code: 'probe-failed' },
    { sourceId: 'probe-failed-timeout', status: 'failed', code: 'probe-timeout' },
  ] as const;
  const probeCalls = new Map<string, number>();
  const probeSources: AgentSourcePort[] = probeCases.map(({ sourceId, status, code }) => {
    const key: AgentKey = { sourceId, agentId: agentId('agent') };
    return {
      sourceId,
      async discover(): Promise<SourceResult<readonly DiscoveryRecord[]>> { return { status: 'complete', value: [{ sourceId, agentId: key.agentId }], attempts: 1 }; },
      async probe() {
        probeCalls.set(sourceId, (probeCalls.get(sourceId) ?? 0) + 1);
        return { status, value: null, error: { code, sourceId, key, retryable: false, attempt: 1, maxAttempts: 1, message: 'mismatch' }, attempts: 1 } as unknown as SourceResult<AgentCapabilitySnapshot>;
      },
    };
  });
  const registry = new InMemoryAgentRegistry({ sources: [...discoverySources, ...probeSources], adapters: new InMemoryAgentAdapterRegistry([]), maxAttempts: 2 });

  const listed = await registry.list();
  expect(listed).toHaveLength(2);
  for (const { sourceId } of probeCases) expect(listed).toContainEqual(expect.objectContaining({ key: { sourceId, agentId: agentId('agent') } }));
  for (const { sourceId } of probeCases) await expect(registry.probe({ sourceId, agentId: agentId('agent') })).resolves.toMatchObject({ level: 'unknown', unknownReasons: expect.objectContaining({ probe: 'probe-failed' }) });
  expect([...discoveryCalls.values()]).toEqual([2, 2]);
  expect([...probeCalls.values()]).toEqual([2, 2]);

});
test('does not mark retained valid rows when a partial discovery has an invalid sibling', async () => {
  const key: AgentKey = { sourceId: 'partial-sibling', agentId: agentId('valid') };
  const valid: DiscoveryRecord = { sourceId: key.sourceId, agentId: key.agentId, providerId: 'provider' };
  const malformed = { sourceId: key.sourceId, agentId: agentId('bad'), descriptor: { key, displayName: '' } } as unknown as DiscoveryRecord;
  let calls = 0;
  const source: AgentSourcePort = {
    sourceId: key.sourceId,
    async discover(): Promise<SourceResult<readonly DiscoveryRecord[]>> {
      calls += 1;
      if (calls === 1) return { status: 'complete', value: [valid], attempts: 1 };
      return { status: 'partial', value: [valid, malformed], error: { code: 'invalid-record', sourceId: key.sourceId, retryable: false, attempt: 1, maxAttempts: 1, message: 'one sibling malformed' }, attempts: 1 };
    },
  };
  const registry = new InMemoryAgentRegistry({ sources: [source], adapters: new InMemoryAgentAdapterRegistry([]) });

  const first = await registry.list();
  expect(first).toHaveLength(1);
  expect(first[0]?.key).toEqual(key);
  expect(first[0]?.unknownReasons?.discovery).toBeNull();
  const second = await registry.list();
  expect(second).toHaveLength(1);
  expect(second[0]?.key).toEqual(key);
  expect(second[0]?.providerId).toBe('provider');
  expect(second[0]?.unknownReasons?.discovery).toBeNull();
});
