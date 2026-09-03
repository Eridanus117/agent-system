import { describe, expect, test } from 'bun:test';
import {
  collectRealSmokeEvidence,
  normalizeWindowsPath,
  runReadOnlyProcess,
  validateRealSmokeEvidence,
} from '../../src/smoke/evidence.ts';

const correlation = {
  workflowId: 'workflow-1', planId: 'plan-1', operationId: 'smoke-1', snapshotId: 'snapshot-1', attemptId: 'attempt-1',
  source: 'local-preflight', sourceVersion: '1', observedAt: '2026-08-28T00:00:00.000Z',
};

// 下面三条实跑测试只登记了 cmd.exe（见 src/smoke/evidence.ts 的 READ_ONLY_SUBCOMMANDS 白名单），
// 非 Windows 平台没有 cmd.exe，按平台跳过；不为测试放宽产品侧白名单。
const windowsOnly = test.skipIf(process.platform !== 'win32');

describe('Stage 4 real smoke evidence', () => {
  test('returns not-available without invoking a transport when prerequisites are missing', async () => {
    let invoked = false;
    const evidence = await collectRealSmokeEvidence({
      backend: 'orca',
      adapterVersion: 'controlled-only',
      correlation,
      requiredEnv: ['HARNESS_ORCA_RUN_ID'],
      environment: {},
      read: async () => {
        invoked = true;
        return { objectRefs: [], permission: 'read-only' as const, network: 'unknown' as const, readbackRefs: [], result: 'not-available' as const };
      },
    });
    expect(invoked).toBe(false);
    expect(evidence.result).toBe('not-available');
    expect(evidence.permission).toBe('read-only');
    expect(evidence.scope).toBe('read-only');
    expect(evidence.missing).toEqual(['HARNESS_ORCA_RUN_ID']);
  });

  test('rejects non-read-only or sensitive evidence', () => {
    const valid = {
      backend: 'github', adapterVersion: '1', observedAt: correlation.observedAt,
      objectRefs: ['owner/repo#1'], permission: 'read-only', network: 'unknown', readbackRefs: ['fixture://summary'],
      result: 'not-available', scope: 'read-only', currentHead: 'head', sourceHash: 'source', correlation,
      missing: ['HARNESS_GITHUB_OWNER'],
    } as const;
    expect(validateRealSmokeEvidence(valid)).toEqual(valid);
    expect(() => validateRealSmokeEvidence({ ...valid, scope: 'write' })).toThrow('read-only');
    expect(() => validateRealSmokeEvidence({ ...valid, readbackRefs: ['stderr: password=secret'] })).toThrow('sensitive');
  });

  test('rejects malformed correlation evidence', () => {
    expect(() => validateRealSmokeEvidence({
      backend: 'orca',
      adapterVersion: '1',
      observedAt: correlation.observedAt,
      objectRefs: [],
      permission: 'read-only',
      network: 'unknown',
      readbackRefs: [],
      result: 'not-available',
      scope: 'read-only',
      correlation: { ...correlation, workflowId: '' },
    })).toThrow('read-only evidence shape');
  });

  test('normalizes Windows paths without shell semantics', () => {
    expect(normalizeWindowsPath('C:\\work tree\\测试\\artifact.json')).toBe('C:/work tree/测试/artifact.json');
    expect(() => normalizeWindowsPath('C:\\work\\..\\..\\secret')).toThrow('escape');
  });

  windowsOnly('runs an allowlisted read-only command and preserves non-zero exit', async () => {
    const result = await runReadOnlyProcess(['cmd.exe', '/d', '/c', 'exit /b 3']);
    expect(result.exitCode).toBe(3);
    expect(result.timedOut).toBe(false);
  });

  test('rejects remote-write and destructive commands before spawning', () => {
    for (const argv of [['git', 'push'], ['gh', 'pr', 'merge', '1'], ['orca', 'worktree', 'rm', 'x']]) {
      expect(() => runReadOnlyProcess(argv)).toThrow('allowlist');
    }
  });

  test('rejects generic bun run and PowerShell execution', () => {
    expect(() => runReadOnlyProcess(['bun', 'run', 'write-script.ts'])).toThrow('allowlist');
    expect(() => runReadOnlyProcess(['powershell.exe', '-NoProfile', '-Command', 'Remove-Item file'])).toThrow('allowlist');
  });

  windowsOnly('redacts unknown process output instead of returning raw content', async () => {
    const result = await runReadOnlyProcess(['cmd.exe', '/d', '/c', 'echo unknown payload']);
    expect(result.stdoutSummary).toBe('[redacted]');
  });

  windowsOnly('terminates an allowlisted timed-out command without shell injection', async () => {
    const result = await runReadOnlyProcess(['cmd.exe', '/d', '/c', 'timeout /t 1 /nobreak'], { timeoutMs: 10 });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  });

});
