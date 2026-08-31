import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { SqliteStore } from '../../src/adapters/sqlite/store';
import { SqliteConfigRevisionRepository } from '../../src/adapters/sqlite/repository';
import os from 'node:os';
import path from 'node:path';

import { main, type CliOverrides } from '../../src/cli/index';
import { agentId, type AgentCapabilitySnapshot, type AgentDescriptor, type AgentId } from '../../src/domain/agent';
import type { AgentRegistry } from '../../src/application/ports/agent-registry';
import type { AgentSchedulerPort } from '../../src/application/ports/scheduler';
import type { AgentScheduleRepository } from '../../src/application/ports/schedule-repository';
import type { DispatchOperationRepository } from '../../src/application/ports/dispatch-repository';
import type { ConfigurationRepository } from '../../src/application/ports/configuration-repository';
import type { ConfigurationRevision } from '../../src/domain/configuration';
import { configurationName, configurationRevisionId } from '../../src/domain/configuration';
import type { AgentScheduleIntent, OrcaAutomationReceipt } from '../../src/domain/schedule';
import type { DispatchOperation } from '../../src/domain/dispatch-operation';

const now = '2026-08-31T00:00:00.000Z';

function descriptor(id: string, sourceEvidence: string): AgentDescriptor {
  return { id: agentId(id), displayName: id.toUpperCase(), provider: id, sourceEvidence };
}
function snapshot(id: string, level: AgentCapabilitySnapshot['level'], version: AgentCapabilitySnapshot['version'] = { kind: 'known', value: '1.0.0' }): AgentCapabilitySnapshot {
  return { probeId: `${id}-probe`, agentId: agentId(id), level, version, capabilities: { scheduling: level }, observedAt: now, evidenceRef: `evidence://agents/${id}` };
}
function revision(): ConfigurationRevision {
  return {
    configName: configurationName('demo'), revisionId: configurationRevisionId('rev-1'), schemaVersion: 1,
    defaultMarker: { kind: 'known', value: false }, scopeBoundary: { kind: 'known', value: 'project' },
    availability: { kind: 'known', value: 'resolved' }, capabilities: [], createdAt: now,
    triggerCategory: 'new-scenario', evidenceRef: 'evidence://revisions/rev-1', supersedesRevisionId: null,
  };
}

class FakeRegistry implements AgentRegistry {
  constructor(readonly descriptors: readonly AgentDescriptor[], readonly snapshots: ReadonlyMap<string, AgentCapabilitySnapshot>) {}
  async list(): Promise<readonly AgentDescriptor[]> { return this.descriptors; }
  async get(id: AgentId): Promise<AgentDescriptor | null> { return this.descriptors.find((item) => item.id === id) ?? null; }
  async probe(id: AgentId): Promise<AgentCapabilitySnapshot> {
    return this.snapshots.get(id) ?? snapshot(id as string, 'unknown', { kind: 'unknown', reason: 'not-probed', observedAt: now });
  }
  adapter(): null { return null; }
}
class FakeConfigurations implements ConfigurationRepository {
  constructor(private readonly value: ConfigurationRevision | null = revision()) {}
  async listAll(): Promise<readonly ConfigurationRevision[]> { return this.value === null ? [] : [this.value]; }
  async findById(id: string): Promise<ConfigurationRevision | null> { return id === this.value?.revisionId ? this.value : null; }
  async search(): Promise<readonly never[]> { return []; }
  async rebuild(): Promise<void> {}
}

class FakeSchedules implements AgentScheduleRepository {
  readonly values = new Map<string, AgentScheduleIntent>();
  saves = 0;
  async save(value: AgentScheduleIntent): Promise<void> { this.saves += 1; this.values.set(value.scheduleId, value); }
  async findById(id: string): Promise<AgentScheduleIntent | null> { return this.values.get(id) ?? null; }
  async listByAgent(id: AgentId): Promise<readonly AgentScheduleIntent[]> { return [...this.values.values()].filter((value) => value.agentId === id); }
}

class FakeOperations implements DispatchOperationRepository {
  readonly values = new Map<string, DispatchOperation>();
  saves = 0;
  updates = 0;
  receipts = 0;
  async save(value: DispatchOperation): Promise<void> { this.saves += 1; this.values.set(value.operationId, value); }
  async findById(id: string): Promise<DispatchOperation | null> { return this.values.get(id) ?? null; }
  async listByAgent(id: AgentId): Promise<readonly DispatchOperation[]> { return [...this.values.values()].filter((value) => value.agentId === id); }
  async updatePhase(id: string, _expected: DispatchOperation['phase'], next: DispatchOperation): Promise<void> { this.updates += 1; this.values.set(id, next); }
  async appendReceipt(): Promise<void> { this.receipts += 1; }
}

