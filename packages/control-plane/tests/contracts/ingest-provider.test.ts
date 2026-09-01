import { describe, expect, test } from 'bun:test';
import { IngestOrchestrator } from '../../src/application/ingest';
import { FakeIngestProvider, capabilityFact, readinessFact, testClock } from './ingest-fakes';

const INPUT = { locator: 'fake:matrix/source' } as const;
const SOURCE_ID = 'src:fake:matrix/source';

function orchestrator(provider: FakeIngestProvider | null) {
  return new IngestOrchestrator({ providers: provider === null ? [] : [provider], now: testClock() });
}

async function register(target: IngestOrchestrator) {
  const result = await target.registerSource(INPUT);
  if (result.status !== 'registered') throw new Error('expected registered');
  return result.registration;
}

describe('Ingest fake provider contract matrix', () => {
  test('fully available: register, plan and import all succeed with real artifact refs', async () => {
    const provider = new FakeIngestProvider({
      importResult: {
        status: 'imported', planId: 'placeholder', completedAt: '2026-09-01T00:10:00.000Z', evidenceRef: 'tests/contracts/ingest-provider.test.ts',
        artifacts: [{ artifactId: 'artifact-full', sourceId: SOURCE_ID, capabilityId: 'source.fetch', contentFingerprint: 'sha256:1234', evidenceRef: 'tests/contracts/ingest-provider.test.ts' }],
      },
    });
    const target = orchestrator(provider);
    await register(target);
    const prepared = await target.prepareImport({ sourceId: SOURCE_ID, capabilityId: 'source.fetch' });
    if (prepared.status !== 'planned') throw new Error('expected planned');
    const run = await target.runImport(prepared.plan);
    expect(run).toMatchObject({ status: 'imported', planId: prepared.plan.planId });
    await expect(target.view(SOURCE_ID)).resolves.toMatchObject({ overallReadiness: 'ready', lastImport: { status: 'imported' } });
  });

  test('partially capable: per-capability statuses survive; degraded plans, unsupported blocks', async () => {
    const provider = new FakeIngestProvider({
      capabilities: [capabilityFact('source.fetch', { status: 'degraded' }), capabilityFact('content.transcribe', { status: 'unsupported' })],
      readiness: [readinessFact('source.fetch', { status: 'degraded', reason: 'rate-limited' })],
    });
    const target = orchestrator(provider);
    await register(target);
    const view = await target.view(SOURCE_ID);
    expect(view?.capabilityStatuses).toEqual({ 'source.fetch': 'degraded', 'content.transcribe': 'unsupported' });
    await expect(target.prepareImport({ sourceId: SOURCE_ID, capabilityId: 'source.fetch' })).resolves.toMatchObject({ status: 'planned' });
    await expect(target.prepareImport({ sourceId: SOURCE_ID, capabilityId: 'content.transcribe' })).resolves.toMatchObject({ status: 'blocked', reason: 'capability-unsupported' });
  });

  test('service unavailable: registration keeps the platform fact but records service unknown', async () => {
    const provider = new FakeIngestProvider({ service: { kind: 'unknown', reason: 'provider-unavailable', observedAt: '2026-09-01T00:00:00.000Z', evidenceRef: 'tests/contracts/ingest-provider.test.ts' } });
    const target = orchestrator(provider);
    const registration = await register(target);
    expect(registration.platform.kind).toBe('known');
    expect(registration.service).toMatchObject({ kind: 'unknown', reason: 'provider-unavailable' });
    await expect(target.prepareImport({ sourceId: SOURCE_ID, capabilityId: 'source.fetch' })).resolves.toMatchObject({ status: 'unknown', reason: 'provider-unavailable' });
  });

  test('missing credentials: readiness blocks the import path with the credential reason', async () => {
    const provider = new FakeIngestProvider({ readiness: [readinessFact('source.fetch', { status: 'blocked', reason: 'credential-missing' }), readinessFact('content.parse')] });
    const target = orchestrator(provider);
    await register(target);
    const prepared = await target.prepareImport({ sourceId: SOURCE_ID, capabilityId: 'source.fetch' });
    expect(prepared).toMatchObject({ status: 'blocked', reason: 'credential-missing' });
    if (prepared.status !== 'blocked') throw new Error('expected blocked');
    expect(prepared.readiness).toMatchObject([{ capabilityId: 'source.fetch', status: 'blocked' }]);
  });

  test('missing dependency: unavailable readiness blocks and the view reports the worst status', async () => {
    const provider = new FakeIngestProvider({ readiness: [readinessFact('source.fetch', { status: 'unavailable', reason: 'dependency-missing' }), readinessFact('content.parse')] });
    const target = orchestrator(provider);
    await register(target);
    await expect(target.prepareImport({ sourceId: SOURCE_ID, capabilityId: 'source.fetch' })).resolves.toMatchObject({ status: 'blocked', reason: 'dependency-missing' });
    await expect(target.view(SOURCE_ID)).resolves.toMatchObject({ overallReadiness: 'unavailable' });
  });

  test('timeout: a crashing readiness probe degrades to unknown facts, not errors', async () => {
    const provider = new FakeIngestProvider();
    const target = orchestrator(provider);
    await register(target);
    provider.state.readiness = 'throw';
    await expect(target.prepareImport({ sourceId: SOURCE_ID, capabilityId: 'source.fetch' })).resolves.toMatchObject({ status: 'unknown', reason: 'readiness-missing' });
  });

  test('unknown source: no provider claims it, so every downstream step stays unknown', async () => {
    const target = orchestrator(null);
    const registration = await register(target);
    expect(registration.platform).toMatchObject({ kind: 'unknown', reason: 'unrecognized-source' });
    await expect(target.prepareImport({ sourceId: SOURCE_ID, capabilityId: 'source.fetch' })).resolves.toMatchObject({ status: 'unknown', reason: 'provider-unavailable' });
    await expect(target.view(SOURCE_ID)).resolves.toMatchObject({ platformId: 'unknown', serviceId: 'unknown', overallReadiness: 'unknown' });
  });

  test('expired readiness: a stale ready snapshot is not reusable for planning', async () => {
    const provider = new FakeIngestProvider({ readiness: [readinessFact('source.fetch', { expiresAt: '2026-09-01T00:00:00.500Z' }), readinessFact('content.parse')] });
    const target = orchestrator(provider);
    await register(target);
    // provider 仍返回同一条已过期的 ready 快照；prepareImport 不得据此生成计划。
    await expect(target.prepareImport({ sourceId: SOURCE_ID, capabilityId: 'source.fetch' })).resolves.toMatchObject({ status: 'unknown', reason: 'readiness-expired' });
  });

  test('state change before run: a valid plan is re-checked and blocked at execution time', async () => {
    const provider = new FakeIngestProvider({
      importResult: { status: 'imported', planId: 'placeholder', artifacts: [], completedAt: '2026-09-01T00:10:00.000Z', evidenceRef: 'tests/contracts/ingest-provider.test.ts' },
    });
    const target = orchestrator(provider);
    await register(target);
    const prepared = await target.prepareImport({ sourceId: SOURCE_ID, capabilityId: 'source.fetch' });
    if (prepared.status !== 'planned') throw new Error('expected planned');
    provider.state.readiness = [readinessFact('source.fetch', { status: 'blocked', reason: 'credential-revoked' }), readinessFact('content.parse')];
    const run = await target.runImport(prepared.plan);
    expect(run).toMatchObject({ status: 'blocked', reason: 'readiness-changed' });
    expect(provider.calls.executeImport).toBe(0);
  });

  test('no concrete import implementation: run returns unknown and fabricates nothing', async () => {
    const provider = new FakeIngestProvider();
    const target = orchestrator(provider);
    await register(target);
    const prepared = await target.prepareImport({ sourceId: SOURCE_ID, capabilityId: 'source.fetch' });
    if (prepared.status !== 'planned') throw new Error('expected planned');
    const run = await target.runImport(prepared.plan);
    expect(run).toMatchObject({ status: 'unknown', reason: 'import-not-implemented' });
    expect('artifacts' in run).toBe(false);
    await expect(target.view(SOURCE_ID)).resolves.toMatchObject({ lastImport: { status: 'unknown' } });
  });

  test('imported results carry only references: no raw content fields leak through', async () => {
    const provider = new FakeIngestProvider({
      importResult: {
        status: 'imported', planId: 'placeholder', completedAt: '2026-09-01T00:10:00.000Z', evidenceRef: 'tests/contracts/ingest-provider.test.ts',
        artifacts: [{ artifactId: 'artifact-ref-only', sourceId: SOURCE_ID, capabilityId: 'source.fetch', contentFingerprint: null, evidenceRef: 'tests/contracts/ingest-provider.test.ts' }],
      },
    });
    const target = orchestrator(provider);
    await register(target);
    const prepared = await target.prepareImport({ sourceId: SOURCE_ID, capabilityId: 'source.fetch' });
    if (prepared.status !== 'planned') throw new Error('expected planned');
    const run = await target.runImport(prepared.plan);
    if (run.status !== 'imported') throw new Error('expected imported');
    expect(Object.keys(run.artifacts[0]!).sort()).toEqual(['artifactId', 'capabilityId', 'contentFingerprint', 'evidenceRef', 'sourceId']);
  });

  test('crashing import execution surfaces as provider-failed unknown, not a thrown error', async () => {
    const provider = new FakeIngestProvider({ importResult: 'throw' });
    const target = orchestrator(provider);
    await register(target);
    const prepared = await target.prepareImport({ sourceId: SOURCE_ID, capabilityId: 'source.fetch' });
    if (prepared.status !== 'planned') throw new Error('expected planned');
    await expect(target.runImport(prepared.plan)).resolves.toMatchObject({ status: 'unknown', reason: 'provider-failed' });
  });
});
