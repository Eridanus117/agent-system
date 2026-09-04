import { expect, test } from 'bun:test';
import { runHostSmoke } from '../../src/cli/host-smoke.ts';
import type { ControlPlaneFacade } from '../../src/application/control-plane-port.ts';

const facade: ControlPlaneFacade = {
  readConfigRevision: async () => { throw new Error('must not call facade'); },
  readAssemblyManifest: async () => { throw new Error('must not call facade'); },
  probeAgent: async () => { throw new Error('must not call facade'); },
  prepareLaunch: async () => { throw new Error('must not call facade'); },
};

test('normalizes empty, quoted, and whitespace revision ids as not-available', async () => {
  for (const revisionId of [undefined, '', '  ', '""', "''", ' "  " ']) {
    await expect(runHostSmoke(facade, { host: 'omp', revisionId })).resolves.toMatchObject({
      result: 'not-available',
      reasonCode: 'HARNESS_HOST_REVISION_ID.missing',
    });
  }
});
