import { describe, expect, test } from 'bun:test';
import {
  deriveSourceIngestView,
  isReadinessFresh,
  requireEvidenceRef,
  validateCapabilityFact,
  validateImportPlan,
  validateImportedArtifactRef,
  validatePlatformFact,
  validateReadinessFact,
  validateServiceFact,
  validateSourceRegistration,
  worstReadiness,
  type ImportPlan,
  type SourceRegistration,
} from '../../src/domain/ingest';
import { T0, capabilityFact, platformFact, readinessFact, serviceFact } from '../contracts/ingest-fakes';

function registration(overrides: Partial<SourceRegistration> = {}): SourceRegistration {
  return {
    sourceId: 'src:fake:repo',
    locator: 'fake:repo',
    status: 'registered',
    registeredAt: T0,
    platform: { kind: 'known', fact: platformFact() },
    service: { kind: 'known', fact: serviceFact() },
    capabilities: [capabilityFact('source.fetch')],
    readiness: [readinessFact('source.fetch')],
    evidenceRef: 'tests/domain/ingest.test.ts',
    ...overrides,
  };
}

function importPlan(overrides: Partial<ImportPlan> = {}): ImportPlan {
  return {
    planId: 'plan-1',
    sourceId: 'src:fake:repo',
    capabilityId: 'source.fetch',
    platform: platformFact(),
    service: serviceFact(),
    capability: capabilityFact('source.fetch'),
    readiness: readinessFact('source.fetch'),
    createdAt: T0,
    evidenceRef: 'tests/domain/ingest.test.ts',
    ...overrides,
  };
}

