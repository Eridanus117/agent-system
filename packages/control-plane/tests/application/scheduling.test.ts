import { describe, expect, test } from 'bun:test';
import type { AgentRegistry } from '../../src/application/ports/agent-registry';
import type { AgentSchedulerPort } from '../../src/application/ports/scheduler';
import type { AgentScheduleRepository } from '../../src/application/ports/schedule-repository';
import type { DispatchOperationRepository } from '../../src/application/ports/dispatch-repository';
import type { ConfigurationRepository } from '../../src/application/ports/configuration-repository';
import type { AgentCapabilitySnapshot, AgentDescriptor } from '../../src/domain/agent';
import { agentId } from '../../src/domain/agent';
import type { ConfigurationRevision } from '../../src/domain/configuration';
import { configurationName, configurationRevisionId } from '../../src/domain/configuration';
import { createAgentScheduleIntent, createOrcaAutomationReceipt, type AgentScheduleIntent, type OrcaAutomationReceipt, type ScheduleTarget, type ScheduleTrigger } from '../../src/domain/schedule';
import type { DispatchOperation } from '../../src/domain/dispatch-operation';
import {
  cancelAgentSchedule,
  createAgentSchedule,
  dispatchAgentSchedule,
  reconcileAgentDispatch,
  type ReconcileAgentDispatchInput,
} from '../../src/application/scheduling';

const NOW = '2026-08-31T00:00:00.000Z';
const AGENT = agentId('omp');
const REVISION = configurationRevisionId('revision-1');
const TARGET: ScheduleTarget = { kind: 'repo', selector: 'org/repo' };
const TRIGGER: ScheduleTrigger = { kind: 'preset', value: 'daily' };

function revision(): ConfigurationRevision {
  return {
    configName: configurationName('default'),
    revisionId: REVISION,
    schemaVersion: 1,
    defaultMarker: { kind: 'known', value: true },
    scopeBoundary: { kind: 'known', value: 'repo' },
    availability: { kind: 'known', value: 'resolved' },
    capabilities: [],
    createdAt: NOW,
    triggerCategory: 'new-scenario',
    evidenceRef: 'evidence://revision/1',
    supersedesRevisionId: null,
  };
}

function schedule(id = 'schedule-1'): AgentScheduleIntent {
  return createAgentScheduleIntent({
    scheduleId: id,
    agentId: AGENT,
    revisionId: REVISION,
    trigger: TRIGGER,
    target: TARGET,
    sessionPolicy: 'fresh',
    precheckRef: 'evidence://precheck/1',
    sourceContextRef: 'context://schedule/1',
    createdAt: NOW,
  });
}

function receipt(overrides: Partial<OrcaAutomationReceipt> = {}): OrcaAutomationReceipt {
  return createOrcaAutomationReceipt({
    automationId: 'automation-1',
    provider: 'omp',
    target: TARGET,
    trigger: TRIGGER,
    createdAt: NOW,
    sourceEvidence: 'evidence://orca/automation-1',
    ...overrides,
  });
}

function snapshot(level: AgentCapabilitySnapshot['level'] = 'supported'): AgentCapabilitySnapshot {
  return {
    probeId: 'probe-1',
    agentId: AGENT,
    level,
    version: { kind: 'known', value: 'omp-1' },
    capabilities: { scheduling: level },
    observedAt: NOW,
    evidenceRef: 'evidence://probe/1',
  };
}

class FakeRegistry implements AgentRegistry {
  descriptor: AgentDescriptor | null = { id: AGENT, displayName: 'OMP', provider: 'omp', sourceEvidence: 'evidence://agent/omp' };
  capability = snapshot();
  async list(): Promise<readonly AgentDescriptor[]> { return this.descriptor === null ? [] : [this.descriptor]; }
  async get(): Promise<AgentDescriptor | null> { return this.descriptor; }
  async probe(): Promise<AgentCapabilitySnapshot> { return this.capability; }
  adapter(): null { return null; }
}