class FakeScheduler implements AgentSchedulerPort {
  creates = 0;
  readonly cancellations: string[] = [];
  failure: Error | null = null;
  async create(): Promise<OrcaAutomationReceipt> { this.creates += 1; throw new Error('raw scheduler secret stderr'); }
  async cancel(id: string): Promise<void> { if (this.failure !== null) throw this.failure; this.cancellations.push(id); }
}

let tempRoot: string | undefined;
let originalLog: typeof console.log;
let originalError: typeof console.error;
let logs: string[];
let errors: string[];

function makeOverrides(
  registry: AgentRegistry,
  scheduler: AgentSchedulerPort,
  schedules: FakeSchedules,
  operations: FakeOperations,
  configurations: ConfigurationRepository = new FakeConfigurations(),
): CliOverrides {
  return {
    databasePath: path.join(tempRoot!, 'control-plane.sqlite3'),
    configurations: configurations as CliOverrides['configurations'], registry, scheduler, schedules, dispatches: operations,
    now: () => now,
  };
}

async function run(argv: readonly string[], overrides: CliOverrides): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> {
  logs = [];
  errors = [];
  console.log = (...args: unknown[]) => logs.push(args.join(' '));
  console.error = (...args: unknown[]) => errors.push(args.join(' '));
  try { return { code: await main(argv, overrides), stdout: logs.join('\n'), stderr: errors.join('\n') }; }
  finally { console.log = originalLog; console.error = originalError; }
}

function parse(output: string): Record<string, unknown> { return JSON.parse(output) as Record<string, unknown>; }

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'control-plane-agent-scheduling-cli-'));
  originalLog = console.log;
  originalError = console.error;
});
afterEach(async () => {
  if (tempRoot !== undefined) await rm(tempRoot, { recursive: true, force: true });
  tempRoot = undefined;
});