describe('Ingest domain facts', () => {
  test('rejects a PlatformFact without platformId or parseable observedAt', () => {
    expect(() => validatePlatformFact(platformFact({ platformId: '  ' }))).toThrow('platformId must not be empty');
    expect(() => validatePlatformFact(platformFact({ observedAt: 'not-a-time' }))).toThrow('parseable timestamp');
  });

  test('rejects a ServiceFact without serviceId or protocol', () => {
    expect(() => validateServiceFact(serviceFact({ serviceId: '' }))).toThrow('serviceId must not be empty');
    expect(() => validateServiceFact(serviceFact({ protocol: ' ' }))).toThrow('protocol must not be empty');
  });

  test('rejects a CapabilityFact with an id or status outside the controlled sets', () => {
    expect(() => validateCapabilityFact({ ...capabilityFact('source.fetch'), capabilityId: 'source.hack' as never })).toThrow('invalid ingest capability id');
    expect(() => validateCapabilityFact({ ...capabilityFact('source.fetch'), status: 'always-works' as never })).toThrow('invalid capability status');
  });

  test('rejects a ReadinessFact with an invalid status, empty reason, or bad timestamps', () => {
    expect(() => validateReadinessFact(readinessFact('source.fetch', { status: 'probably-fine' as never }))).toThrow('invalid readiness status');
    expect(() => validateReadinessFact(readinessFact('source.fetch', { reason: ' ' }))).toThrow('reason must not be empty');
    expect(() => validateReadinessFact(readinessFact('source.fetch', { expiresAt: 'soon' }))).toThrow('parseable timestamp');
  });

  test('evidenceRef refuses line breaks, oversized values and secret-like content', () => {
    expect(() => requireEvidenceRef('a\nb', 'ref')).toThrow('line breaks');
    expect(() => requireEvidenceRef('x'.repeat(300), 'ref')).toThrow('256 characters');
    expect(() => requireEvidenceRef('header authorization: Bearer abc', 'ref')).toThrow('secret-like');
    expect(() => requireEvidenceRef('api_key=abc123', 'ref')).toThrow('secret-like');
  });

  test('worstReadiness picks the most severe status and never assumes ready for empty input', () => {
    expect(worstReadiness([])).toBe('unknown');
    expect(worstReadiness(['ready', 'ready'])).toBe('ready');
    expect(worstReadiness(['ready', 'degraded'])).toBe('degraded');
    expect(worstReadiness(['degraded', 'unknown'])).toBe('unknown');
    expect(worstReadiness(['unknown', 'blocked'])).toBe('blocked');
    expect(worstReadiness(['blocked', 'unavailable'])).toBe('unavailable');
  });

  test('isReadinessFresh honours expiresAt and treats missing expiry as non-expiring', () => {
    const noExpiry = readinessFact('source.fetch');
    const expired = readinessFact('source.fetch', { expiresAt: '2026-09-01T00:00:01.000Z' });
    expect(isReadinessFresh(noExpiry, '2030-01-01T00:00:00.000Z')).toBe(true);
    expect(isReadinessFresh(expired, '2026-09-01T00:00:00.500Z')).toBe(true);
    expect(isReadinessFresh(expired, '2026-09-01T00:00:02.000Z')).toBe(false);
  });

  test('registration keeps registered distinct from ready: unknown readiness stays unknown', () => {
    const view = deriveSourceIngestView(registration({ readiness: [readinessFact('source.fetch', { status: 'unknown', reason: 'never-checked' })] }), null, T0);
    expect(view.registrationStatus).toBe('registered');
    expect(view.overallReadiness).toBe('unknown');
    expect(view.lastImport).toBeNull();
  });

  test('ready does not imply imported: all-ready view still has no import record', () => {
    const view = deriveSourceIngestView(registration(), null, T0);
    expect(view.overallReadiness).toBe('ready');
    expect(view.lastImport).toBeNull();
  });

  test('derives unknown platform/service ids instead of guessing', () => {
    const view = deriveSourceIngestView(registration({
      platform: { kind: 'unknown', reason: 'unrecognized-source', observedAt: T0, evidenceRef: 'tests/domain/ingest.test.ts' },
      service: { kind: 'unknown', reason: 'unrecognized-source', observedAt: T0, evidenceRef: 'tests/domain/ingest.test.ts' },
      capabilities: [],
      readiness: [],
    }), null, T0);
    expect(view.platformId).toBe('unknown');
    expect(view.serviceId).toBe('unknown');
    expect(view.overallReadiness).toBe('unknown');
  });

  test('view is a pure projection exposing only summary fields, no raw content', () => {
    const view = deriveSourceIngestView(registration(), { status: 'imported', planId: 'plan-1', artifacts: [], completedAt: T0, evidenceRef: 'tests/domain/ingest.test.ts' }, T0);
    expect(Object.keys(view).sort()).toEqual([
      'capabilityStatuses', 'derivedAt', 'lastImport', 'overallReadiness', 'platformId',
      'readinessStatuses', 'registrationStatus', 'serviceId', 'sourceId',
    ]);
    expect(view.lastImport).toEqual({ status: 'imported', at: T0 });
  });

  test('rejects an ImportPlan whose facts disagree with each other', () => {
    expect(() => validateImportPlan(importPlan({ readiness: readinessFact('content.parse') }))).toThrow('readiness fact mismatch');
    expect(() => validateImportPlan(importPlan({ capability: capabilityFact('content.parse') }))).toThrow('capability fact mismatch');
    expect(() => validateImportPlan(importPlan({ service: serviceFact({ serviceId: 'other-service' }) }))).toThrow('capability/service mismatch');
    expect(() => validateImportPlan(importPlan({ platform: platformFact({ platformId: 'other-platform' }) }))).toThrow('service/platform mismatch');
  });

  test('rejects a registration whose capability facts point at a different service or repeat ids', () => {
    expect(() => validateSourceRegistration(registration({ capabilities: [capabilityFact('source.fetch', { serviceId: 'other-service' })] }))).toThrow('must match resolved service');
    expect(() => validateSourceRegistration(registration({ capabilities: [capabilityFact('source.fetch'), capabilityFact('source.fetch')] }))).toThrow('duplicate capability fact');
  });

  test('rejects artifact refs that could smuggle raw secrets through fingerprints', () => {
    expect(() => validateImportedArtifactRef({ artifactId: 'a-1', sourceId: 'src:fake:repo', capabilityId: 'source.fetch', contentFingerprint: 'token=abc', evidenceRef: 'tests/domain/ingest.test.ts' })).toThrow('secret-like');
    expect(() => validateImportedArtifactRef({ artifactId: '', sourceId: 'src:fake:repo', capabilityId: 'source.fetch', contentFingerprint: null, evidenceRef: 'tests/domain/ingest.test.ts' })).toThrow('artifactId must not be empty');
  });

  test('rejects a registration claiming any status other than registered', () => {
    expect(() => validateSourceRegistration(registration({ status: 'imported' as never }))).toThrow('invalid source registration status');
    expect(() => validateSourceRegistration(registration({ status: 'ready' as never }))).toThrow('invalid source registration status');
  });
});
