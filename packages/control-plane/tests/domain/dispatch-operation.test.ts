import { describe, expect, test } from 'bun:test';
import { agentId } from '../../src/domain/agent';
import {
  createDispatchOperation,
  isTerminalDispatchPhase,
  transitionDispatchOperation,
  validateDispatchOperation,
  type DispatchOperation,
  type DispatchOperationEvent,
} from '../../src/domain/dispatch-operation';

const createdAt = '2026-08-31T09:00:00.000Z';

function operation(overrides: Partial<DispatchOperation> = {}): DispatchOperation {
  return {
    operationId: 'operation-1',
    scheduleId: 'schedule-1',
    agentId: agentId('omp'),
    revisionId: 'revision-1',
    target: { kind: 'repo', selector: 'org/repo' },
    phase: 'planned',
    automationId: null,
    manifestHash: 'sha256:manifest-1',
    createdAt,
    updatedAt: createdAt,
    terminalReason: null,
    ...overrides,
  };
}

describe('dispatch operation domain facts', () => {
  test('creates a planned operation with stable correlation fields', () => {
    const target = { kind: 'workspace' as const, selector: 'workspace-1' };
    const created = createDispatchOperation({
      operationId: 'operation-1',
      scheduleId: 'schedule-1',
      agentId: agentId('omp'),
      revisionId: 'revision-1',
      target,
      manifestHash: 'sha256:manifest-1',
      createdAt,
    });

    expect(created.phase).toBe('planned');
    expect(created.automationId).toBeNull();
    expect(created.operationId).toBe('operation-1');
    expect(created.scheduleId).toBe('schedule-1');
    expect(created.agentId).toBe(agentId('omp'));
    expect(created.revisionId).toBe('revision-1');
    expect(created.target).toEqual({ kind: 'workspace', selector: 'workspace-1' });
    expect('prompt' in created).toBe(false);
    expect('task' in created).toBe(false);
    expect(created.target).not.toBe(target);
    expect(() => validateDispatchOperation(created)).not.toThrow();
  });

  test('allows planned precheck failure to produce skipped without an automation id', () => {
    const planned = operation();
    expect(() => transitionDispatchOperation(planned, { type: 'skipped', reason: 'precheck failed' })).not.toThrow();
    const skipped = transitionDispatchOperation(planned, { type: 'skipped', reason: 'precheck failed' });

    expect(skipped).toEqual({
      ok: true,
      operation: expect.objectContaining({
        phase: 'skipped',
        automationId: null,
        terminalReason: 'precheck failed',
      }),
    });
  });

  test('preserves automation correlation when dispatched or observing is skipped', () => {
    for (const phase of ['dispatched', 'observing'] as const) {
      const result = transitionDispatchOperation(operation({ phase, automationId: 'automation-1' }), {
        type: 'skipped',
        reason: 'precheck failed',
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.operation.automationId).toBe('automation-1');
    }
  });

  test('rejects skipped transitions without prior automation correlation', () => {
    for (const phase of ['dispatched', 'observing'] as const) {
      const operationWithoutAutomation = operation({ phase, automationId: null });
      expect(() => transitionDispatchOperation(operationWithoutAutomation, { type: 'skipped' })).not.toThrow();
      expect(transitionDispatchOperation(operationWithoutAutomation, { type: 'skipped' })).toEqual({
        ok: false,
        reason: 'invalid-operation',
      });
    }
  });

  test('fails closed without throwing for an operation with an injected target field', () => {
    const polluted = operation({
      target: { kind: 'repo', selector: 'org/repo', prompt: 'raw task' } as DispatchOperation['target'],
    });
    expect(() => transitionDispatchOperation(polluted, { type: 'skipped', reason: 'precheck failed' })).not.toThrow();
    expect(transitionDispatchOperation(polluted, { type: 'skipped', reason: 'precheck failed' })).toEqual({
      ok: false,
      reason: 'invalid-operation',
    });
  });
  test('fails closed without throwing for malformed events', () => {
    for (const event of [null, undefined, 'not-an-event', 42, {}] as unknown[]) {
      expect(() => transitionDispatchOperation(operation(), event as DispatchOperationEvent)).not.toThrow();
      expect(transitionDispatchOperation(operation(), event as DispatchOperationEvent)).toEqual({
        ok: false,
        reason: 'invalid-event',
      });
    }
  });

  test('allows the planned, dispatched, observing, and succeeded path', () => {
    const planned = createDispatchOperation({
      operationId: 'operation-1',
      scheduleId: 'schedule-1',
      agentId: agentId('omp'),
      revisionId: 'revision-1',
      target: { kind: 'repo', selector: 'org/repo' },
      manifestHash: 'sha256:manifest-1',
      createdAt,
    });
    const dispatched = transitionDispatchOperation(planned, { type: 'dispatched', automationId: 'automation-1' });
    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) return;
    expect(dispatched.operation.phase).toBe('dispatched');
    expect(dispatched.operation.automationId).toBe('automation-1');

    const observing = transitionDispatchOperation(dispatched.operation, { type: 'observing' });
    expect(observing.ok).toBe(true);
    if (!observing.ok) return;
    const succeeded = transitionDispatchOperation(observing.operation, { type: 'succeeded' });
    expect(succeeded.ok).toBe(true);
    if (!succeeded.ok) return;
    expect(succeeded.operation.phase).toBe('succeeded');
    expect(isTerminalDispatchPhase(succeeded.operation.phase)).toBe(true);
  });

  test('allows explicit degraded, failed, skipped, and unknown terminal outcomes', () => {
    const outcomes: Array<{ type: 'degraded' | 'failed' | 'skipped' | 'unknown'; reason?: string }> = [
      { type: 'degraded', reason: 'partial observation' },
      { type: 'failed', reason: 'launch failed' },
      { type: 'skipped', reason: 'precheck failed' },
      { type: 'unknown', reason: 'insufficient evidence' },
    ];

    for (const outcome of outcomes) {
      const result = transitionDispatchOperation(
        operation({ phase: outcome.type === 'skipped' ? 'dispatched' : 'observing', automationId: 'automation-1' }),
        outcome,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.operation.phase).toBe(outcome.type);
        expect(result.operation.terminalReason).toBe(outcome.reason ?? null);
        expect(isTerminalDispatchPhase(result.operation.phase)).toBe(true);
      }
    }
  });

  test('fails closed for illegal transitions and invalid operation facts', () => {
    expect(transitionDispatchOperation(operation({ phase: 'planned' }), { type: 'succeeded' })).toEqual({
      ok: false,
      reason: 'invalid-transition:planned:succeeded',
    });
    expect(transitionDispatchOperation(operation({ phase: 'succeeded', automationId: 'automation-1' }), { type: 'observing' }).ok).toBe(false);
    expect(() => validateDispatchOperation(operation({ operationId: ' ' }))).toThrow();
    expect(() => validateDispatchOperation(operation({ manifestHash: '' }))).toThrow();
    expect(() => validateDispatchOperation(operation({ updatedAt: 'not-a-timestamp' }))).toThrow();
    expect(() => validateDispatchOperation(operation({ phase: 'dispatched' }))).toThrow('automation id');
  });
});
