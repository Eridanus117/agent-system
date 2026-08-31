import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { defaultDbPath } from '../../src/cli/db-path';
import { SqliteStore } from '../../src/adapters/sqlite/store';
import { SqliteConfigRevisionWriter } from '../../src/adapters/sqlite/config-revision-writer';
import { SqliteActivationOperationRepository } from '../../src/adapters/sqlite/activation-operation-repository';
import { SqliteLaunchObservationRepository } from '../../src/adapters/sqlite/launch-observation-repository';
import { agentId } from '../../src/domain/agent';
import { configurationName, configurationRevisionId } from '../../src/domain/configuration';
import { createActivationOperation } from '../../src/domain/activation-operation';
import { createLaunchObservation } from '../../src/domain/launch-observation';
import { ConcurrencyConflictError, InvalidActivationTransitionError } from '../../src/domain/errors';

function tempDb(): string { return path.join(mkdtempSync(path.join(process.env.TEMP ?? process.cwd(), 'control-plane-contract-')), 'control-plane.sqlite3'); }
function candidate(configName: string) { return { configName, defaultMarker: { kind: 'known' as const, value: true }, scopeBoundary: { kind: 'known' as const, value: 'project' }, availability: { kind: 'known' as const, value: 'resolved' as const }, capabilities: [{ kind: 'skill' as const, name: 'review', source: 'project-capability' as const, summary: 'review source', sourceRef: undefined, contentFingerprint: undefined }] }; }

