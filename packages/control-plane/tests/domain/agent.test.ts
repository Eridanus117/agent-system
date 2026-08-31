import { describe, expect, test } from 'bun:test';
import { agentId, type AgentCapabilitySnapshot, validateAgentCapabilitySnapshot } from '../../src/domain/agent';

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
});
