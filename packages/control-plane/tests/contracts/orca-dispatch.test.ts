import { describe, expect, test } from 'bun:test';
import { agentId } from '../../src/domain/agent';
import { createDispatchOperation, type DispatchOperation } from '../../src/domain/dispatch-operation';
import { createAgentScheduleIntent, type AgentScheduleIntent } from '../../src/domain/schedule';
import {
  OrcaDispatchAdapter,
  OrcaDispatchCorrelationError,
  correlateOrcaAutomationReceipt,
  type OrcaDispatchCorrelation,
} from '../../src/adapters/orca/orca-dispatch';
import type { AgentSchedulerPort } from '../../src/application/ports/scheduler';

const createdAt = '2026-08-31T09:00:00.000Z';

function intent(): AgentScheduleIntent {
  return createAgentScheduleIntent({
    scheduleId: 'schedule-1',
    agentId: agentId('codex'),
    revisionId: 'revision-1',
    trigger: { kind: 'cron', expression: '0 9 * * 1' },
    target: { kind: 'project', selector: 'project-1', host: 'host-1' },
    sessionPolicy: 'reuse',
    precheckRef: null,
    sourceContextRef: null,
    createdAt,
  });
}

function planned(): DispatchOperation {
  return createDispatchOperation({
    operationId: 'operation-1',
    scheduleId: 'schedule-1',
    agentId: agentId('codex'),
    revisionId: 'revision-1',
    target: { kind: 'project', selector: 'project-1', host: 'host-1' },
    manifestHash: 'manifest-sha256',
    createdAt,
  });
}

function correlation(overrides: Partial<OrcaDispatchCorrelation> = {}): OrcaDispatchCorrelation {
  return {
    operationId: 'operation-1',
    scheduleId: 'schedule-1',
    agentId: agentId('codex'),
    revisionId: 'revision-1',
    target: { kind: 'project', selector: 'project-1', host: 'host-1' },
    manifestHash: 'manifest-sha256',
    receipt: {
      automationId: 'automation-1',
      provider: 'codex',
      target: { kind: 'project', selector: 'project-1', host: 'host-1' },
      trigger: { kind: 'cron', expression: '0 9 * * 1' },
      createdAt,
      sourceEvidence: 'orca:automation:automation-1',
    },
    ...overrides,
  };
}

describe('Orca dispatch contract', () => {
  test('correlates a receipt to every operation field and stops at dispatched', () => {
    const result = correlateOrcaAutomationReceipt(correlation());
    expect(result).toMatchObject({
      operationId: 'operation-1',
      scheduleId: 'schedule-1',
      agentId: agentId('codex'),
      revisionId: 'revision-1',
      target: { kind: 'project', selector: 'project-1', host: 'host-1' },
      phase: 'dispatched',
      automationId: 'automation-1',
      manifestHash: 'manifest-sha256',
      createdAt,
    });
    expect(result.updatedAt).toEqual(expect.any(String));
    expect(result.terminalReason).toBeNull();
  });

  test('rejects receipt correlation when target does not match', () => {
    expect(() => correlateOrcaAutomationReceipt(correlation({
      target: { kind: 'repo', selector: 'other/repo' },
    }))).toThrowError(new OrcaDispatchCorrelationError('correlation-mismatch', 'receipt target does not match dispatch target'));
  });
  test('rejects receipt correlation when provider does not match the requested agent', () => {
    expect(() => correlateOrcaAutomationReceipt(correlation({
      receipt: { ...correlation().receipt, provider: 'claude' },
    }))).toThrowError(new OrcaDispatchCorrelationError('correlation-mismatch', 'receipt provider does not match dispatch agent'));
  });

  test('adapter dispatches one schedule and returns correlated dispatched operation', async () => {
    const receipt = correlation().receipt;
    const scheduler: AgentSchedulerPort = {
      async create(input) {
        expect(input).toEqual(intent());
        return receipt;
      },
      async cancel() {},
    };
    const adapter = new OrcaDispatchAdapter(scheduler);
    await expect(adapter.dispatch({ operation: planned(), schedule: intent() })).resolves.toMatchObject({
      operationId: 'operation-1',
      scheduleId: 'schedule-1',
      agentId: agentId('codex'),
      revisionId: 'revision-1',
      target: { kind: 'project', selector: 'project-1', host: 'host-1' },
      phase: 'dispatched',
      automationId: 'automation-1',
      manifestHash: 'manifest-sha256',
    });
  });

  test('rejects an automation receipt whose trigger differs from the requested schedule', async () => {
    const scheduler: AgentSchedulerPort = {
      async create() {
        return { ...correlation().receipt, trigger: { kind: 'preset', value: 'daily' } };
      },
      async cancel() {},
    };
    await expect(new OrcaDispatchAdapter(scheduler).dispatch({ operation: planned(), schedule: intent() }))
      .rejects.toMatchObject({ name: 'OrcaDispatchCorrelationError', code: 'correlation-mismatch' });
  });
});
