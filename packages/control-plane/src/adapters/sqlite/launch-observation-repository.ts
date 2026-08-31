import type { LaunchObservationRepository } from '../../application/ports/launch-observation-repository';
import { createLaunchObservation, normalizeProcessReference, type LaunchObservation } from '../../domain/launch-observation';
import { agentId } from '../../domain/agent';
import { SqliteStore } from './store';
function fromRow(row: Record<string, unknown>): LaunchObservation {
  const processReference = row.process_reference_json === null ? undefined : normalizeProcessReference(JSON.parse(String(row.process_reference_json)));
  return {
    observationId: String(row.observation_id),
    operationId: String(row.operation_id),
    agentId: agentId(String(row.agent_id)),
    stage: String(row.stage) as LaunchObservation['stage'],
    outcome: String(row.outcome) as LaunchObservation['outcome'],
    processReference,
    reason: row.reason === null ? undefined : String(row.reason),
    observedAt: String(row.observed_at),
  };
}

export class SqliteLaunchObservationRepository implements LaunchObservationRepository {
  constructor(readonly store: SqliteStore) {}
  async append(observation: LaunchObservation): Promise<void> {
    const normalized = createLaunchObservation(observation);
    const existing = this.store.db.query<Record<string, unknown>, [string]>('SELECT operation_id, agent_id, stage, outcome, process_reference_json, reason, observed_at FROM launch_observation WHERE observation_id = ?').get(normalized.observationId);
    if (existing !== null) {
      const same = String(existing.operation_id) === normalized.operationId
        && String(existing.agent_id) === normalized.agentId
        && String(existing.stage) === normalized.stage
        && String(existing.outcome) === normalized.outcome
        && String(existing.process_reference_json ?? '') === String(normalized.processReference === undefined ? '' : JSON.stringify(normalized.processReference))
        && String(existing.reason ?? '') === String(normalized.reason ?? '')
        && String(existing.observed_at) === normalized.observedAt;
      if (same) return;
      throw new Error(`launch observation id conflict: ${normalized.observationId}`);
    }
    this.store.db.query('INSERT INTO launch_observation(observation_id, operation_id, agent_id, stage, outcome, process_reference_json, reason, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(normalized.observationId, normalized.operationId, normalized.agentId, normalized.stage, normalized.outcome, normalized.processReference === undefined ? null : JSON.stringify(normalized.processReference), normalized.reason ?? null, normalized.observedAt);
  }

  async listByOperation(operationId: string): Promise<readonly LaunchObservation[]> {
    return this.store.db.query<Record<string, unknown>, [string]>('SELECT observation_id, operation_id, agent_id, stage, outcome, process_reference_json, reason, observed_at FROM launch_observation WHERE operation_id = ? ORDER BY observed_at, rowid').all(operationId).map(fromRow);
  }
}