describe('agent scheduling CLI', () => {
  test('agents list distinguishes known, unknown and unsupported without upgrading unknown inventory', async () => {
    const registry = new FakeRegistry(
      [descriptor('omp', 'evidence://inventory/omp'), descriptor('hermes', 'unknown:inventory'), descriptor('claude-code', 'evidence://inventory/claude')],
      new Map([['omp', snapshot('omp', 'supported')], ['hermes', snapshot('hermes', 'supported')], ['claude-code', snapshot('claude-code', 'unsupported')]]),
    );
    const result = await run(['agents', 'list'], makeOverrides(registry, new FakeScheduler(), new FakeSchedules(), new FakeOperations()));
    expect(result.code).toBe(0);
    expect(parse(result.stdout)).toEqual(expect.objectContaining({ agents: expect.arrayContaining([
      expect.objectContaining({ id: 'omp', level: 'supported' }),
      expect.objectContaining({ id: 'hermes', level: 'unknown' }),
      expect.objectContaining({ id: 'claude-code', level: 'unsupported' }),
    ]) }));
    expect(existsSync(path.join(tempRoot!, 'control-plane.sqlite3'))).toBe(false);
  });

  test('agents probe returns allowlisted JSON and unknown agent is a contained failure', async () => {
    const registry = new FakeRegistry([descriptor('omp', 'evidence://inventory/omp')], new Map([['omp', snapshot('omp', 'supported')]]));
    const overrides = makeOverrides(registry, new FakeScheduler(), new FakeSchedules(), new FakeOperations());
    const success = await run(['agents', 'probe', 'omp'], overrides);
    expect(success.code).toBe(0);
    expect(parse(success.stdout)).toEqual(expect.objectContaining({ agent: expect.objectContaining({ id: 'omp', evidenceRef: 'evidence://agents/omp' }) }));
    const failure = await run(['agents', 'probe', 'missing'], overrides);
    expect(failure.code).toBe(1);
    expect(failure.stderr).toContain('agent-not-found');
    expect(failure.stderr).not.toContain('raw');
  });

  test('projections strictly redact uncontrolled evidence, target, trigger and terminal values', async () => {
    const registry = new FakeRegistry(
      [{ id: agentId('omp'), displayName: 'safe', provider: 'credentials://provider-secret', sourceEvidence: 'transcript://private' }],
      new Map([['omp', { ...snapshot('omp', 'supported'), probeId: 'transcript://probe-secret', capabilities: { scheduling: 'supported', credentials: 'supported', prompt: 'supported', transcript: 'supported' }, evidenceRef: 'credentials://agent-secret', version: { kind: 'known', value: 'prompt=hidden' } }]]),
    );
    const result = await run(['agents', 'probe', 'omp'], makeOverrides(registry, new FakeScheduler(), new FakeSchedules(), new FakeOperations()));
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain('credentials://');
    expect(result.stdout).not.toContain('transcript://');
    expect(result.stdout).not.toContain('prompt=');
    const dryRun = await run(['schedule', 'create', '--schedule-id', 'safe', '--agent', 'omp', '--revision', 'rev-1', '--trigger', 'preset:hourly', '--target', 'repo:src', '--session-policy', 'fresh', '--dry-run'], makeOverrides(registry, new FakeScheduler(), new FakeSchedules(), new FakeOperations(), new FakeConfigurations({ ...revision(), evidenceRef: 'credentials://revision-secret' })));
    expect(dryRun.code).toBe(0);
    expect(dryRun.stdout).not.toContain('credentials://');
    expect(dryRun.stdout).not.toContain('transcript://');
    expect(dryRun.stdout).not.toContain('prompt=');
  });

  test('schedule dry-run normalizes every trigger and target kind without persistence or Orca calls', async () => {
    const registry = new FakeRegistry([descriptor('omp', 'evidence://inventory/omp')], new Map([['omp', snapshot('omp', 'supported')]]));
    const scheduler = new FakeScheduler();
    const schedules = new FakeSchedules();
    const operations = new FakeOperations();
    const overrides = makeOverrides(registry, scheduler, schedules, operations);
    const cases = [
      { trigger: 'preset:hourly', target: 'repo:src', policy: 'fresh', scheduleId: 'schedule-hourly', triggerArg: 'hourly', targetArgs: ['--repo', 'src'] },
      { trigger: 'cron:0 9 * * 1', target: 'workspace:dev', policy: 'reuse', scheduleId: 'schedule-cron', triggerArg: '0 9 * * 1', targetArgs: ['--workspace', 'dev'] },
      { trigger: 'rrule:FREQ=DAILY', target: 'project:demo', policy: 'fresh', scheduleId: 'schedule-rrule', triggerArg: 'FREQ=DAILY', targetArgs: ['--project', 'demo'] },
      { trigger: 'preset:weekly', target: 'runtime:local', policy: 'reuse', scheduleId: 'schedule-runtime', triggerArg: 'weekly', targetArgs: ['--host', 'local'] },
    ] as const;
    for (const item of cases) {
      const result = await run(['schedule', 'create', '--schedule-id', item.scheduleId, '--agent', 'omp', '--revision', 'rev-1', '--trigger', item.trigger, '--target', item.target, '--session-policy', item.policy, '--dry-run'], overrides);
      expect(result.code).toBe(0);
      const output = parse(result.stdout);
      expect(output.externalCall).toBe(false);
      const schedule = output.schedule as Record<string, unknown>;
      expect(schedule.trigger).toEqual(item.trigger.startsWith('preset:') ? { kind: 'preset', value: item.trigger.slice(7) } : item.trigger.startsWith('cron:') ? { kind: 'cron', expression: item.trigger.slice(5) } : { kind: 'rrule', value: item.trigger.slice(6) });
      expect(schedule.target).toEqual({ kind: item.target.split(':', 1)[0], selector: item.target.slice(item.target.indexOf(':') + 1) });
      expect(schedule.sessionPolicy).toBe(item.policy);
      const expectedArgv = ['orca', 'automations', 'create', '--name', item.scheduleId, '--trigger', item.triggerArg, '--provider', 'omp', ...item.targetArgs, item.policy === 'fresh' ? '--fresh-session' : '--reuse-session', '--json'];
      expect(output.argv).toEqual(expectedArgv);
      expect(output.spec).toEqual({ argv: expectedArgv });
    }
    expect(scheduler.creates).toBe(0);
    expect(schedules.saves).toBe(0);
    expect(existsSync(path.join(tempRoot!, 'control-plane.sqlite3'))).toBe(false);
    expect(operations.saves).toBe(0);
  });

  test('dry-run rejects malformed flags and unavailable evidence before external calls', async () => {
    const registry = new FakeRegistry([descriptor('omp', 'evidence://inventory/omp')], new Map([['omp', snapshot('omp', 'unknown')]]));
    const scheduler = new FakeScheduler();
    const overrides = makeOverrides(registry, scheduler, new FakeSchedules(), new FakeOperations());
    const cases: readonly (readonly string[])[] = [
      ['--agent', 'omp', '--revision', 'rev-1', '--trigger', 'bad:value', '--target', 'repo:x', '--session-policy', 'fresh', '--dry-run'],
      ['--agent', 'omp', '--revision', 'rev-1', '--trigger', 'preset:hourly', '--target', 'bad:value', '--session-policy', 'fresh', '--dry-run'],
      ['--agent', 'omp', '--revision', 'missing', '--trigger', 'preset:hourly', '--target', 'repo:x', '--session-policy', 'fresh', '--dry-run'],
      ['--agent', 'missing', '--revision', 'rev-1', '--trigger', 'preset:hourly', '--target', 'repo:x', '--session-policy', 'fresh', '--dry-run'],
    ];
    for (const args of cases) {
      const result = await run(['schedule', 'create', ...args], overrides);
      expect(result.code).toBe(1);
      expect(result.stderr).not.toContain('secret');
    }
    expect(scheduler.creates).toBe(0);
    expect(existsSync(path.join(tempRoot!, 'control-plane.sqlite3'))).toBe(false);
  });

  test('non-dry-run create refuses without yes and never creates automation', async () => {
    const scheduler = new FakeScheduler();
    const result = await run(['schedule', 'create', '--agent', 'omp', '--revision', 'rev-1', '--trigger', 'preset:hourly', '--target', 'repo:x', '--session-policy', 'fresh'], makeOverrides(new FakeRegistry([descriptor('omp', 'evidence://inventory/omp')], new Map([['omp', snapshot('omp', 'supported')]])), scheduler, new FakeSchedules(), new FakeOperations()));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('confirmation-required');
    expect(scheduler.creates).toBe(0);
  });
  test('dry-run rejects unsafe trigger and target values before argv projection', async () => {
    const overrides = makeOverrides(new FakeRegistry([descriptor('omp', 'evidence://inventory/omp')], new Map([['omp', snapshot('omp', 'supported')]])), new FakeScheduler(), new FakeSchedules(), new FakeOperations());
    const cases = [
      { trigger: 'cron:0 9 credentials://private', target: 'repo:src', code: 'invalid-trigger' },
      { trigger: 'rrule:FREQ=DAILY;prompt=secret', target: 'repo:src', code: 'invalid-trigger' },
      { trigger: 'preset:hourly', target: 'repo:credentials://private', code: 'invalid-target' },
    ] as const;
    for (const item of cases) {
      const result = await run(['schedule', 'create', '--agent', 'omp', '--revision', 'rev-1', '--trigger', item.trigger, '--target', item.target, '--session-policy', 'fresh', '--dry-run'], overrides);
      expect(result.code).toBe(1);
      expect(result.stderr).toBe(`schedule error: ${item.code}`);
      expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/credentials|prompt|transcript|task/i);
    }
  });

  test('schedule show projects persisted unknown and incomplete operation states', async () => {
    const schedules = new FakeSchedules();
    const operations = new FakeOperations();
    schedules.values.set('schedule-1', {
      scheduleId: 'schedule-1', agentId: agentId('omp'), revisionId: 'rev-1', trigger: { kind: 'preset', value: 'hourly' },
      target: { kind: 'repo', selector: 'src' }, sessionPolicy: 'fresh', precheckRef: null, sourceContextRef: null, createdAt: now,
    });
    Object.assign(schedules.values.get('schedule-1')!.trigger, { prompt: 'secret task' });
    Object.assign(schedules.values.get('schedule-1')!.target, { credential: 'secret' });
    operations.values.set('operation-schedule-1', {
      operationId: 'operation-schedule-1', scheduleId: 'schedule-1', agentId: agentId('omp'), revisionId: 'rev-1', target: { kind: 'repo', selector: 'src' },
      phase: 'unknown', automationId: null, manifestHash: 'hash', createdAt: now, updatedAt: now, terminalReason: 'unknown:provider', version: 1,
    });
    Object.assign(operations.values.get('operation-schedule-1')!.target, { transcript: 'private' });
    const result = await run(['schedule', 'show', 'schedule-1'], makeOverrides(new FakeRegistry([descriptor('omp', 'evidence://inventory/omp')], new Map()), new FakeScheduler(), schedules, operations));
    const output = parse(result.stdout);
    expect(Object.keys(output)).toEqual(['schedule', 'operation', 'evidence', 'timestamps']);
    expect(Object.keys(output.schedule as object)).toEqual(['scheduleId', 'agentId', 'revisionId', 'trigger', 'target', 'sessionPolicy', 'precheckRef', 'sourceContextRef', 'createdAt']);
    expect(Object.keys(output.operation as object)).toEqual(['operationId', 'scheduleId', 'agentId', 'revisionId', 'target', 'phase', 'automationId', 'manifestHash', 'terminalReason', 'createdAt', 'updatedAt']);
    expect((output.operation as Record<string, unknown>).phase).toBe('unknown');
    expect(JSON.stringify(output)).not.toMatch(/prompt|task|credential|transcript|environment/i);
  });
  test('default dry-run opens an isolated readonly snapshot without mutating database sidecars', async () => {
    const databasePath = path.join(tempRoot!, 'readonly-existing.sqlite3');
    const seeded = new SqliteStore(databasePath);
    new SqliteConfigRevisionRepository(seeded).seed([revision()]);
    seeded.close();
    const paths = ['', '-wal', '-shm'].map((suffix) => `${databasePath}${suffix}`);
    const before = paths.map((filePath) => existsSync(filePath) ? readFileSync(filePath) : null);
    const registry = new FakeRegistry([descriptor('omp', 'evidence://inventory/omp')], new Map([['omp', snapshot('omp', 'supported')]]));
    const success = await run(['schedule', 'create', '--agent', 'omp', '--revision', 'rev-1', '--trigger', 'preset:hourly', '--target', 'repo:src', '--session-policy', 'fresh', '--dry-run'], { databasePath, registry, now: () => now });
    expect(success.code).toBe(0);
    expect(parse(success.stdout).externalCall).toBe(false);
    const result = await run(['schedule', 'create', '--agent', 'omp', '--revision', 'rev-1', '--trigger', 'bad:value', '--target', 'repo:src', '--session-policy', 'fresh', '--dry-run'], { databasePath, registry, now: () => now });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe('schedule error: invalid-trigger');
    for (const [index, filePath] of paths.entries()) {
      expect(existsSync(filePath)).toBe(before[index] !== null);
      if (before[index] !== null) expect(readFileSync(filePath).equals(before[index]!)).toBe(true);
    }
  });

  test('default dry-run missing database returns a stable error instead of throwing', async () => {
    const databasePath = path.join(tempRoot!, 'readonly-missing.sqlite3');
    const result = await run(['schedule', 'create', '--agent', 'omp', '--revision', 'rev-1', '--trigger', 'preset:hourly', '--target', 'repo:src', '--session-policy', 'fresh', '--dry-run'], { databasePath, now: () => now });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe('schedule error: scheduler-failure');
    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(`${databasePath}-wal`)).toBe(false);
    expect(existsSync(`${databasePath}-shm`)).toBe(false);
  });

  test('schedule cancel requires yes, uses exact automation id and is idempotent', async () => {
    const schedules = new FakeSchedules();
    const operations = new FakeOperations();
    schedules.values.set('schedule-1', {
      scheduleId: 'schedule-1', agentId: agentId('omp'), revisionId: 'rev-1', trigger: { kind: 'preset', value: 'hourly' }, target: { kind: 'repo', selector: 'src' },
      sessionPolicy: 'fresh', precheckRef: null, sourceContextRef: null, createdAt: now,
    });
    operations.values.set('operation-schedule-1', {
      operationId: 'operation-schedule-1', scheduleId: 'schedule-1', agentId: agentId('omp'), revisionId: 'rev-1', target: { kind: 'repo', selector: 'src' }, phase: 'dispatched', automationId: 'automation-exact', manifestHash: 'hash', createdAt: now, updatedAt: now, terminalReason: null, version: 1,
    });
    const scheduler = new FakeScheduler();
    const overrides = makeOverrides(new FakeRegistry([descriptor('omp', 'evidence://inventory/omp')], new Map()), scheduler, schedules, operations);
    expect((await run(['schedule', 'cancel', 'schedule-1'], overrides)).code).toBe(1);
    const cancelled = await run(['schedule', 'cancel', 'schedule-1', '--yes'], overrides);
    expect(cancelled.code).toBe(0);
    const output = parse(cancelled.stdout);
    expect(Object.keys(output)).toEqual(['schedule', 'operation', 'evidence', 'timestamps']);
    expect((output.operation as Record<string, unknown>).phase).toBe('skipped');
    expect((output.operation as Record<string, unknown>).automationId).toBe(null);
    expect(JSON.stringify(output)).not.toMatch(/prompt|task|credential|transcript|environment/i);
    const repeated = await run(['schedule', 'cancel', 'schedule-1', '--yes'], overrides);
    expect(repeated.code).toBe(0);
    expect(Object.keys(parse(repeated.stdout))).toEqual(['schedule', 'operation', 'evidence', 'timestamps']);
    expect(scheduler.cancellations).toEqual(['automation-exact']);
  });

  test('scheduler failure is a stable contained error without sensitive leakage', async () => {
    const schedules = new FakeSchedules();
    const operations = new FakeOperations();
    schedules.values.set('schedule-1', { scheduleId: 'schedule-1', agentId: agentId('omp'), revisionId: 'rev-1', trigger: { kind: 'preset', value: 'hourly' }, target: { kind: 'repo', selector: 'src' }, sessionPolicy: 'fresh', precheckRef: null, sourceContextRef: null, createdAt: now });
    operations.values.set('operation-schedule-1', { operationId: 'operation-schedule-1', scheduleId: 'schedule-1', agentId: agentId('omp'), revisionId: 'rev-1', target: { kind: 'repo', selector: 'src' }, phase: 'dispatched', automationId: 'automation-exact', manifestHash: 'hash', createdAt: now, updatedAt: now, terminalReason: null, version: 1 });
    const scheduler = new FakeScheduler();
    scheduler.failure = new Error('credential=secret prompt=hidden transcript=private');
    const result = await run(['schedule', 'cancel', 'schedule-1', '--yes'], makeOverrides(new FakeRegistry([descriptor('omp', 'evidence://inventory/omp')], new Map()), scheduler, schedules, operations));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('scheduler-failure');
    expect(result.stderr).not.toContain('secret');
    expect(result.stderr).not.toContain('prompt');
    expect(result.stderr).not.toContain('transcript');
  });

  test('successful new commands expose stable JSON key sets', async () => {
    const registry = new FakeRegistry([descriptor('omp', 'evidence://inventory/omp')], new Map([['omp', snapshot('omp', 'supported')]]));
    const overrides = makeOverrides(registry, new FakeScheduler(), new FakeSchedules(), new FakeOperations());
    const list = parse((await run(['agents', 'list'], overrides)).stdout);
    const probe = parse((await run(['agents', 'probe', 'omp'], overrides)).stdout);
    const dry = parse((await run(['schedule', 'create', '--agent', 'omp', '--revision', 'rev-1', '--trigger', 'preset:hourly', '--target', 'repo:x', '--session-policy', 'fresh', '--dry-run'], overrides)).stdout);
    expect(Object.keys(list)).toEqual(['agents']);
    expect(Object.keys(probe)).toEqual(['agent']);
    expect(Object.keys(dry)).toEqual(['schedule', 'manifest', 'argv', 'spec', 'externalCall', 'evidence', 'timestamps']);
    expect(Object.keys((probe.agent as Record<string, unknown>))).toEqual(['id', 'displayName', 'provider', 'level', 'version', 'capabilities', 'evidenceRef', 'observedAt']);
    expect(Object.keys((dry.schedule as Record<string, unknown>))).toEqual(['scheduleId', 'agentId', 'revisionId', 'trigger', 'target', 'sessionPolicy', 'precheckRef', 'sourceContextRef', 'createdAt']);
    expect(Object.keys((dry.evidence as Record<string, unknown>))).toEqual(['agent', 'revision']);
    expect(JSON.stringify({ list, probe, dry })).not.toMatch(/prompt|task|credential|transcript|environment/i);
    const help = await run(['schedule', 'create', '--help'], overrides);
    expect(help.code).toBe(0);
    expect(existsSync(path.join(tempRoot!, 'control-plane.sqlite3'))).toBe(false);
  });
});