class FakeConfigRepository implements ConfigurationRepository {
  value: ConfigurationRevision | null = revision();
  async listAll(): Promise<readonly ConfigurationRevision[]> { return this.value === null ? [] : [this.value]; }
  async findById(): Promise<ConfigurationRevision | null> { return this.value; }
}

class FakeScheduleRepository implements AgentScheduleRepository {
  readonly values = new Map<string, AgentScheduleIntent>();
  async save(value: AgentScheduleIntent): Promise<void> {
    if (this.values.has(value.scheduleId)) throw new Error('duplicate schedule');
    this.values.set(value.scheduleId, value);
  }
  async findById(id: string): Promise<AgentScheduleIntent | null> { return this.values.get(id) ?? null; }
  async listByAgent(): Promise<readonly AgentScheduleIntent[]> { return [...this.values.values()]; }
}

class FakeDispatchRepository implements DispatchOperationRepository {
  readonly values = new Map<string, DispatchOperation>();
  failUpdate = false;
  readonly calls: string[] = [];
  async save(value: DispatchOperation): Promise<void> {
    if (this.values.has(value.operationId)) throw new Error('duplicate operation');
    this.calls.push(`save:${value.phase}`);
    this.values.set(value.operationId, value);
  }
  async findById(id: string): Promise<DispatchOperation | null> { return this.values.get(id) ?? null; }
  async listByAgent(): Promise<readonly DispatchOperation[]> { return [...this.values.values()]; }
  async updatePhase(id: string, expectedPhase: DispatchOperation['phase'], nextState: DispatchOperation): Promise<void> {
    if (this.failUpdate) throw new Error('persistence failure');
    const current = this.values.get(id);
    if (current === undefined || current.phase !== expectedPhase) throw new Error('stale update');
    this.calls.push(`update:${expectedPhase}->${nextState.phase}`);
    this.values.set(id, nextState);
  }
  async appendReceipt(id: string, value: OrcaAutomationReceipt): Promise<void> {
    const current = this.values.get(id);
    if (current === undefined || current.automationId !== value.automationId) throw new Error('receipt correlation');
    this.calls.push('receipt');
  }
}

class FakeScheduler implements AgentSchedulerPort {
  creates = 0;
  cancels: string[] = [];
  failure: Error | null = null;
  receiptValue = receipt();
  readonly calls: string[] = [];
  async create(): Promise<OrcaAutomationReceipt> {
    this.creates += 1;
    this.calls.push('create');
    if (this.failure !== null) throw this.failure;
    return this.receiptValue;
  }
  async cancel(id: string): Promise<void> {
    this.cancels.push(id);
    this.calls.push(`cancel:${id}`);
  }
}

function deps() {
  const registry = new FakeRegistry();
  const scheduler = new FakeScheduler();
  const schedules = new FakeScheduleRepository();
  const operations = new FakeDispatchRepository();
  const configurations = new FakeConfigRepository();
  const calls: string[] = [];
  const originalOperationSave = operations.save.bind(operations);
  operations.save = async (value) => { calls.push('operation:save'); await originalOperationSave(value); };
  const originalSave = schedules.save.bind(schedules);
  schedules.save = async (value) => { calls.push('schedule:save'); await originalSave(value); };
  scheduler.calls.push = (...items: string[]) => { calls.push(...items); return items.length; };
  return { configurations, registry, scheduler, schedules, operations, now: () => NOW, calls };
}

