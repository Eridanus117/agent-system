import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { SqliteStore } from '../../src/adapters/sqlite/store';
import { SqliteScheduleRepository } from '../../src/adapters/sqlite/schedule-repository';
import { SqliteDispatchOperationRepository } from '../../src/adapters/sqlite/dispatch-repository';
import { createAgentScheduleIntent, createOrcaAutomationReceipt } from '../../src/domain/schedule';
import { createDispatchOperation, transitionDispatchOperation } from '../../src/domain/dispatch-operation';
import { agentId } from '../../src/domain/agent';

const CREATED_AT = '2026-08-31T00:00:00.000Z';
const TARGET = { kind: 'project' as const, selector: 'agent-systemX', host: 'local' };
const TRIGGER = { kind: 'cron' as const, expression: '0 * * * *' };

function schedule(id = 'schedule-1') {
  return createAgentScheduleIntent({
    scheduleId: id,
    agentId: agentId('omp'),
    revisionId: 'revision-1',
    trigger: TRIGGER,
    target: TARGET,
    sessionPolicy: 'fresh',
    precheckRef: 'evidence://precheck/1',
    sourceContextRef: 'context://schedule/1',
    createdAt: CREATED_AT,
  });
}
function operation(scheduleId = 'schedule-1', operationId = 'operation-1') {
  return createDispatchOperation({ operationId, scheduleId, agentId: agentId('omp'), revisionId: 'revision-1', target: TARGET, manifestHash: 'sha256:manifest', createdAt: CREATED_AT });
}
function receipt() {
  return createOrcaAutomationReceipt({ automationId: 'automation-1', provider: 'orca', target: TARGET, trigger: TRIGGER, createdAt: CREATED_AT, sourceEvidence: 'evidence://orca/automation-1' });
}
function seedRevision(store: SqliteStore): void {
  store.db.exec(`INSERT INTO configuration(config_name) VALUES ('default'); INSERT INTO configuration_revision(revision_id, config_name, schema_version, default_marker_json, scope_boundary_json, availability_json, capabilities_json, trigger_category, evidence_ref, supersedes_revision_id, created_at) VALUES ('revision-1', 'default', 1, '{"kind":"known","value":true}', '{"kind":"known","value":"project"}', '{"kind":"known","value":"resolved"}', '[]', 'new-scenario', 'evidence://revision/1', NULL, '2026-08-31T00:00:00.000Z');`);
}
function seedLegacyCanonicalDatabase(databasePath: string): void {
  const db = new Database(databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE configuration(config_name TEXT PRIMARY KEY) STRICT;
    CREATE TABLE configuration_revision(revision_id TEXT PRIMARY KEY, config_name TEXT NOT NULL REFERENCES configuration(config_name), schema_version INTEGER NOT NULL, default_marker_json TEXT NOT NULL, scope_boundary_json TEXT NOT NULL, availability_json TEXT NOT NULL, capabilities_json TEXT NOT NULL, trigger_category TEXT NOT NULL, evidence_ref TEXT NOT NULL, supersedes_revision_id TEXT REFERENCES configuration_revision(revision_id), created_at TEXT NOT NULL) STRICT;
    CREATE TABLE activation_operation(operation_id TEXT PRIMARY KEY, revision_id TEXT REFERENCES configuration_revision(revision_id), config_name TEXT NOT NULL, client_id TEXT NOT NULL, phase TEXT NOT NULL, version INTEGER NOT NULL, plan_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, terminal_reason TEXT) STRICT;
    CREATE TABLE launch_observation(observation_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL REFERENCES activation_operation(operation_id), client_id TEXT NOT NULL, stage TEXT NOT NULL, outcome TEXT NOT NULL, process_reference_json TEXT, reason TEXT, observed_at TEXT NOT NULL) STRICT;
    INSERT INTO configuration VALUES ('default');
    INSERT INTO configuration_revision VALUES ('legacy-revision', 'default', 1, '{"kind":"known","value":true}', '{"kind":"unknown","reason":"legacy","observedAt":"2026-08-30T00:00:00.000Z"}', '{"kind":"known","value":"resolved"}', '[]', 'new-scenario', 'evidence://legacy/revision', NULL, '2026-08-30T00:00:00.000Z');
    INSERT INTO activation_operation VALUES ('legacy-operation', 'legacy-revision', 'default', 'claude', 'succeeded', 1, 'sha256:legacy', '2026-08-30T00:00:00.000Z', '2026-08-30T00:01:00.000Z', NULL);
    INSERT INTO launch_observation VALUES ('legacy-observation', 'legacy-operation', 'claude', 'outcome-observed', 'succeeded', NULL, NULL, '2026-08-30T00:01:00.000Z');
  `);
  db.close();
}

describe('SQLite agent scheduling persistence', () => {
  test('applies migration version 4 and preserves historical rows under agent_id', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agent-scheduling-'));
    const databasePath = path.join(root, 'legacy.sqlite');
    seedLegacyCanonicalDatabase(databasePath);
    const store = new SqliteStore(databasePath);
    expect(store.manifest.appliedVersions).toEqual([1, 2, 3, 4]);
    expect(store.db.query<{ name: string }, []>('PRAGMA table_info(activation_operation)').all().map((row) => row.name)).toContain('agent_id');
    expect(store.db.query<{ name: string }, []>('PRAGMA table_info(activation_operation)').all().map((row) => row.name)).not.toContain('client_id');
    expect(store.db.query<{ agent_id: string }, [string]>('SELECT agent_id FROM activation_operation WHERE operation_id = ?').get('legacy-operation')?.agent_id).toBe('claude');
    expect(store.db.query<{ agent_id: string }, [string]>('SELECT agent_id FROM launch_observation WHERE observation_id = ?').get('legacy-observation')?.agent_id).toBe('claude');
    store.close();
    rmSync(root, { recursive: true, force: true });
  });

  test('round trips schedules, rejects duplicate IDs, and filters by agent', async () => {
    const store = new SqliteStore(':memory:');
    seedRevision(store);
    const repository = new SqliteScheduleRepository(store);
    await repository.save(schedule());
    expect(await repository.findById('schedule-1')).toEqual(schedule());
    expect(await repository.listByAgent(agentId('omp'))).toEqual([schedule()]);
    await expect(repository.save(schedule())).rejects.toThrow();
    await expect(repository.save(schedule('schedule-2'))).resolves.toBeUndefined();
    store.close();
  });

  test('enforces schedule foreign key and rejects raw fields', async () => {
    const store = new SqliteStore(':memory:');
    seedRevision(store);
    const schedules = new SqliteScheduleRepository(store);
    const dispatches = new SqliteDispatchOperationRepository(store);
    await expect(dispatches.save(operation())).rejects.toThrow();
    await schedules.save(schedule());
    await expect(schedules.save({ ...schedule('schedule-raw'), sourceContextRef: 'prompt://secret' } as never)).rejects.toThrow();
    await expect(schedules.save({ ...schedule('schedule-task'), target: { kind: 'project', selector: 'repo', task: 'raw' } } as never)).rejects.toThrow();
    store.close();
  });

  test('updates phase only for expected phase and version, failing stale and duplicate updates closed', async () => {
    const store = new SqliteStore(':memory:');
    seedRevision(store);
    const schedules = new SqliteScheduleRepository(store);
    const repository = new SqliteDispatchOperationRepository(store);
    await schedules.save(schedule());
    const planned = operation();
    await repository.save(planned);
    const dispatchedResult = transitionDispatchOperation(planned, { type: 'dispatched', automationId: 'automation-1' });
    if (!dispatchedResult.ok) throw new Error(dispatchedResult.reason);
    await repository.updatePhase(planned.operationId, 'planned', dispatchedResult.operation);
    await expect(repository.updatePhase(planned.operationId, 'planned', dispatchedResult.operation)).rejects.toThrow();
    const observingResult = transitionDispatchOperation(dispatchedResult.operation, { type: 'observing' });
    if (!observingResult.ok) throw new Error(observingResult.reason);
    await expect(repository.updatePhase(planned.operationId, 'planned', observingResult.operation)).rejects.toThrow();
    await repository.updatePhase(planned.operationId, 'dispatched', observingResult.operation);
    store.close();
  });

  test('imports matching receipts idempotently, preserves unknown evidence, and rejects correlation mismatch', async () => {
    const store = new SqliteStore(':memory:');
    seedRevision(store);
    const schedules = new SqliteScheduleRepository(store);
    const repository = new SqliteDispatchOperationRepository(store);
    await schedules.save(schedule());
    const planned = operation();
    await repository.save(planned);
    const dispatchedResult = transitionDispatchOperation(planned, { type: 'dispatched', automationId: 'automation-1' });
    if (!dispatchedResult.ok) throw new Error(dispatchedResult.reason);
    await repository.updatePhase(planned.operationId, planned.phase, dispatchedResult.operation);
    await repository.appendReceipt(planned.operationId, receipt());
    await repository.appendReceipt(planned.operationId, receipt());
    const row = store.db.query<{ receipt_source_evidence: string; receipt_provider: string }, [string]>('SELECT receipt_source_evidence, receipt_provider FROM dispatch_operation WHERE operation_id = ?').get(planned.operationId);
    expect(row).toEqual({ receipt_source_evidence: 'evidence://orca/automation-1', receipt_provider: 'orca' });
    const unknown = transitionDispatchOperation(dispatchedResult.operation, { type: 'observing' });
    if (!unknown.ok) throw new Error(unknown.reason);
    const unknownTerminal = transitionDispatchOperation(unknown.operation, { type: 'unknown', reason: 'provider omitted outcome' });
    if (!unknownTerminal.ok) throw new Error(unknownTerminal.reason);
    await repository.updatePhase(planned.operationId, 'dispatched', unknown.operation);
    await repository.updatePhase(planned.operationId, 'observing', unknownTerminal.operation);
    expect((await repository.findById(planned.operationId))?.terminalReason).toBe('provider omitted outcome');
    await expect(repository.appendReceipt(planned.operationId, { ...receipt(), automationId: 'automation-2' })).rejects.toThrow();
    store.close();
  });

  test('does not project prompt, task, credentials, or transcript columns', () => {
    const store = new SqliteStore(':memory:');
    for (const table of ['agent_schedule', 'dispatch_operation']) {
      const columns = store.db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().map((row) => row.name);
      expect(columns.some((column) => /prompt|task|credential|transcript/i.test(column))).toBe(false);
    }
    expect(store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM sqlite_master WHERE sql LIKE '%SELECT *%'").get()?.count).toBe(0);
    store.close();
  });
});
