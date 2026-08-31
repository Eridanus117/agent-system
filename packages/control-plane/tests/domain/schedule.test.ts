import { describe, expect, test } from 'bun:test';
import { agentId } from '../../src/domain/agent';
import {
  createAgentScheduleIntent,
  createOrcaAutomationReceipt,
  validateAgentScheduleIntent,
  validateOrcaAutomationReceipt,
  validateScheduleTarget,
  validateScheduleTrigger,
  type AgentScheduleIntent,
  type OrcaAutomationReceipt,
  type ScheduleTarget,
  type ScheduleTrigger,
} from '../../src/domain/schedule';

const createdAt = '2026-08-31T09:00:00.000Z';

function intent(overrides: Partial<AgentScheduleIntent> = {}): AgentScheduleIntent {
  return {
    scheduleId: 'schedule-1',
    agentId: agentId('omp'),
    revisionId: 'revision-1',
    trigger: { kind: 'preset', value: 'hourly' },
    target: { kind: 'repo', selector: 'org/repo' },
    sessionPolicy: 'fresh',
    precheckRef: null,
    sourceContextRef: null,
    createdAt,
    ...overrides,
  };
}

describe('schedule domain facts', () => {
  test('accepts every supported trigger form', () => {
    const triggers: ScheduleTrigger[] = [
      { kind: 'preset', value: 'hourly' },
      { kind: 'preset', value: 'daily' },
      { kind: 'preset', value: 'weekdays' },
      { kind: 'preset', value: 'weekly' },
      { kind: 'cron', expression: '0 * * * *' },
      { kind: 'rrule', value: 'RRULE:FREQ=DAILY' },
    ];

    for (const trigger of triggers) expect(() => validateScheduleTrigger(trigger)).not.toThrow();
  });

  test('rejects blank cron and RRULE values', () => {
    expect(() => validateScheduleTrigger({ kind: 'cron', expression: '   ' })).toThrow();
    expect(() => validateScheduleTrigger({ kind: 'rrule', value: '' })).toThrow();
  });

  test('accepts all four target kinds and optional project host', () => {
    const targets: ScheduleTarget[] = [
      { kind: 'repo', selector: 'org/repo' },
      { kind: 'workspace', selector: 'workspace-1' },
      { kind: 'project', selector: 'project-1' },
      { kind: 'project', selector: 'project-2', host: 'builder-1' },
      { kind: 'runtime', selector: 'runtime-1' },
    ];

    for (const target of targets) expect(() => validateScheduleTarget(target)).not.toThrow();
    expect(() => validateScheduleTarget({ kind: 'repo', selector: ' ' })).toThrow();
    expect(() => validateScheduleTarget({ kind: 'project', selector: 'project-1', host: ' ' })).toThrow();
  });
  test('constructs controlled nested trigger and target records', () => {
    const trigger: ScheduleTrigger = { kind: 'cron', expression: '0 * * * *' };
    const target: ScheduleTarget = { kind: 'project', selector: 'project-1', host: 'builder-1' };
    const schedule = createAgentScheduleIntent(intent({ trigger, target }));

    expect(schedule.trigger).toEqual(trigger);
    expect(schedule.target).toEqual(target);
    expect(schedule.trigger).not.toBe(trigger);
    expect(schedule.target).not.toBe(target);
    expect(Object.keys(schedule.trigger)).toEqual(['kind', 'expression']);
    expect(Object.keys(schedule.target)).toEqual(['kind', 'selector', 'host']);
  });

  test('rejects unknown raw fields at every schedule and receipt boundary', () => {
    expect(() => validateScheduleTrigger({ kind: 'cron', expression: '0 * * * *', prompt: 'raw task' } as ScheduleTrigger & { prompt: string })).toThrow();
    expect(() => validateScheduleTarget({ kind: 'repo', selector: 'org/repo', transcript: 'raw transcript' } as ScheduleTarget & { transcript: string })).toThrow();
    expect(() => createAgentScheduleIntent({ ...intent(), task: 'raw task' } as AgentScheduleIntent & { task: string })).toThrow();

    const receipt = {
      automationId: 'automation-1',
      provider: 'orca',
      target: { kind: 'repo', selector: 'org/repo', credentials: 'secret' },
      trigger: { kind: 'preset', value: 'hourly', transcript: 'raw transcript' },
      createdAt,
      sourceEvidence: 'orca:automation:automation-1',
      prompt: 'raw prompt',
    } as unknown as OrcaAutomationReceipt;
    expect(() => validateOrcaAutomationReceipt(receipt)).toThrow();
  });

  test('accepts controlled reference shapes and rejects raw text', () => {
    expect(() => createAgentScheduleIntent(intent({
      precheckRef: 'evidence://precheck-1',
      sourceContextRef: 'context://source-1',
    }))).not.toThrow();
    expect(() => createAgentScheduleIntent(intent({ precheckRef: 'raw prompt text' }))).toThrow();
    expect(() => createAgentScheduleIntent(intent({ sourceContextRef: 'credentials://token' }))).toThrow();
    expect(() => validateOrcaAutomationReceipt({
      automationId: 'automation-1',
      provider: 'orca',
      target: { kind: 'repo', selector: 'org/repo' },
      trigger: { kind: 'preset', value: 'hourly' },
      createdAt,
      sourceEvidence: 'transcript://raw-content',
    })).toThrow();
  });
  test('constructs a controlled automation receipt', () => {
    const target: ScheduleTarget = { kind: 'repo', selector: 'org/repo' };
    const trigger: ScheduleTrigger = { kind: 'preset', value: 'hourly' };
    const receipt = createOrcaAutomationReceipt({
      automationId: 'automation-1',
      provider: 'orca',
      target,
      trigger,
      createdAt,
      sourceEvidence: 'orca:automation:automation-1',
    });

    expect(receipt).toEqual({
      automationId: 'automation-1',
      provider: 'orca',
      target,
      trigger,
      createdAt,
      sourceEvidence: 'orca:automation:automation-1',
    });
    expect(receipt.target).not.toBe(target);
    expect(receipt.trigger).not.toBe(trigger);
    expect(Object.keys(receipt)).toEqual([
      'automationId',
      'provider',
      'target',
      'trigger',
      'createdAt',
      'sourceEvidence',
    ]);
    expect(() => validateOrcaAutomationReceipt(receipt)).not.toThrow();
  });

  test('preserves Agent, revision, trigger, target, policy, and controlled references', () => {
    const input = intent({
      sessionPolicy: 'reuse',
      precheckRef: 'evidence://precheck-1',
      sourceContextRef: 'context://source-1',
    });
    const schedule = createAgentScheduleIntent(input);

    expect(schedule.scheduleId).toBe('schedule-1');
    expect(schedule.agentId).toBe(agentId('omp'));
    expect(schedule.revisionId).toBe('revision-1');
    expect(schedule.sessionPolicy).toBe('reuse');
    expect(schedule.precheckRef).toBe('evidence://precheck-1');
    expect(schedule.sourceContextRef).toBe('context://source-1');
    expect('prompt' in schedule).toBe(false);
    expect('task' in schedule).toBe(false);
    expect(() => validateAgentScheduleIntent(schedule)).not.toThrow();
  });

  test('rejects blank identifiers, references, and non-RFC3339 timestamps', () => {
    expect(() => createAgentScheduleIntent(intent({ scheduleId: ' ' }))).toThrow();
    expect(() => createAgentScheduleIntent(intent({ revisionId: '' }))).toThrow();
    expect(() => createAgentScheduleIntent(intent({ precheckRef: ' ' }))).toThrow();
    expect(() => createAgentScheduleIntent(intent({ sourceContextRef: ' ' }))).toThrow();
    expect(() => createAgentScheduleIntent(intent({ createdAt: 'tomorrow' }))).toThrow();
  });
});
