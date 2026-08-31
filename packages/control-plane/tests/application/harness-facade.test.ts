import { describe, expect, test } from 'bun:test';
import { createHarnessControlPlaneFacade } from '../../src/application/public-entry';
import type { ExistingPublicApplicationPorts } from '../../src/application/ports/harness';

const now = '2026-08-28T00:00:00.000Z';

function ports(overrides: Partial<ExistingPublicApplicationPorts> = {}): ExistingPublicApplicationPorts {
  return {
    readRevision: async () => ({ revisionId: 'rev-1', schemaVersion: 1, agentId: 'omp', source: 'fixture', sourceVersion: '1', observedAt: now }),
    readManifest: async () => ({ revisionId: 'rev-1', agentId: 'omp', manifestDigest: 'digest', itemCount: 1, source: 'fixture', sourceVersion: '1', observedAt: now }),
    probe: async () => ({ agentId: 'omp', agentVersion: '1.0', status: 'supported', source: 'fixture', sourceVersion: '1', observedAt: now }),
    planLaunch: async () => ({ revisionId: 'rev-1', agentId: 'omp', planDigest: 'plan', launchBoundary: 'invocation-scoped', source: 'fixture', sourceVersion: '1', observedAt: now }),
    ...overrides,
  };
}

describe('control-plane Harness public facade', () => {
  test('returns only stable allowlisted DTOs', async () => {
    const facade = createHarnessControlPlaneFacade(ports());
    await expect(facade.readConfigRevision('rev-1', 'omp')).resolves.toMatchObject({ revisionId: 'rev-1' });
    const claude = createHarnessControlPlaneFacade(ports({ readRevision: async (revisionId, agentId) => ({ revisionId, schemaVersion: 1, agentId, source: 'fixture', sourceVersion: '1', observedAt: now }) }));
    await expect(claude.readConfigRevision('rev-1', 'claude')).resolves.toMatchObject({ agentId: 'claude' });
    await expect(facade.readAssemblyManifest('rev-1', 'omp')).resolves.toMatchObject({ manifestDigest: 'digest' });
    await expect(facade.probeAgent('omp')).resolves.toMatchObject({ status: 'supported' });
    await expect(facade.prepareLaunch('rev-1', 'omp')).resolves.toMatchObject({ launchBoundary: 'invocation-scoped' });
  });

  test('maps missing, malformed, permission and unavailable facts to unknown', async () => {
    const unknown = { kind: 'unknown' as const, reasonCode: 'permission-denied', observedAt: now, recovery: 'request read permission' };
    const facade = createHarnessControlPlaneFacade(ports({ readRevision: async () => unknown, probe: async () => unknown, planLaunch: async () => { throw new Error('offline'); } }));
    await expect(facade.readConfigRevision('missing', 'omp')).resolves.toMatchObject({ kind: 'unknown' });
    await expect(facade.probeAgent('omp')).resolves.toEqual(unknown);
    await expect(facade.prepareLaunch('rev-1', 'omp')).resolves.toMatchObject({ kind: 'unknown' });
    const malformed = createHarnessControlPlaneFacade(ports({ readManifest: async () => ({ revisionId: 'rev-1' } as never) }));
    await expect(malformed.readAssemblyManifest('rev-1', 'omp')).resolves.toMatchObject({ reasonCode: 'control-plane.manifest.shape-invalid' });
  });
});
