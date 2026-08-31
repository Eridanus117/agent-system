import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import CANONICAL_SQL from '../../../migrations/0001_canonical.sql' with { type: 'text' };
import LEGACY_SQL from '../../../migrations/0002_legacy_preservation.sql' with { type: 'text' };
import SEARCH_SQL from '../../../migrations/0003_search.sql' with { type: 'text' };
import AGENT_SCHEDULING_SQL from '../../../migrations/0004_agent_scheduling.sql' with { type: 'text' };
import { openReadonlySqliteDatabase, openSqliteDatabase } from './connection';

interface MigrationDefinition {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export interface MigrationManifest {
  readonly databasePath: string;
  readonly appliedVersions: readonly number[];
  readonly legacyBootstrap: boolean;
  readonly canonicalCounts: { readonly configurations: number; readonly revisions: number; readonly operations: number; readonly observations: number };
  readonly validation: { readonly foreignKeys: boolean; readonly projectionConsistent: boolean };
}

const MIGRATIONS: readonly MigrationDefinition[] = [
  { version: 1, name: 'canonical', sql: CANONICAL_SQL },
  { version: 2, name: 'legacy-preservation', sql: LEGACY_SQL },
  { version: 3, name: 'search-projection', sql: SEARCH_SQL },
  { version: 4, name: 'agent-scheduling', sql: AGENT_SCHEDULING_SQL },
];
const SQLITE_SIDECARS = ['', '-wal', '-shm'] as const;
const SQLITE_SNAPSHOT_SIDECARS = ['', '-wal', '-shm'] as const;

function createReadonlySnapshot(source: string): { readonly databasePath: string; readonly directory: string } {
  const resolved = path.resolve(source);
  if (!existsSync(resolved)) throw new Error(`database does not exist: ${source}`);
  const directory = mkdtempSync(path.join(tmpdir(), 'configs-readonly-'));
  const snapshot = path.join(directory, path.basename(resolved));
  try {
    for (const suffix of SQLITE_SNAPSHOT_SIDECARS) {
      const sourcePath = `${resolved}${suffix}`;
      if (existsSync(sourcePath)) copyFileSync(sourcePath, `${snapshot}${suffix}`);
    }
    return { databasePath: snapshot, directory };
  } catch (error) {
    rmSync(directory, { force: true, recursive: true });
    throw error;
  }
}

function copyDatabase(source: string, staging: string): void {
  for (const suffix of SQLITE_SNAPSHOT_SIDECARS.slice(0, 2)) {
    const sourcePath = `${source}${suffix}`;
    if (existsSync(sourcePath)) copyFileSync(sourcePath, `${staging}${suffix}`);
  }
}
function copyDatabaseConsistently(source: string, staging: string): number | null {
  if (!existsSync(source)) return null;
  const sourceDb = new Database(source);
  try {
    sourceDb.exec('BEGIN IMMEDIATE');
    copyDatabase(source, staging);
    const dataVersion = sourceDb.query<{ data_version: number }, []>('PRAGMA data_version').get()?.data_version ?? 0;
    sourceDb.exec('COMMIT');
    return dataVersion;
  } catch (error) {
    try { sourceDb.exec('ROLLBACK'); } catch { }
    throw error;
  } finally {
    sourceDb.close();
  }
}
function assertSourceUnchanged(source: string, snapshotVersion: number | null): void {
  if (snapshotVersion === null) {
    if (existsSync(source)) throw new Error('source database appeared during migration');
    return;
  }
  const sourceDb = new Database(source);
  try {
    sourceDb.exec('BEGIN IMMEDIATE');
    const currentVersion = sourceDb.query<{ data_version: number }, []>('PRAGMA data_version').get()?.data_version ?? 0;
    if (currentVersion !== snapshotVersion) throw new Error('source database changed during migration');
    sourceDb.exec('COMMIT');
  } catch (error) {
    try { sourceDb.exec('ROLLBACK'); } catch { }
    throw error;
  } finally {
    sourceDb.close();
  }
}

function switchDatabase(staging: string, target: string): void {
  const backup = `${target}.pre-migration-${randomUUID()}`;
  try {
    for (const suffix of SQLITE_SIDECARS) {
      const targetPath = `${target}${suffix}`;
      if (existsSync(targetPath)) renameSync(targetPath, `${backup}${suffix}`);
    }
    for (const suffix of SQLITE_SIDECARS) {
      const stagingPath = `${staging}${suffix}`;
      if (existsSync(stagingPath)) copyFileSync(stagingPath, `${target}${suffix}`);
    }
    for (const suffix of SQLITE_SIDECARS) rmSync(`${backup}${suffix}`, { force: true });
  } catch (error) {
    for (const suffix of SQLITE_SIDECARS) {
      const targetPath = `${target}${suffix}`;
      const backupPath = `${backup}${suffix}`;
      if (existsSync(targetPath)) rmSync(targetPath, { force: true });
      if (existsSync(backupPath)) renameSync(backupPath, targetPath);
    }
    throw error;
  } finally {
    for (const suffix of SQLITE_SIDECARS) {
      try { rmSync(`${staging}${suffix}`, { force: true }); } catch { }
    }
  }
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

function splitStatements(sql: string): readonly string[] {
  return [sql];
}
function runStatement(db: Database, sql: string, bindings: readonly unknown[]): void {
  db.query(sql).run(...(bindings as never[]));
}
function tableExists(db: Database, name: string): boolean {
  return db.query<{ present: number }, [string]>("SELECT COUNT(*) AS present FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)?.present === 1;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function legacyTableColumns(db: Database, table: string): readonly string[] {
  return db.query<{ name: string }, []>(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((row) => row.name);
}

function captureLegacyInventory(db: Database, discoveredAt: string): void {
  const canonical = new Set(['schema_migrations', 'configuration', 'configuration_revision', 'activation_operation', 'launch_observation', 'legacy_schema_inventory', 'legacy_launch_plan', 'configuration_search_document', 'configuration_revision_fts', 'agent_schedule', 'dispatch_operation']);
  const tables = db.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const insert = db.query('INSERT OR IGNORE INTO legacy_schema_inventory(table_name, columns_json, owner_status, discovered_at) VALUES (?, ?, ?, ?)');
  for (const table of tables) {
    if (canonical.has(table.name) || table.name.startsWith('configuration_revision_fts_')) continue;
    insert.run(table.name, JSON.stringify(legacyTableColumns(db, table.name)), 'owner-unknown', discoveredAt);
  }
}
function hasUnrecognizedTables(db: Database): boolean {
  const canonical = new Set(['schema_migrations', 'configuration', 'configuration_revision', 'activation_operation', 'launch_observation', 'legacy_schema_inventory', 'legacy_launch_plan', 'configuration_search_document', 'configuration_revision_fts', 'agent_schedule', 'dispatch_operation']);
  return db.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().some((table) => !canonical.has(table.name) && !table.name.startsWith('configuration_revision_fts_'));
}

function legacyFact(status: string | undefined, value: string | null | undefined, reason: string | null | undefined, observedAt: string | null | undefined, parse: (raw: string) => unknown): unknown {
  if (status === 'known' && value !== null && value !== undefined) {
    try {
      return { kind: 'known', value: parse(value) };
    } catch {
      return { kind: 'unknown', reason: 'legacy-invalid-known-value', observedAt: observedAt ?? new Date(0).toISOString() };
    }
  }
  return { kind: 'unknown', reason: reason === undefined || reason === null || reason.trim().length === 0 ? 'legacy-unknown' : 'legacy-unknown-value', observedAt: observedAt ?? new Date(0).toISOString() };
}
function legacyCapabilityRows(row: Record<string, unknown>): unknown[] {
  const groups = [
    ['instructions_json', 'instruction'],
    ['skills_json', 'skill'],
    ['mcp_json', 'mcp'],
    ['hooks_json', 'hook'],
    ['plugins_json', 'plugin'],
  ] as const;
  const capabilities: unknown[] = [];
  const knownSources = new Set(['project-capability', 'project-skill-import', 'project-prompt', 'unknown-source']);
  const knownKinds = new Set(['instruction', 'skill', 'mcp', 'hook', 'plugin']);
  for (const [column, groupKind] of groups) {
    const raw = row[column];
    if (typeof raw !== 'string') continue;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = []; }
    if (!Array.isArray(parsed)) continue;
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      if (typeof entry.name !== 'string' || entry.name.trim().length === 0) continue;
      const sourceCategory = entry.sourceCategory;
      const source = typeof sourceCategory === 'object' && sourceCategory !== null && (sourceCategory as Record<string, unknown>).kind === 'known' ? (sourceCategory as Record<string, unknown>).value : undefined;
      const knownValue = (key: string): string | undefined => {
        const candidate = entry[key];
        if (typeof candidate !== 'object' || candidate === null) return undefined;
        const fact = candidate as Record<string, unknown>;
        return fact.kind === 'known' && typeof fact.value === 'string' ? fact.value : undefined;
      };
      capabilities.push({
        kind: typeof entry.kind === 'string' && knownKinds.has(entry.kind) ? entry.kind : groupKind,
        name: entry.name.trim(),
        source: typeof source === 'string' && knownSources.has(source) ? source : undefined,
        summary: knownValue('summary'),
        sourceRef: knownValue('sourceRef'),
        contentFingerprint: knownValue('contentFingerprint'),
      });
    }
  }
  return capabilities;
}
function legacyLaunchPlanMetadata(row: Record<string, unknown>): Record<string, unknown> {
  const allowed = ['operation_id', 'revision_id', 'config_name', 'client', 'phase', 'plan_hash', 'created_at', 'observed_outcome_status', 'observed_outcome_value', 'observed_outcome_observed_at'];
  return Object.fromEntries(allowed.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]));
}
interface LegacyObservationRow {
  readonly operation_id: string;
  readonly agent_id: string;
  readonly stage: string;
  readonly outcome: string;
  readonly process_reference_json: string | null;
  readonly reason: string | null;
  readonly observed_at: string;
}

