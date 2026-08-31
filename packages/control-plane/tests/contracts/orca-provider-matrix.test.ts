import { describe, expect, test } from 'bun:test';

type Discovery = 'known' | 'unknown';
type Capability = 'supported' | 'degraded' | 'unsupported' | 'unknown';
type ProviderMatrixRow = {
  readonly provider: string;
  readonly orcaEvidence: string;
  readonly discovery: Discovery;
  readonly probe: Capability;
  readonly assembly: Capability;
  readonly scheduling: Capability;
  readonly dispatch: Capability;
  readonly observation: Capability;
  readonly recovery: Capability;
  readonly evidenceRefs: readonly string[];
};

type ProviderMatrix = {
  readonly schemaVersion: number;
  readonly capturedAt: string;
  readonly runtime: {
    readonly status: 'ready' | 'unknown';
    readonly version: string;
    readonly evidenceRef: string;
  };
  readonly providers: readonly ProviderMatrixRow[];
};

const matrixUrl = new URL(
  '../../../../work/records/2026-08-31-orca-agent-scheduling/orca-provider-matrix.json',
  import.meta.url,
);
const matrix = await Bun.file(matrixUrl).json() as ProviderMatrix;
const baseline = matrix.providers.find((row) => row.provider === 'claude');
if (!baseline) throw new Error('provider matrix must contain claude baseline');


const CAPABILITIES: readonly (keyof Pick<ProviderMatrixRow, 'assembly' | 'scheduling' | 'dispatch' | 'observation' | 'recovery'>)[] = [
  'assembly',
  'scheduling',
  'dispatch',
  'observation',
  'recovery',
];
const SUPPORT_LEVELS: readonly Capability[] = ['supported', 'degraded', 'unsupported', 'unknown'];

function assertMatrixConsistency(row: ProviderMatrixRow): void {
  if (row.discovery === 'unknown' || row.probe === 'unknown') {
    for (const capability of CAPABILITIES) {
      if (row[capability] === 'supported') {
        throw new Error(`${row.provider}.${capability} cannot be supported before discovery and probe are known`);
      }
    }
  }
  if (row.scheduling === 'supported' && !row.evidenceRefs.some((ref) => Object.prototype.hasOwnProperty.call(SCHEDULING_EVIDENCE_REFS, ref))) {
    throw new Error(`${row.provider}.scheduling requires Orca automation dry-run or dispatch evidence`);
  }
}
const SCHEDULING_EVIDENCE_REFS: Record<string, true> = {
  'packages/control-plane/tests/contracts/orca-scheduler.test.ts': true,
  'packages/control-plane/tests/cli/agent-scheduling.test.ts': true,
  'orca:dispatch': true,
};


describe('Orca provider support matrix contracts', () => {
  test('contains only evidence-backed provider rows and closed capability states', () => {
    expect(matrix.schemaVersion).toBe(1);
    expect(matrix.runtime).toEqual({
      status: 'ready',
      version: '1.4.192',
      evidenceRef: 'orca:runtime:1.4.192',
    });
    expect(matrix.providers.map((row) => row.provider)).toEqual(['claude', 'codex', 'omp', 'pi', 'grok', 'hermes']);

    for (const row of matrix.providers) {
      expect(row.provider.length).toBeGreaterThan(0);
      expect(row.orcaEvidence.length).toBeGreaterThan(0);
      expect(['known', 'unknown']).toContain(row.discovery);
      expect(SUPPORT_LEVELS).toContain(row.probe);
      for (const capability of CAPABILITIES) expect(SUPPORT_LEVELS).toContain(row[capability]);
      expect(row.evidenceRefs.length).toBeGreaterThan(0);
      assertMatrixConsistency(row);
    }
  });

  test('keeps Hermes fail-closed without a known Orca provider or launch fact', () => {
    const hermes = matrix.providers.find((row) => row.provider === 'hermes');
    expect(hermes).toBeDefined();
    expect(hermes).toMatchObject({
      orcaEvidence: 'unknown:orca-provider-not-in-known-id-list',
      discovery: 'unknown',
      probe: 'unknown',
      assembly: 'unknown',
      scheduling: 'unknown',
      dispatch: 'unknown',
      observation: 'unknown',
      recovery: 'unknown',
    });
  });

  test('rejects supported downstream capability when discovery or probe is unknown', () => {
    const invalid = {
      ...baseline,
      discovery: 'unknown' as const,
      probe: 'unknown' as const,
      assembly: 'supported' as const,
    };
    expect(() => assertMatrixConsistency(invalid)).toThrow('cannot be supported');
  });

  test('requires explicit Orca dry-run or dispatch evidence for supported scheduling', () => {
    const invalid = {
      ...baseline,
      discovery: 'known' as const,
      probe: 'supported' as const,
      scheduling: 'supported' as const,
      evidenceRefs: ['openspec/changes/orca-agent-scheduling/04-技术现状/技术现状.md'],
    };
    expect(() => assertMatrixConsistency(invalid)).toThrow('requires Orca automation dry-run or dispatch evidence');
  });
});
