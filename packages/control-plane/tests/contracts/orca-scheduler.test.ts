import { describe, expect, test } from 'bun:test';
import { agentId } from '../../src/domain/agent';
import { createAgentScheduleIntent, type AgentScheduleIntent } from '../../src/domain/schedule';
import {
  OrcaCommandError,
  OrcaScheduler,
  type OrcaCommandPort,
  type OrcaScheduleOptions,
} from '../../src/adapters/orca/orca-scheduler';

const createdAt = '2026-08-31T09:00:00.000Z';

function intent(overrides: Partial<AgentScheduleIntent> = {}): AgentScheduleIntent {
  return createAgentScheduleIntent({
    scheduleId: 'schedule-1',
    agentId: agentId('codex'),
    revisionId: 'revision-1',
    trigger: { kind: 'preset', value: 'hourly' },
    target: { kind: 'repo', selector: 'org/repo' },
    sessionPolicy: 'fresh',
    precheckRef: null,
    sourceContextRef: null,
    createdAt,
    ...overrides,
  });
}

interface StubRunner extends OrcaCommandPort {
  readonly calls: string[][];
}

function runner(stdout: string, exitCode = 0, stderr = ''): StubRunner {
  const calls: string[][] = [];
  return {
    calls,
    async run(args) {
      calls.push([...args]);
      return { exitCode, stdout, stderr };
    },
  };
}


const receiptJson = JSON.stringify({
  automationId: 'automation-1',
  provider: 'codex',
  target: { kind: 'repo', selector: 'org/repo' },
  trigger: { kind: 'preset', value: 'hourly' },
  createdAt,
  sourceEvidence: 'orca:automation:automation-1',
});

describe('Orca scheduler contract', () => {
  test('maps every trigger and target to structured argv without shell strings', async () => {
    const cases: readonly [AgentScheduleIntent['trigger'], AgentScheduleIntent['target'], string[]][] = [
      [{ kind: 'preset', value: 'hourly' }, { kind: 'repo', selector: 'org/repo' }, ['--repo', 'org/repo']],
      [{ kind: 'preset', value: 'daily' }, { kind: 'workspace', selector: 'ws-1' }, ['--workspace', 'ws-1']],
      [{ kind: 'preset', value: 'weekdays' }, { kind: 'project', selector: 'project-1', host: 'host-1' }, ['--project', 'project-1', '--host', 'host-1']],
      [{ kind: 'preset', value: 'weekly' }, { kind: 'runtime', selector: 'runtime-1' }, ['--host', 'runtime-1']],
      [{ kind: 'cron', expression: '0 9 * * 1' }, { kind: 'repo', selector: 'org/repo' }, ['--repo', 'org/repo']],
      [{ kind: 'rrule', value: 'FREQ=DAILY;INTERVAL=2' }, { kind: 'workspace', selector: 'ws-1' }, ['--workspace', 'ws-1']],
    ];

    for (const [trigger, target, targetArgs] of cases) {
      const command = runner(receiptJson);
      const scheduler = new OrcaScheduler(command);
      await scheduler.create(intent({ trigger, target }));
      expect(command.calls[0]).toEqual([
        'orca', 'automations', 'create',
        '--name', 'schedule-1',
        '--trigger', trigger.kind === 'cron' ? trigger.expression : trigger.value,
        '--provider', 'codex',
        ...targetArgs,
        '--fresh-session',
        '--json',
      ]);
    }
  });

  test('maps controlled optional settings and enabled state exactly', async () => {
    const command = runner(receiptJson);
    const options: OrcaScheduleOptions = {
      timezone: 'Asia/Shanghai',
      missedRunGrace: '15m',
      enabled: false,
    };
    const scheduler = new OrcaScheduler(command, options);
    await scheduler.create(intent({
      sessionPolicy: 'reuse',
      precheckRef: 'evidence://precheck-1',
      sourceContextRef: 'context://source-1',
    }));

    expect(command.calls[0]).toEqual([
      'orca', 'automations', 'create',
      '--name', 'schedule-1', '--trigger', 'hourly', '--provider', 'codex',
      '--repo', 'org/repo', '--reuse-session',
      '--precheck', 'evidence://precheck-1',
      '--source-context', 'context://source-1',
      '--timezone', 'Asia/Shanghai', '--missed-run-grace', '15m', '--disabled',
      '--json',
    ]);
    const enabledCommand = runner(receiptJson);
    await new OrcaScheduler(enabledCommand, { enabled: true }).create(intent());
    expect(enabledCommand.calls[0]?.at(-2)).toBe('--enabled');
  });

  test('returns a typed failure for non-zero, invalid JSON and incomplete creation output', async () => {
    const failures: readonly [StubRunner, OrcaCommandError['code']][] = [
      [runner('', 2, 'permission denied'), 'non-zero-exit'],
      [runner('human readable output'), 'invalid-json'],
      [runner('1'), 'invalid-output'],
      [runner('[]'), 'invalid-output'],
      [runner(JSON.stringify({ provider: 'codex', sourceEvidence: 'orca:automation:x' })), 'missing-automation-id'],
      [runner(JSON.stringify({ automationId: 'automation-1', sourceEvidence: 'orca:automation:x' })), 'missing-provider'],
      [runner(JSON.stringify({ automationId: 'automation-1', provider: 'codex' })), 'missing-creation-evidence'],
    ];

    for (const [command, code] of failures) {
      await expect(new OrcaScheduler(command).create(intent())).rejects.toMatchObject({ name: 'OrcaCommandError', code });
    }
  });

  test('cancels only on matching JSON cancellation confirmation', async () => {
    const command = runner(JSON.stringify({ automationId: 'automation-1', status: 'cancelled' }));
    const mismatched = runner(JSON.stringify({ automationId: 'automation-2', status: 'cancelled' }));
    await expect(new OrcaScheduler(mismatched).cancel('automation-1')).rejects.toMatchObject({ code: 'cancellation-mismatch' });
    await new OrcaScheduler(command).cancel('automation-1');
    expect(command.calls[0]).toEqual(['orca', 'automations', 'cancel', '--id', 'automation-1', '--json']);
    const invalidJson = runner('not json');
    await expect(new OrcaScheduler(invalidJson).cancel('automation-1')).rejects.toMatchObject({ code: 'invalid-json' });
    const failed = runner('', 1, 'cancel failed');
    await expect(new OrcaScheduler(failed).cancel('automation-1')).rejects.toMatchObject({ code: 'non-zero-exit' });

    const notConfirmed = runner(JSON.stringify({ automationId: 'automation-1', status: 'active' }));
    await expect(new OrcaScheduler(notConfirmed).cancel('automation-1')).rejects.toMatchObject({ code: 'missing-cancellation-confirmation' });
  });
});
