import { describe, expect, test } from 'bun:test';
import { OmpHostAdapter } from '../../src/adapters/hosts/omp/omp-host-adapter.ts';
import { ClaudeHostAdapter } from '../../src/adapters/hosts/claude/claude-host-adapter.ts';
import type { ControlPlaneFacade } from '../../src/application/control-plane-port.ts';

const now = '2026-08-28T00:00:00.000Z';

function facade(overrides: Partial<ControlPlaneFacade> = {}): ControlPlaneFacade {
  return {
    readConfigRevision: async () => ({ revisionId: 'rev-1', schemaVersion: 1, agentId: 'omp', source: 'fixture', sourceVersion: '1', observedAt: now }),
    readAssemblyManifest: async () => ({ revisionId: 'rev-1', agentId: 'omp', manifestDigest: 'manifest', itemCount: 1, source: 'fixture', sourceVersion: '1', observedAt: now }),
    probeAgent: async () => ({ agentId: 'omp', agentVersion: '1.0', status: 'supported', source: 'fixture', sourceVersion: '1', observedAt: now }),
    prepareLaunch: async () => ({ revisionId: 'rev-1', agentId: 'omp', planDigest: 'plan', launchBoundary: 'invocation-scoped', source: 'fixture', sourceVersion: '1', observedAt: now }),
    ...overrides,
  };
}

describe('OMP and Claude control-plane host adapters', () => {
  test('requires all public facade facts before reporting supported', async () => {
    const adapter = new OmpHostAdapter(facade(), 'rev-1');
    await expect(adapter.probe({ hostId: 'omp', hostVersion: '1.0' })).resolves.toMatchObject({ status: 'supported' });
    const claude = new ClaudeHostAdapter(facade({ probeAgent: async () => ({ agentId: 'claude', agentVersion: '2.0', status: 'supported', source: 'fixture', sourceVersion: '1', observedAt: now }), readConfigRevision: async () => ({ revisionId: 'rev-1', schemaVersion: 1, agentId: 'claude', source: 'fixture', sourceVersion: '1', observedAt: now }), readAssemblyManifest: async () => ({ revisionId: 'rev-1', agentId: 'claude', manifestDigest: 'manifest', itemCount: 1, source: 'fixture', sourceVersion: '1', observedAt: now }), prepareLaunch: async () => ({ revisionId: 'rev-1', agentId: 'claude', planDigest: 'plan', launchBoundary: 'invocation-scoped', source: 'fixture', sourceVersion: '1', observedAt: now }) }), 'rev-1');
    await expect(claude.probe({ hostId: 'claude', hostVersion: '2.0' })).resolves.toMatchObject({ status: 'supported' });
  });

  test('keeps unavailable capability unknown and version mismatch degraded', async () => {
    const unknown = { kind: 'unknown' as const, reasonCode: 'source.unavailable', observedAt: now, recovery: 'retry probe' };
    await expect(new OmpHostAdapter(facade({ probeAgent: async () => unknown }), 'rev-1').probe({ hostId: 'omp', hostVersion: '1.0' })).resolves.toMatchObject({ status: 'unknown', reasonCode: 'source.unavailable' });
    await expect(new OmpHostAdapter(facade(), 'rev-1').probe({ hostId: 'omp', hostVersion: '2.0' })).resolves.toMatchObject({ status: 'degraded', reasonCode: 'control-plane.capability.version-or-identity-mismatch' });
  });

  test('preserves known unsupported capability without promoting it', async () => {
    const unsupported = { agentId: 'omp' as const, agentVersion: '1.0', status: 'unsupported' as const, source: 'fixture', sourceVersion: '1', reasonCode: 'native-interface-missing', observedAt: now };
    await expect(new OmpHostAdapter(facade({ probeAgent: async () => unsupported }), 'rev-1').probe({ hostId: 'omp', hostVersion: '1.0' })).resolves.toMatchObject({ status: 'unsupported', reasonCode: 'native-interface-missing' });
  });

  test('rejects mixed source, version, or observation timestamps as degraded', async () => {
    await expect(new OmpHostAdapter(facade({ readAssemblyManifest: async () => ({ revisionId: 'rev-1', agentId: 'omp', manifestDigest: 'manifest', itemCount: 1, source: 'other-source', sourceVersion: '1', observedAt: now }) }), 'rev-1').probe({ hostId: 'omp', hostVersion: '1.0' })).resolves.toMatchObject({ status: 'degraded' });
  });

  test('does not activate Codex or OpenCode through the OMP adapter', async () => {
    await expect(new OmpHostAdapter(facade(), 'rev-1').probe({ hostId: 'codex', hostVersion: '1.0' })).resolves.toMatchObject({ status: 'unknown', reasonCode: 'host.client.identity-mismatch' });
  });
});