function copyLegacyData(db: Database, copiedAt: string): void {
  const insertConfig = db.query('INSERT OR IGNORE INTO configuration(config_name) VALUES (?)');
  const revisionIdMap = new Map<string, string>();
  if (tableExists(db, 'stable_config')) {
    const configs = db.query<{ config_name: string }, []>('SELECT config_name FROM stable_config').all();
    for (const config of configs) {
      if (typeof config.config_name === 'string' && config.config_name.trim().length > 0) insertConfig.run(config.config_name.trim());
    }
  }
  if (tableExists(db, 'stable_config_revision')) {
    const availableColumns = new Set(legacyTableColumns(db, 'stable_config_revision'));
    const columns = ['revision_id', 'config_name', 'schema_version', 'default_marker_status', 'default_marker_value', 'default_marker_reason', 'default_marker_observed_at', 'scope_boundary_status', 'scope_boundary_value', 'scope_boundary_reason', 'scope_boundary_observed_at', 'availability_status', 'availability_value', 'availability_reason', 'availability_observed_at', 'instructions_json', 'skills_json', 'mcp_json', 'hooks_json', 'plugins_json', 'created_at', 'trigger_category', 'evidence_ref', 'supersedes_revision_id'].filter((column) => availableColumns.has(column));
    const rows = db.query<Record<string, unknown>, []>(`SELECT rowid AS _legacy_rowid, ${columns.map(quoteIdentifier).join(', ')} FROM stable_config_revision`).all();
    for (const row of rows) {
      let revisionId = typeof row.revision_id === 'string' && row.revision_id.trim().length > 0 ? row.revision_id : `legacy-revision-${String(row._legacy_rowid ?? 'unknown')}`;
      const sourceRevisionId = revisionId;
      const configName = typeof row.config_name === 'string' && row.config_name.trim().length > 0 ? row.config_name.trim() : 'legacy-unknown';
      const schemaVersion = Number(row.schema_version);
      const normalizedSchemaVersion = Number.isInteger(schemaVersion) && schemaVersion >= 1 ? schemaVersion : 1;
      const triggerCategory = ['new-scenario', 'known-insufficiency', 'bad-case'].includes(String(row.trigger_category)) ? String(row.trigger_category) : 'new-scenario';
      const evidenceRef = typeof row.evidence_ref === 'string' && row.evidence_ref.trim().length > 0 ? row.evidence_ref : `legacy:stable_config_revision:${revisionId}`;
      const createdAt = typeof row.created_at === 'string' && row.created_at.trim().length > 0 ? row.created_at : copiedAt;
      const defaultMarkerJson = JSON.stringify(legacyFact(String(row.default_marker_status), row.default_marker_value as string | null, row.default_marker_reason as string | null, row.default_marker_observed_at as string | null, (raw) => { if (raw !== 'true' && raw !== 'false') throw new Error('invalid boolean'); return raw === 'true'; }));
      const scopeBoundaryJson = JSON.stringify(legacyFact(String(row.scope_boundary_status), row.scope_boundary_value as string | null, row.scope_boundary_reason as string | null, row.scope_boundary_observed_at as string | null, (raw) => { if (raw.trim().length === 0) throw new Error('invalid scope'); return raw; }));
      const availabilityJson = JSON.stringify(legacyFact(String(row.availability_status), row.availability_value as string | null, row.availability_reason as string | null, row.availability_observed_at as string | null, (raw) => { if (raw !== 'resolved') throw new Error('invalid availability'); return 'resolved'; }));
      const capabilitiesJson = JSON.stringify(legacyCapabilityRows(row));
      const normalizedSupersedes = typeof row.supersedes_revision_id === 'string' ? revisionIdMap.get(row.supersedes_revision_id) ?? row.supersedes_revision_id : null;
      const existing = db.query<{ config_name: string; schema_version: number; default_marker_json: string; scope_boundary_json: string; availability_json: string; capabilities_json: string; trigger_category: string; evidence_ref: string; supersedes_revision_id: string | null; created_at: string }, [string]>('SELECT config_name, schema_version, default_marker_json, scope_boundary_json, availability_json, capabilities_json, trigger_category, evidence_ref, supersedes_revision_id, created_at FROM configuration_revision WHERE revision_id = ?').get(revisionId);
      const matches = existing !== null && JSON.stringify([existing.config_name, existing.schema_version, existing.default_marker_json, existing.scope_boundary_json, existing.availability_json, existing.capabilities_json, existing.trigger_category, existing.evidence_ref, existing.supersedes_revision_id, existing.created_at]) === JSON.stringify([configName, normalizedSchemaVersion, defaultMarkerJson, scopeBoundaryJson, availabilityJson, capabilitiesJson, triggerCategory, evidenceRef, normalizedSupersedes, createdAt]);
      if (existing !== null && !matches) {
        const collisionRevisionId = `${revisionId}:migrated-${checksum(JSON.stringify(row)).slice(0, 16)}`;
        const collisionExisting = db.query<{ config_name: string; schema_version: number; default_marker_json: string; scope_boundary_json: string; availability_json: string; capabilities_json: string; trigger_category: string; evidence_ref: string; supersedes_revision_id: string | null; created_at: string }, [string]>('SELECT config_name, schema_version, default_marker_json, scope_boundary_json, availability_json, capabilities_json, trigger_category, evidence_ref, supersedes_revision_id, created_at FROM configuration_revision WHERE revision_id = ?').get(collisionRevisionId);
        const collisionMatches = collisionExisting !== null && JSON.stringify([collisionExisting.config_name, collisionExisting.schema_version, collisionExisting.default_marker_json, collisionExisting.scope_boundary_json, collisionExisting.availability_json, collisionExisting.capabilities_json, collisionExisting.trigger_category, collisionExisting.evidence_ref, collisionExisting.supersedes_revision_id, collisionExisting.created_at]) === JSON.stringify([configName, normalizedSchemaVersion, defaultMarkerJson, scopeBoundaryJson, availabilityJson, capabilitiesJson, triggerCategory, evidenceRef, normalizedSupersedes, createdAt]);
        revisionId = collisionRevisionId;
        let collisionSuffix = 2;
        while (!collisionMatches && db.query('SELECT revision_id FROM configuration_revision WHERE revision_id = ?').get(revisionId) !== null) revisionId = `${collisionRevisionId}-${collisionSuffix++}`;
      }
      insertConfig.run(configName);
      runStatement(db, 'INSERT OR IGNORE INTO configuration_revision(revision_id, config_name, schema_version, default_marker_json, scope_boundary_json, availability_json, capabilities_json, trigger_category, evidence_ref, supersedes_revision_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [revisionId, configName, normalizedSchemaVersion, defaultMarkerJson, scopeBoundaryJson, availabilityJson, capabilitiesJson, triggerCategory, evidenceRef, null, createdAt]);
      if (!revisionIdMap.has(sourceRevisionId)) revisionIdMap.set(sourceRevisionId, revisionId);
    }
    for (const row of rows) {
      const sourceRevisionId = typeof row.revision_id === 'string' && row.revision_id.trim().length > 0 ? row.revision_id : `legacy-revision-${String(row._legacy_rowid ?? 'unknown')}`;
      const revisionId = revisionIdMap.get(sourceRevisionId) ?? sourceRevisionId;
      const configName = typeof row.config_name === 'string' && row.config_name.trim().length > 0 ? row.config_name.trim() : 'legacy-unknown';
      const sourceTargetId = typeof row.supersedes_revision_id === 'string' ? row.supersedes_revision_id : null;
      const targetId = sourceTargetId === null ? null : revisionIdMap.get(sourceTargetId) ?? sourceTargetId;
      if (targetId === null || targetId === revisionId) continue;
      const target = db.query<{ config_name: string }, [string]>('SELECT config_name FROM configuration_revision WHERE revision_id = ?').get(targetId);
      const successor = db.query<{ revision_id: string }, [string]>('SELECT revision_id FROM configuration_revision WHERE supersedes_revision_id = ?').get(targetId);
      if (target !== null && target.config_name === configName && successor === null) db.query('UPDATE configuration_revision SET supersedes_revision_id = ? WHERE revision_id = ? AND supersedes_revision_id IS NULL').run(targetId, revisionId);
    }
  }
  if (!tableExists(db, 'launch_plan')) return;
  const columns = legacyTableColumns(db, 'launch_plan');
  if (columns.length === 0) return;
  const selectColumns = ['rowid', ...columns].map(quoteIdentifier).join(', ');
  const rows = db.query<Record<string, unknown>, []>(`SELECT ${selectColumns} FROM launch_plan ORDER BY rowid`).all();
  const operationIdCounts = new Map<string, number>();
  for (const row of rows) {
    const base = String(row.operation_id ?? '');
    operationIdCounts.set(base, (operationIdCounts.get(base) ?? 0) + 1);
  }
  const allowed = new Set(['prepared', 'awaiting-confirmation', 'applying', 'succeeded', 'degraded', 'failed', 'cancelled', 'requires-restart']);
  for (const row of rows) {
    const legacyId = Number(row.rowid);
    const sourceJson = JSON.stringify(legacyLaunchPlanMetadata(row));
    const copied = db.query<{ source_row_json: string }, [number]>('SELECT source_row_json FROM legacy_launch_plan WHERE legacy_id = ?').get(legacyId)?.source_row_json === sourceJson;
    runStatement(db, 'INSERT OR IGNORE INTO legacy_launch_plan(legacy_id, source_row_json, copied_at) VALUES (?, ?, ?)', [legacyId, sourceJson, copiedAt]);
    const phaseRaw = String(row.phase ?? '');
    let phase = phaseRaw === 'observing' ? 'applying' : allowed.has(phaseRaw) ? phaseRaw : 'requires-restart';
    const sourceRevisionId = typeof row.revision_id === 'string' ? row.revision_id : '';
    const revisionId = revisionIdMap.get(sourceRevisionId) ?? (sourceRevisionId.length > 0 && db.query('SELECT revision_id FROM configuration_revision WHERE revision_id = ?').get(sourceRevisionId) !== null ? sourceRevisionId : null);
    const baseOperationId = String(row.operation_id ?? `legacy-operation-${legacyId}`);
    const preferredOperationId = (operationIdCounts.get(baseOperationId) ?? 0) > 1 ? `${baseOperationId}:legacy-${legacyId}` : baseOperationId;
    const collisionOperationId = `${preferredOperationId}:migrated-${checksum(sourceJson).slice(0, 16)}`;
    const preferredExists = db.query('SELECT operation_id FROM activation_operation WHERE operation_id = ?').get(preferredOperationId) !== null;
    let operationId = preferredOperationId;
    if (!copied && preferredExists) {
      operationId = collisionOperationId;
      let collisionSuffix = 2;
      while (db.query('SELECT operation_id FROM activation_operation WHERE operation_id = ?').get(operationId) !== null) operationId = `${collisionOperationId}-${collisionSuffix++}`;
    }
    const configName = typeof row.config_name === 'string' && row.config_name.trim().length > 0 ? row.config_name.trim() : 'legacy-unknown';
    const client = typeof row.client === 'string' && row.client.trim().length > 0 ? row.client.trim() : 'legacy-unknown';
    let reason = revisionId === null ? 'unresolved legacy operation: revision could not be associated' : null;
    if (revisionId === null && (phase === 'succeeded' || phase === 'degraded')) phase = 'requires-restart';
    if (phase === 'requires-restart' && reason === null) reason = 'unresolved legacy operation: phase could not be represented safely';
    const operationExists = db.query('SELECT operation_id FROM activation_operation WHERE operation_id = ?').get(operationId) !== null;
    if (!operationExists) runStatement(db, 'INSERT INTO activation_operation(operation_id, revision_id, config_name, agent_id, phase, version, plan_hash, created_at, updated_at, terminal_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [operationId, revisionId, configName, client, phase, 0, String(row.plan_hash ?? `legacy-${legacyId}`), String(row.created_at ?? copiedAt), copiedAt, reason]);
    const outcome = row.observed_outcome_value;
    if (String(row.observed_outcome_status) === 'known' && typeof outcome === 'string' && ['succeeded', 'degraded', 'failed', 'incomplete', 'not-available'].includes(outcome)) {
      const preferredObservationId = `legacy-observation-${legacyId}`;
      const observationReason = typeof row.observed_outcome_reason === 'string' && row.observed_outcome_reason.trim().length > 0 ? 'legacy-observation-reason-preserved-in-source' : null;
      const observedAt = typeof row.observed_outcome_observed_at === 'string' && row.observed_outcome_observed_at.trim().length > 0 ? row.observed_outcome_observed_at : new Date(0).toISOString();
      const readObservation = (observationId: string): LegacyObservationRow | null => db.query<LegacyObservationRow, [string]>('SELECT operation_id, agent_id, stage, outcome, process_reference_json, reason, observed_at FROM launch_observation WHERE observation_id = ?').get(observationId);
      const existingObservation = readObservation(preferredObservationId);
      const observationMatches = (candidate: LegacyObservationRow | null): boolean => candidate !== null && candidate.operation_id === operationId && candidate.agent_id === client && candidate.stage === 'outcome-observed' && candidate.outcome === outcome && candidate.process_reference_json === null && candidate.reason === observationReason && candidate.observed_at === observedAt;
      const collisionObservationId = `${preferredObservationId}:migrated-${checksum(sourceJson).slice(0, 16)}`;
      const collisionMatches = observationMatches(readObservation(collisionObservationId));
      let observationId = existingObservation === null || observationMatches(existingObservation) ? preferredObservationId : collisionObservationId;
      let collisionSuffix = 2;
      while (!observationMatches(existingObservation) && !collisionMatches && readObservation(observationId) !== null) observationId = `${collisionObservationId}-${collisionSuffix++}`;
      if (readObservation(observationId) === null) runStatement(db, 'INSERT INTO launch_observation(observation_id, operation_id, agent_id, stage, outcome, process_reference_json, reason, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [observationId, operationId, client, 'outcome-observed', outcome, null, observationReason, observedAt]);
    }
  }
}

function applyMigration(db: Database, migration: MigrationDefinition): void {
  const expectedChecksum = checksum(migration.sql);
  db.transaction(() => {
    const existing = db.query<{ name: string; checksum: string }, [number]>('SELECT name, checksum FROM schema_migrations WHERE version = ?').get(migration.version);
    if (existing !== null) {
      if (existing.name !== migration.name || existing.checksum !== expectedChecksum) throw new Error(`schema migration checksum mismatch at version ${migration.version}`);
      return;
    }
    const previous = db.query<{ version: number }, []>('SELECT MAX(version) AS version FROM schema_migrations').get()?.version ?? 0;
    if (migration.version !== previous + 1) throw new Error(`missing prerequisite schema migration before version ${migration.version}`);
    for (const statement of splitStatements(migration.sql)) db.exec(statement);
    db.query('INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)').run(migration.version, migration.name, expectedChecksum, new Date().toISOString());
  })();
}

function reconcileProjection(db: Database): void {
  db.transaction(() => {
    db.exec('DELETE FROM configuration_search_document');
    const rows = db.query<{ revision_id: string; config_name: string; scope_boundary_json: string; capabilities_json: string; trigger_category: string }, []>('SELECT revision_id, config_name, scope_boundary_json, capabilities_json, trigger_category FROM configuration_revision ORDER BY revision_id').all();
    const insert = db.query('INSERT INTO configuration_search_document(revision_id, config_name, scope_boundary, capability_names, capability_summaries, trigger_category) VALUES (?, ?, ?, ?, ?, ?)');
    for (const row of rows) {
      const scope = JSON.parse(row.scope_boundary_json) as { kind: string; value?: string };
      const capabilities = JSON.parse(row.capabilities_json) as Array<{ name: string; summary?: string }>;
      insert.run(row.revision_id, row.config_name, scope.kind === 'known' ? scope.value ?? '' : '', capabilities.map((item) => item.name).join(' '), capabilities.map((item) => item.summary ?? '').join(' '), row.trigger_category);
    }
  })();
}
function validateMigratedDatabase(db: Database): void {
  const versions = db.query<{ version: number }, []>('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => row.version);
  const expectedStart = versions[0] === 0 ? 0 : 1;
  if (versions.some((version, index) => version !== expectedStart + index)) throw new Error('schema migration history is not contiguous');
  if (db.query('PRAGMA foreign_key_check').all().length > 0) throw new Error('foreign key validation failed after migration');
  const revisions = db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM configuration_revision').get()?.count ?? 0;
  const documents = db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM configuration_search_document').get()?.count ?? 0;
  if (revisions !== documents) throw new Error('search projection count does not match revisions');
}
function readonlyManifest(db: Database, databasePath: string): MigrationManifest {
  const appliedVersions = db.query<{ version: number }, []>('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => row.version);
  const count = (table: string): number => Number(db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ?? 0);
  return {
    databasePath,
    appliedVersions,
    validation: { foreignKeys: true, projectionConsistent: true },
    legacyBootstrap: false,
    canonicalCounts: { configurations: count('configuration'), revisions: count('configuration_revision'), operations: count('activation_operation'), observations: count('launch_observation') },
  };
}
export class SqliteStore {
  readonly db: Database;
  readonly manifest: MigrationManifest;
  private readonlySnapshotDirectory: string | undefined;

  constructor(readonly databasePath: string, options: { readonly readOnly?: boolean } = {}) {
    if (options.readOnly) {
      const snapshot = createReadonlySnapshot(databasePath);
      this.readonlySnapshotDirectory = snapshot.directory;
      let snapshotDb: Database | undefined;
      try {
        snapshotDb = openReadonlySqliteDatabase(snapshot.databasePath);
        this.db = snapshotDb;
        this.manifest = readonlyManifest(this.db, databasePath);
      } catch (error) {
        snapshotDb?.close();
        rmSync(snapshot.directory, { force: true, recursive: true });
        this.readonlySnapshotDirectory = undefined;
        throw error;
      }
      return;
    }
    if (databasePath === ':memory:') {
      this.db = openSqliteDatabase(databasePath);
      try {
        this.manifest = this.migrate();
      } catch (error) {
        this.db.close();
        throw error;
      }
      return;
    }
    const target = path.resolve(databasePath);
    const staging = `${target}.staging-${randomUUID()}`;
    const lockPath = `${target}.migration.lock`;
    writeFileSync(lockPath, '', { flag: 'wx' });
    let openDb: Database | undefined;
    try {
      const snapshotVersion = copyDatabaseConsistently(target, staging);
      this.db = openSqliteDatabase(staging);
      openDb = this.db;
      this.manifest = this.migrate();
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      openDb.close();
      openDb = undefined;
      assertSourceUnchanged(target, snapshotVersion);
      switchDatabase(staging, target);
      this.db = openSqliteDatabase(target);
    } catch (error) {
      openDb?.close();
      for (const suffix of SQLITE_SIDECARS) {
        try { rmSync(`${staging}${suffix}`, { force: true }); } catch { }
      }
      throw error;
    } finally {
      unlinkSync(lockPath);
    }
  }
  private migrate(): MigrationManifest {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT');
    const hadHistory = this.db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM schema_migrations').get()?.count !== 0;
    const hadLegacySchema = hasUnrecognizedTables(this.db);
    let legacyBootstrap = false;
    if (!hadHistory && hadLegacySchema) {
      legacyBootstrap = true;
      const bootstrapChecksum = checksum('legacy-bootstrap-v1');
      this.db.query('INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)').run(0, 'legacy-bootstrap', bootstrapChecksum, new Date().toISOString());
    }
    for (const migration of MIGRATIONS) applyMigration(this.db, migration);
    if (hadLegacySchema) {
      this.db.transaction(() => {
        const copiedAt = new Date().toISOString();
        captureLegacyInventory(this.db, copiedAt);
        copyLegacyData(this.db, copiedAt);
      })();
    }
    reconcileProjection(this.db);
    validateMigratedDatabase(this.db);
    const appliedVersions = this.db.query<{ version: number }, []>('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => row.version);
    this.db.exec('PRAGMA user_version = 4');
    return {
      databasePath: this.databasePath,
      appliedVersions,
      validation: { foreignKeys: true, projectionConsistent: true },
      legacyBootstrap,
      canonicalCounts: {
        configurations: this.db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM configuration').get()?.count ?? 0,
        revisions: this.db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM configuration_revision').get()?.count ?? 0,
        operations: this.db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM activation_operation').get()?.count ?? 0,
        observations: this.db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM launch_observation').get()?.count ?? 0,
      },
    };
  }

  rebuildSearchProjection(): void {
    reconcileProjection(this.db);
  }

  close(): void {
    this.db.close();
    if (this.readonlySnapshotDirectory !== undefined) {
      rmSync(this.readonlySnapshotDirectory, { force: true, recursive: true });
      this.readonlySnapshotDirectory = undefined;
    }
  }
}