describe('sqlite store contract', () => {
  test('applies ordered migrations with checksums and persists CAS operations', async () => {
    const dbPath = tempDb();
    const store = new SqliteStore(dbPath);
    expect(store.manifest.appliedVersions).toEqual([1, 2, 3, 4]);
    expect(store.manifest.validation).toEqual({ foreignKeys: true, projectionConsistent: true });
    const revision = await new SqliteConfigRevisionWriter(store).create({ triggerCategory: 'new-scenario', evidenceRef: 'contract', candidate: candidate('default'), supersedesRevisionId: null });
    const operations = new SqliteActivationOperationRepository(store);
    const operation = createActivationOperation({ operationId: 'op-1', revisionId: revision.revisionId, configName: revision.configName, agentId: agentId('omp'), planHash: 'hash', createdAt: revision.createdAt });
    await operations.insert(operation);
    const next = { ...operation, phase: 'awaiting-confirmation' as const, version: 1, updatedAt: revision.createdAt };
    await operations.updateIfVersion(operation.operationId, 0, next);
    await expect(operations.updateIfVersion(operation.operationId, 0, operation)).rejects.toBeInstanceOf(ConcurrencyConflictError);
    const observations = new SqliteLaunchObservationRepository(store);
    await observations.append(createLaunchObservation({ operationId: operation.operationId, agentId: agentId('omp'), stage: 'process-started', outcome: 'unknown', processReference: undefined, reason: undefined, observedAt: revision.createdAt }));
    expect((await observations.listByOperation(operation.operationId)).length).toBe(1);
    expect(store.db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM schema_migrations').get()?.count).toBe(4);
    await expect(operations.updateIfVersion(operation.operationId, 1, { ...next, phase: 'succeeded', version: 2 })).rejects.toBeInstanceOf(InvalidActivationTransitionError);
    store.close();
    const reopened = new SqliteStore(dbPath);
    expect(reopened.manifest.appliedVersions).toEqual([1, 2, 3, 4]);
    expect(reopened.manifest.legacyBootstrap).toBe(false);
    reopened.close();
  });
  test('fails closed when schema history skips a migration', () => {
    const dbPath = tempDb();
    const db = new Database(dbPath);
    db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT");
    db.query('INSERT INTO schema_migrations VALUES (?, ?, ?, ?)').run(2, 'legacy', 'checksum', '2026-08-29T00:00:00.000Z');
    db.close();
    expect(() => new SqliteStore(dbPath)).toThrow(/missing prerequisite schema migration/);
  });

  test('preserves legacy inventory, launch rows, known data, and unresolved references', () => {
    const dbPath = tempDb();
    const legacy = new Database(dbPath);
    legacy.exec(`CREATE TABLE stable_config (config_name TEXT PRIMARY KEY); CREATE TABLE stable_config_revision (revision_id TEXT PRIMARY KEY, config_name TEXT, schema_version INTEGER, default_marker_status TEXT, default_marker_value TEXT, default_marker_reason TEXT, default_marker_observed_at TEXT, scope_boundary_status TEXT, scope_boundary_value TEXT, scope_boundary_reason TEXT, scope_boundary_observed_at TEXT, availability_status TEXT, availability_value TEXT, availability_reason TEXT, availability_observed_at TEXT, instructions_json TEXT, skills_json TEXT, mcp_json TEXT, hooks_json TEXT, plugins_json TEXT, created_at TEXT, trigger_category TEXT, evidence_ref TEXT, supersedes_revision_id TEXT); CREATE TABLE launch_plan (operation_id TEXT, revision_id TEXT, config_name TEXT, client TEXT, phase TEXT, plan_hash TEXT, created_at TEXT, observed_outcome_status TEXT, observed_outcome_value TEXT, observed_outcome_reason TEXT, observed_outcome_observed_at TEXT); CREATE TABLE deployment_status (id TEXT);`);
    legacy.query('INSERT INTO stable_config(config_name) VALUES (?)').run('default');
    legacy.query('INSERT INTO stable_config_revision VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('rev-legacy', 'default', 1, 'known', 'true', null, '2026-08-29T00:00:00.000Z', 'known', 'project', null, '2026-08-29T00:00:00.000Z', 'known', 'resolved', null, '2026-08-29T00:00:00.000Z', '[{"name":"base"}]', '[{"name":"review"}]', '[]', '[]', '[]', '2026-08-29T00:00:00.000Z', 'new-scenario', 'legacy-evidence', null);
    legacy.query('INSERT INTO launch_plan VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('legacy-op', 'missing-revision', 'default', 'omp', 'observing', 'legacy-hash', '2026-08-29T00:00:00.000Z', 'unknown', null, null, null);
    legacy.close();
    const store = new SqliteStore(dbPath);
    expect(store.manifest.legacyBootstrap).toBe(true);
    expect(store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM legacy_schema_inventory WHERE table_name = 'deployment_status'").get()?.count).toBe(1);
    expect(store.db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM legacy_launch_plan').get()?.count).toBe(1);
    expect(store.db.query<{ phase: string; revision_id: string | null; terminal_reason: string | null }, []>("SELECT phase, revision_id, terminal_reason FROM activation_operation WHERE operation_id = 'legacy-op'").get()).toEqual({ phase: 'applying', revision_id: null, terminal_reason: 'unresolved legacy operation: revision could not be associated' });
    const capabilities = JSON.parse(store.db.query<{ capabilities_json: string }, []>("SELECT capabilities_json FROM configuration_revision WHERE revision_id = 'rev-legacy'").get()!.capabilities_json) as Array<{ kind: string; name: string }>;
    expect(capabilities.map((item) => `${item.kind}:${item.name}`)).toEqual(['instruction:base', 'skill:review']);
    store.close();
  });

  test('normalizes malformed legacy facts and preserves orphan and duplicate rows', () => {
    const dbPath = tempDb();
    const legacy = new Database(dbPath);
    legacy.exec(`CREATE TABLE deployment_status (id TEXT); CREATE TABLE stable_config_revision (revision_id TEXT PRIMARY KEY, config_name TEXT, schema_version TEXT, default_marker_status TEXT, default_marker_value TEXT, scope_boundary_status TEXT, scope_boundary_value TEXT, availability_status TEXT, availability_value TEXT, created_at TEXT, trigger_category TEXT, evidence_ref TEXT, supersedes_revision_id TEXT); CREATE TABLE launch_plan (operation_id TEXT, revision_id TEXT, config_name TEXT, client TEXT, phase TEXT, plan_hash TEXT, created_at TEXT, observed_outcome_status TEXT, observed_outcome_value TEXT, observed_outcome_reason TEXT, observed_outcome_observed_at TEXT);`);
    legacy.query('INSERT INTO stable_config_revision VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('rev-malformed', 'orphan-config', 'not-an-int', 'known', 'maybe', 'known', 'project', 'known', 'broken', '2026-08-29T00:00:00.000Z', 'not-a-category', 'legacy-evidence', null);
    legacy.query('INSERT INTO launch_plan VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('duplicate-op', 'missing-revision', 'orphan-config', 'omp', 'mystery', 'hash-a', '2026-08-29T00:00:00.000Z', 'known', 'bogus', 'TOKEN-SECRET', null);
    legacy.query('INSERT INTO launch_plan VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('duplicate-op', 'missing-revision', 'orphan-config', 'omp', 'mystery', 'hash-b', '2026-08-29T00:00:00.000Z', 'known', 'bogus', null, null);
    legacy.close();

    const store = new SqliteStore(dbPath);
    expect(store.manifest.legacyBootstrap).toBe(true);
    expect(store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM legacy_schema_inventory WHERE table_name = 'deployment_status'").get()?.count).toBe(1);
    const revision = store.db.query<{ default_marker_json: string; availability_json: string; trigger_category: string }, []>("SELECT default_marker_json, availability_json, trigger_category FROM configuration_revision WHERE revision_id = 'rev-malformed'").get()!;
    expect(JSON.parse(revision.default_marker_json).kind).toBe('unknown');
    expect(JSON.parse(revision.availability_json).kind).toBe('unknown');
    expect(revision.trigger_category).toBe('new-scenario');
    expect(store.db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM activation_operation').get()?.count).toBe(2);
    expect(store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM launch_observation").get()?.count).toBe(0);
    expect(store.db.query<{ phase: string }, []>("SELECT phase FROM activation_operation WHERE operation_id = 'duplicate-op:legacy-1'").get()?.phase).toBe('requires-restart');
    const preserved = store.db.query<{ source_row_json: string }, []>('SELECT source_row_json FROM legacy_launch_plan LIMIT 1').get()!.source_row_json;
    expect(preserved).not.toContain('TOKEN-SECRET');
    store.close();
  });
  test('opens an isolated copy of the real control-plane database when available', () => {
    const sourcePath = defaultDbPath();
    if (!existsSync(sourcePath)) return;
    const dbPath = tempDb();
    copyFileSync(sourcePath, dbPath);
    const first = new SqliteStore(dbPath);
    expect(first.manifest.appliedVersions).toContain(1);
    expect(first.manifest.appliedVersions).toContain(2);
    expect(first.manifest.appliedVersions).toContain(3);
    const counts = first.manifest.canonicalCounts;
    first.close();
    const second = new SqliteStore(dbPath);
    expect(second.manifest.canonicalCounts).toEqual(counts);
    second.close();
  });
});