describe('scheduling application use cases', () => {
  test('unknown Agent capability refuses scheduling and never calls scheduler', async () => {
    const context = deps();
    context.registry.capability = snapshot('unknown');
    await expect(createAgentSchedule(context, schedule())).rejects.toThrow(/capability|supported|unknown/u);
    expect(context.scheduler.creates).toBe(0);
    expect(context.schedules.values.size).toBe(0);
  });

  test('binds one Agent/revision and persists schedule before dispatch side effect', async () => {
    const context = deps();
    const created = await createAgentSchedule(context, schedule());
    expect(created.agentId).toBe(AGENT);
    expect(created.revisionId).toBe(REVISION);
    const operation = await dispatchAgentSchedule(context, { scheduleId: created.scheduleId, operationId: 'operation-1', manifestHash: 'sha256:manifest' });
    expect(operation.phase).toBe('dispatched');
    expect(context.calls.slice(0, 3)).toEqual(['schedule:save', 'operation:save', 'create']);
    expect(context.operations.calls).toEqual(['save:planned', 'update:planned->dispatched', 'receipt']);
  });

  test('duplicate schedule ID is rejected without external side effect', async () => {
    const context = deps();
    await createAgentSchedule(context, schedule());
    await expect(createAgentSchedule(context, schedule())).rejects.toThrow(/duplicate|exists/u);
    expect(context.scheduler.creates).toBe(0);
  });

  test('precheck failure persists skipped operation without automation ID', async () => {
    const context = deps();
    await createAgentSchedule(context, schedule());
    const operation = await dispatchAgentSchedule(context, { scheduleId: 'schedule-1', operationId: 'operation-1', manifestHash: 'sha256:manifest', precheck: { ok: false, reason: 'precheck failed' } });
    expect(operation.phase).toBe('skipped');
    expect(operation.automationId).toBeNull();
    expect(context.scheduler.creates).toBe(0);
  });

  test('successful automation creation persists receipt and dispatched, never succeeded', async () => {
    const context = deps();
    await createAgentSchedule(context, schedule());
    const operation = await dispatchAgentSchedule(context, { scheduleId: 'schedule-1', operationId: 'operation-1', manifestHash: 'sha256:manifest' });
    expect(operation.phase).toBe('dispatched');
    expect(operation.automationId).toBe('automation-1');
    expect(operation.phase).not.toBe('succeeded');
    expect(context.operations.calls.at(-1)).toBe('receipt');
  });

  test('scheduler typed failure does not create successful dispatch fact', async () => {
    const context = deps();
    context.scheduler.failure = Object.assign(new Error('scheduler unavailable'), { code: 'unavailable' });
    await createAgentSchedule(context, schedule());
    await expect(dispatchAgentSchedule(context, { scheduleId: 'schedule-1', operationId: 'operation-1', manifestHash: 'sha256:manifest' })).rejects.toThrow('scheduler unavailable');
    expect((await context.operations.findById('operation-1'))?.phase).not.toBe('succeeded');
  });

  test('cancellation is operation-bound, uses exact automation ID, and repeats idempotently', async () => {
    const context = deps();
    await createAgentSchedule(context, schedule());
    await dispatchAgentSchedule(context, { scheduleId: 'schedule-1', operationId: 'operation-1', manifestHash: 'sha256:manifest' });
    const cancelled = await cancelAgentSchedule(context, { scheduleId: 'schedule-1', operationId: 'operation-1' });
    expect(cancelled.phase).toBe('skipped');
    expect(context.scheduler.cancels).toEqual(['automation-1']);
    const repeated = await cancelAgentSchedule(context, { scheduleId: 'schedule-1', operationId: 'operation-1' });
    expect(repeated).toEqual(cancelled);
    expect(context.scheduler.cancels).toEqual(['automation-1']);
    await expect(cancelAgentSchedule(context, { scheduleId: 'schedule-1', operationId: 'other' })).rejects.toThrow(/operation|not found/u);
  });

  test('reconciliation maps outcomes and rejects correlation mismatches', async () => {
    const context = deps();
    const cases = [
      ['schedule-1', 'operation-1', 'succeeded'],
      ['schedule-2', 'operation-2', 'degraded'],
      ['schedule-3', 'operation-3', 'failed'],
    ] as const;
    for (const [scheduleId, operationId, outcome] of cases) {
      await createAgentSchedule(context, schedule(scheduleId));
      await dispatchAgentSchedule(context, { scheduleId, operationId, manifestHash: 'sha256:manifest' });
      const result = await reconcileAgentDispatch(context, { scheduleId, operationId, agentId: AGENT, revisionId: REVISION, target: TARGET, manifestHash: 'sha256:manifest', outcome });
      expect(result.phase).toBe(outcome);
    }
    await createAgentSchedule(context, schedule('schedule-4'));
    await dispatchAgentSchedule(context, { scheduleId: 'schedule-4', operationId: 'operation-4', manifestHash: 'sha256:manifest' });
    const mismatch = (overrides: Partial<ReconcileAgentDispatchInput>) => reconcileAgentDispatch(context, {
      scheduleId: 'schedule-4',
      operationId: 'operation-4',
      agentId: AGENT,
      revisionId: REVISION,
      target: TARGET,
      manifestHash: 'sha256:manifest',
      outcome: 'failed',
      ...overrides,
    });
    await expect(mismatch({ scheduleId: 'wrong' })).rejects.toThrow(/correlation|not found/u);
    await expect(mismatch({ operationId: 'wrong' })).rejects.toThrow(/operation|not found/u);
    await expect(mismatch({ agentId: 'claude-code' })).rejects.toThrow(/correlation/u);
    await expect(mismatch({ revisionId: 'wrong' })).rejects.toThrow(/correlation/u);
    await expect(mismatch({ target: { kind: 'repo', selector: 'other/repo' } })).rejects.toThrow(/correlation/u);
    await expect(mismatch({ manifestHash: 'sha256:other' })).rejects.toThrow(/correlation/u);
  });

  test('unknown or unavailable outcomes remain explicit unknown and never success', async () => {
    const context = deps();
    await createAgentSchedule(context, schedule());
    await dispatchAgentSchedule(context, { scheduleId: 'schedule-1', operationId: 'operation-1', manifestHash: 'sha256:manifest' });
    const unknown = await reconcileAgentDispatch(context, { scheduleId: 'schedule-1', operationId: 'operation-1', agentId: AGENT, revisionId: REVISION, target: TARGET, manifestHash: 'sha256:manifest', outcome: 'not-available', reason: 'Orca unavailable' });
    expect(unknown.phase).toBe('unknown');
    expect(unknown.phase).not.toBe('succeeded');
  });
  test('missing Agent version or required capability evidence fails closed', async () => {
    const unknownVersion = deps();
    unknownVersion.registry.capability = { ...snapshot(), version: { kind: 'unknown', reason: 'version unavailable', observedAt: NOW } };
    await expect(createAgentSchedule(unknownVersion, schedule())).rejects.toThrow(/version|unknown|capability/u);
    expect(unknownVersion.schedules.values.size).toBe(0);

    const missingScheduling = deps();
    missingScheduling.registry.capability = { ...snapshot(), capabilities: {} };
    await expect(createAgentSchedule(missingScheduling, schedule())).rejects.toThrow(/scheduling|capability/u);

    const missingRevisionCapability = deps();
    missingRevisionCapability.configurations.value = { ...revision(), capabilities: [{ kind: 'skill', name: 'review', source: undefined, summary: undefined, sourceRef: undefined, contentFingerprint: undefined }] };
    await expect(createAgentSchedule(missingRevisionCapability, schedule())).rejects.toThrow(/review|capability/u);
  });

  test('receipt provider, target and trigger mismatches fail closed', async () => {
    const mismatches = [
      receipt({ provider: 'claude-code' }),
      receipt({ target: { kind: 'repo', selector: 'other/repo' } }),
      receipt({ trigger: { kind: 'preset', value: 'hourly' } }),
    ] as const;
    for (const receiptValue of mismatches) {
      const context = deps();
      context.scheduler.receiptValue = receiptValue;
      await createAgentSchedule(context, schedule());
      await expect(dispatchAgentSchedule(context, { scheduleId: 'schedule-1', operationId: 'operation-1', manifestHash: 'sha256:manifest' })).rejects.toThrow(/correlation/u);
      expect((await context.operations.findById('operation-1'))?.phase).toBe('unknown');
    }
  });

  test('failure fact persistence errors remain visible with the scheduler error', async () => {
    const context = deps();
    context.scheduler.failure = Object.assign(new Error('scheduler unavailable'), { code: 'unavailable' });
    await createAgentSchedule(context, schedule());
    context.operations.failUpdate = true;
    await expect(dispatchAgentSchedule(context, { scheduleId: 'schedule-1', operationId: 'operation-1', manifestHash: 'sha256:manifest' })).rejects.toBeInstanceOf(AggregateError);
  });
});
