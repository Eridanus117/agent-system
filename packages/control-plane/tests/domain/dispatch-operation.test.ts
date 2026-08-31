import { describe, expect, test } from 'bun:test';
import { agentId } from '../../src/domain/agent';
import {
  createDispatchOperation,
  isTerminalDispatchPhase,
  transitionDispatchOperation,
  validateDispatchOperation,
  type DispatchOperation,
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
    const created = createDispatchOperation({
      operationId: 'operation-1',
      scheduleId: 'schedule-1',
      agentId: agentId('omp'),
      revisionId: 'revision-1',
      target: { kind: 'workspace', selector: 'workspace-1' },
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
    expect(() => validateDispatchOperation(created)).not.toThrow();
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
        expect(result.operation.terminalReason).toBe(outcome.reason);
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
