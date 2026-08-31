import { describe, expect, test } from 'bun:test';
import { agentId, type AgentCapabilitySnapshot, type AgentSourceError, type DiscoveryRecord, type SourceResult, type UnknownReasons, validateAgentCapabilitySnapshot } from '../../src/domain/agent';

describe('Agent domain', () => {
  test('rejects an empty AgentId', () => {
    expect(() => agentId('   ')).toThrow('agent id must not be empty');
  });

  test('trims an AgentId before branding', () => {
    const value = agentId('  omp  ');
    expect(value).toBe(agentId('omp'));
  });

  test('preserves Known and Unknown version evidence', () => {
    const known: AgentCapabilitySnapshot = {
      probeId: 'probe-known',
      agentId: agentId('omp'),
      level: 'supported',
      version: { kind: 'known', value: '1.2.3' },
      capabilities: {},
      observedAt: '2026-08-31T00:00:00.000Z',
      evidenceRef: 'test:known',
    };
    const unknown: AgentCapabilitySnapshot = {
      ...known,
      probeId: 'probe-unknown',
      level: 'unknown',
      version: { kind: 'unknown', reason: 'binary-not-found', observedAt: '2026-08-31T00:00:01.000Z' },
      evidenceRef: 'test:unknown',
    };
    validateAgentCapabilitySnapshot(known);
    validateAgentCapabilitySnapshot(unknown);
    expect(known.version).toEqual({ kind: 'known', value: '1.2.3' });
    expect(unknown.version).toEqual({ kind: 'unknown', reason: 'binary-not-found', observedAt: '2026-08-31T00:00:01.000Z' });
  });

  test('preserves per-capability support levels without boolean collapse', () => {
    const snapshot: AgentCapabilitySnapshot = {
      probeId: 'probe-levels',
      agentId: agentId('claude-code'),
      level: 'degraded',
      version: { kind: 'known', value: '2.1.0' },
      capabilities: { instructions: 'supported', skills: 'degraded', mcp: 'unsupported', hooks: 'unknown' },
      observedAt: '2026-08-31T00:00:00.000Z',
      evidenceRef: 'test:levels',
    };
    validateAgentCapabilitySnapshot(snapshot);
    expect(snapshot.capabilities).toEqual({ instructions: 'supported', skills: 'degraded', mcp: 'unsupported', hooks: 'unknown' });
  });

  test('rejects a capability snapshot with an empty evidence reference', () => {
    const snapshot: AgentCapabilitySnapshot = {
      probeId: 'probe-empty-evidence',
      agentId: agentId('omp'),
      level: 'supported',
      version: { kind: 'known', value: '1.2.3' },
      capabilities: {},
      observedAt: '2026-08-31T00:00:00.000Z',
      evidenceRef: '   ',
    };
    expect(() => validateAgentCapabilitySnapshot(snapshot)).toThrow('evidence reference');
  });

  test('models source-scoped identity, stage reasons, and typed source results', () => {
    const key = { sourceId: 'orca', agentId: agentId('omp') };
    const unknownReasons: UnknownReasons = {
      discovery: 'source-only-discovery',
      probe: 'probe-unavailable',
      assembly: null,
      launch: null,
      scheduling: null,
      dispatch: null,
      observation: null,
      recovery: null,
      closure: null,
    };
    const snapshot: AgentCapabilitySnapshot = {
      key,
      sourceId: key.sourceId,
      agentId: key.agentId,
      probeId: 'probe-source-scoped',
      level: 'unknown',
      version: { kind: 'unknown', reason: 'probe-unavailable', observedAt: '2026-08-31T00:00:00.000Z' },
      capabilities: {},
      evidence: [],
      observedAt: '2026-08-31T00:00:00.000Z',
      unknownReasons,
    };
    validateAgentCapabilitySnapshot(snapshot);
    const record: DiscoveryRecord = { sourceId: key.sourceId, agentId: key.agentId, providerId: null };
    const error: AgentSourceError = {
      code: 'probe-timeout',
      sourceId: key.sourceId,
      key,
      retryable: true,
      attempt: 1,
      maxAttempts: 2,
      message: 'probe timed out',
    };
    const partial: SourceResult<readonly DiscoveryRecord[]> = { status: 'partial', value: [record], error, attempts: 1 };
    expect(partial.value[0]).toEqual(record);
    expect(snapshot.key).toEqual(key);
    expect(snapshot.unknownReasons?.probe).toBe('probe-unavailable');
  });
});
