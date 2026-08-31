import { describe, expect, test } from 'bun:test';
import { validateCapabilityReference } from '../../src/domain/capability';
import { configurationName, configurationRevisionId, validateConfigurationRevision, type ConfigurationRevision } from '../../src/domain/configuration';
import { agentId } from '../../src/domain/agent';
import { createActivationOperation, transitionActivationOperation } from '../../src/domain/activation-operation';
import { createLaunchObservation } from '../../src/domain/launch-observation';

const revision: ConfigurationRevision = {
  configName: configurationName('default'),
  revisionId: configurationRevisionId('rev-1'),
  schemaVersion: 1,
  defaultMarker: { kind: 'known', value: true },
  scopeBoundary: { kind: 'known', value: 'project' },
  availability: { kind: 'known', value: 'resolved' },
  capabilities: [{ kind: 'skill', name: 'review', source: 'project-capability', summary: undefined, sourceRef: undefined, contentFingerprint: undefined }],
  createdAt: '2026-08-29T00:00:00.000Z',
  triggerCategory: 'new-scenario',
  evidenceRef: 'tests/domain/domain.test.ts',
  supersedesRevisionId: null,
};

describe('canonical domain', () => {
  test('uses one capability reference collection and validates duplicate identity', () => {
    validateConfigurationRevision(revision);
    expect(() => validateConfigurationRevision({ ...revision, capabilities: [revision.capabilities[0]!, revision.capabilities[0]!] })).toThrow('duplicate capability');
    expect(() => validateCapabilityReference({ ...revision.capabilities[0]!, name: '' })).toThrow('capability name');
  });

  test('separates activation operation transitions from launch observations', () => {
    const operation = createActivationOperation({ operationId: 'op-1', revisionId: revision.revisionId, configName: revision.configName, agentId: agentId('omp'), planHash: 'hash', createdAt: revision.createdAt });
    const awaiting = transitionActivationOperation(operation, { type: 'awaiting-confirmation' });
    expect(awaiting.ok).toBe(true);
    if (!awaiting.ok) return;
    const applying = transitionActivationOperation(awaiting.operation, { type: 'confirmed' });
    expect(applying.ok).toBe(true);
    if (!applying.ok) return;
    const succeeded = transitionActivationOperation(applying.operation, { type: 'succeeded' });
    expect(succeeded.ok).toBe(true);
    if (!succeeded.ok) return;
    const restart = transitionActivationOperation(succeeded.operation, { type: 'requires-restart', reason: 'switch' });
    expect(restart.ok).toBe(true);
    const observation = createLaunchObservation({ operationId: 'op-1', agentId: agentId('omp'), stage: 'outcome-observed', outcome: 'succeeded', processReference: undefined, reason: undefined, observedAt: revision.createdAt });
    expect(observation.stage).toBe('outcome-observed');
    expect('phase' in observation).toBe(false);
  });
});
