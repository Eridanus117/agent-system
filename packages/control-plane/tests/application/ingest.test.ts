import { describe, expect, test } from 'bun:test';
import { IngestOrchestrator, InMemorySourceRegistrationStore } from '../../src/application/ingest';
import type { ImportPlan } from '../../src/domain/ingest';
import { FakeIngestProvider, capabilityFact, readinessFact, testClock } from '../contracts/ingest-fakes';

const INPUT = { locator: 'fake:repo/alpha' } as const;

function orchestrator(provider: FakeIngestProvider | null = new FakeIngestProvider()) {
  return new IngestOrchestrator({ providers: provider === null ? [] : [provider], now: testClock() });
}

async function planFor(target: IngestOrchestrator, capabilityId: 'source.fetch' | 'content.parse' = 'source.fetch'): Promise<ImportPlan> {
  await target.registerSource(INPUT);
  const prepared = await target.prepareImport({ sourceId: 'src:fake:repo/alpha', capabilityId });
  if (prepared.status !== 'planned') throw new Error(`expected planned, got ${prepared.status}`);
  return prepared.plan;
}

describe('Ingest orchestration', () => {
  test('registerSource resolves all four fact kinds through the provider', async () => {
    const provider = new FakeIngestProvider();
    const result = await orchestrator(provider).registerSource(INPUT);
    if (result.status !== 'registered') throw new Error('expected registered');
    expect(result.registration.status).toBe('registered');
    expect(result.registration.platform).toMatchObject({ kind: 'known', fact: { platformId: 'fake-platform' } });
    expect(result.registration.service).toMatchObject({ kind: 'known', fact: { serviceId: 'fake-service' } });
    expect(result.registration.capabilities.map((fact) => fact.capabilityId)).toEqual(['source.fetch', 'content.parse']);
    expect(result.registration.readiness).toHaveLength(2);
  });

  test('registerSource rejects an empty locator as invalid input', async () => {
    await expect(orchestrator().registerSource({ locator: '   ' })).resolves.toMatchObject({ status: 'invalid', reason: 'invalid-input' });
  });

  test('registerSource still registers an unrecognized source with honest unknown facts', async () => {
    const result = await orchestrator(null).registerSource(INPUT);
    if (result.status !== 'registered') throw new Error('expected registered');
    expect(result.registration.platform).toMatchObject({ kind: 'unknown', reason: 'unrecognized-source' });
    expect(result.registration.service).toMatchObject({ kind: 'unknown', reason: 'unrecognized-source' });
    expect(result.registration.capabilities).toEqual([]);
    expect(result.registration.readiness).toEqual([]);
  });

  test('registerSource downgrades a crashing provider to unknown facts instead of throwing', async () => {
    const provider = new FakeIngestProvider({ platform: 'throw' });
    const result = await orchestrator(provider).registerSource(INPUT);
    if (result.status !== 'registered') throw new Error('expected registered');
    expect(result.registration.platform).toMatchObject({ kind: 'unknown', reason: 'provider-failed' });
    expect(result.registration.capabilities).toEqual([]);
  });

  test('prepareImport re-evaluates readiness instead of trusting the registration snapshot', async () => {
    const provider = new FakeIngestProvider();
    const target = orchestrator(provider);
    await target.registerSource(INPUT);
    const callsAfterRegister = provider.calls.evaluateReadiness;
    // 注册之后条件恶化：credential 被吊销。
    provider.state.readiness = [readinessFact('source.fetch', { status: 'blocked', reason: 'credential-missing' }), readinessFact('content.parse')];
    const prepared = await target.prepareImport({ sourceId: 'src:fake:repo/alpha', capabilityId: 'source.fetch' });
    expect(provider.calls.evaluateReadiness).toBe(callsAfterRegister + 1);
    expect(prepared).toMatchObject({ status: 'blocked', reason: 'credential-missing' });
  });

  test('prepareImport returns unknown for an unregistered source', async () => {
    await expect(orchestrator().prepareImport({ sourceId: 'src:missing', capabilityId: 'source.fetch' })).resolves.toMatchObject({ status: 'unknown', reason: 'source-unregistered' });
  });

  test('prepareImport blocks an unsupported capability without inventing readiness', async () => {
    const provider = new FakeIngestProvider({ capabilities: [capabilityFact('content.transcribe', { status: 'unsupported' })], readiness: [] });
    const target = orchestrator(provider);
    await target.registerSource(INPUT);
    await expect(target.prepareImport({ sourceId: 'src:fake:repo/alpha', capabilityId: 'content.transcribe' })).resolves.toMatchObject({ status: 'blocked', reason: 'capability-unsupported', readiness: [] });
  });

  test('prepareImport returns unknown for a capability the service never declared', async () => {
    const target = orchestrator(new FakeIngestProvider());
    await target.registerSource(INPUT);
    await expect(target.prepareImport({ sourceId: 'src:fake:repo/alpha', capabilityId: 'content.persist' })).resolves.toMatchObject({ status: 'unknown', reason: 'capability-not-declared' });
  });

  test('prepareImport returns a deeply frozen immutable plan when readiness holds', async () => {
    const plan = await planFor(orchestrator());
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.readiness)).toBe(true);
    expect(Object.isFrozen(plan.capability)).toBe(true);
    expect(plan).toMatchObject({ sourceId: 'src:fake:repo/alpha', capabilityId: 'source.fetch' });
    expect(() => { (plan as { planId: string }).planId = 'tampered'; }).toThrow();
  });

  test('runImport without a concrete import implementation returns structured unknown, never fake success', async () => {
    const provider = new FakeIngestProvider();
    const target = orchestrator(provider);
    const plan = await planFor(target);
    const run = await target.runImport(plan);
    expect(run).toMatchObject({ status: 'unknown', reason: 'import-not-implemented', planId: plan.planId });
    expect('artifacts' in run).toBe(false);
  });

  test('runImport re-checks readiness and blocks when state changed after planning', async () => {
    const provider = new FakeIngestProvider();
    const target = orchestrator(provider);
    const plan = await planFor(target);
    provider.state.readiness = [readinessFact('source.fetch', { status: 'unavailable', reason: 'service-down' }), readinessFact('content.parse')];
    const run = await target.runImport(plan);
    expect(run).toMatchObject({ status: 'blocked', reason: 'readiness-changed' });
    if (run.status !== 'blocked') throw new Error('expected blocked');
    expect(run.blockingFacts).toMatchObject([{ capabilityId: 'source.fetch', status: 'unavailable' }]);
  });

  test('runImport rejects an invalid plan as unknown invalid-input', async () => {
    const run = await orchestrator().runImport({} as ImportPlan);
    expect(run).toMatchObject({ status: 'unknown', reason: 'invalid-input' });
  });

  test('runImport delegates to a provider with executeImport and passes artifact refs through', async () => {
    const provider = new FakeIngestProvider({
      importResult: {
        status: 'imported', planId: 'placeholder', completedAt: '2026-09-01T00:10:00.000Z', evidenceRef: 'tests/application/ingest.test.ts',
        artifacts: [{ artifactId: 'artifact-1', sourceId: 'src:fake:repo/alpha', capabilityId: 'source.fetch', contentFingerprint: 'sha256:abcd', evidenceRef: 'tests/application/ingest.test.ts' }],
      },
    });
    const target = orchestrator(provider);
    const plan = await planFor(target);
    const run = await target.runImport(plan);
    expect(run).toMatchObject({ status: 'imported', planId: plan.planId });
    if (run.status !== 'imported') throw new Error('expected imported');
    expect(run.artifacts).toHaveLength(1);
    expect(provider.calls.executeImport).toBe(1);
  });

  test('runImport treats invalid artifact refs from the provider as unprovable, not imported', async () => {
    const provider = new FakeIngestProvider({
      importResult: {
        status: 'imported', planId: 'placeholder', completedAt: '2026-09-01T00:10:00.000Z', evidenceRef: 'tests/application/ingest.test.ts',
        artifacts: [{ artifactId: 'artifact-1', sourceId: 'src:fake:repo/alpha', capabilityId: 'source.fetch', contentFingerprint: 'password=hunter2', evidenceRef: 'tests/application/ingest.test.ts' }],
      },
    });
    const target = orchestrator(provider);
    const plan = await planFor(target);
    await expect(target.runImport(plan)).resolves.toMatchObject({ status: 'unknown', reason: 'provider-failed' });
  });

  test('view derives from facts and keeps registered, ready and imported separate', async () => {
    const provider = new FakeIngestProvider();
    const target = orchestrator(provider);
    await target.registerSource(INPUT);
    const before = await target.view('src:fake:repo/alpha');
    expect(before).toMatchObject({ registrationStatus: 'registered', overallReadiness: 'ready', lastImport: null });
    const plan = await planFor(target);
    const run = await target.runImport(plan);
    expect(run.status).toBe('unknown');
    const after = await target.view('src:fake:repo/alpha');
    expect(after?.lastImport).toMatchObject({ status: 'unknown' });
    await expect(target.view('src:missing')).resolves.toBeNull();
  });

  test('re-registering the same locator refreshes facts without duplicating the source', async () => {
    const provider = new FakeIngestProvider();
    const store = new InMemorySourceRegistrationStore();
    const target = new IngestOrchestrator({ providers: [provider], store, now: testClock() });
    await target.registerSource(INPUT);
    provider.state.readiness = [readinessFact('source.fetch', { status: 'degraded', reason: 'rate-limited' }), readinessFact('content.parse')];
    await target.registerSource(INPUT);
    await expect(store.list()).resolves.toHaveLength(1);
    const view = await target.view('src:fake:repo/alpha');
    expect(view?.readinessStatuses['source.fetch']).toBe('degraded');
  });
});
