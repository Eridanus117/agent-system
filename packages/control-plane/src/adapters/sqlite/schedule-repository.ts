import type { AgentScheduleRepository } from '../../application/ports/schedule-repository';
import { agentId, type AgentId } from '../../domain/agent';
import { createAgentScheduleIntent, type AgentScheduleIntent } from '../../domain/schedule';
import { SqliteStore } from './store';

const COLUMNS = 'schedule_id, agent_id, revision_id, trigger_json, target_json, session_policy, precheck_ref, source_context_ref, created_at';

function fromRow(row: Record<string, unknown>): AgentScheduleIntent {
  return createAgentScheduleIntent({
    scheduleId: String(row.schedule_id),
    agentId: agentId(String(row.agent_id)),
    revisionId: String(row.revision_id),
    trigger: JSON.parse(String(row.trigger_json)),
    target: JSON.parse(String(row.target_json)),
    sessionPolicy: String(row.session_policy) as AgentScheduleIntent['sessionPolicy'],
    precheckRef: row.precheck_ref === null ? null : String(row.precheck_ref),
    sourceContextRef: row.source_context_ref === null ? null : String(row.source_context_ref),
    createdAt: String(row.created_at),
  });
}

export class SqliteScheduleRepository implements AgentScheduleRepository {
  constructor(readonly store: SqliteStore) {}

  async save(schedule: AgentScheduleIntent): Promise<void> {
    const normalized = createAgentScheduleIntent(schedule);
    this.store.db.query(`INSERT INTO agent_schedule(${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      normalized.scheduleId,
      normalized.agentId,
      normalized.revisionId,
      JSON.stringify(normalized.trigger),
      JSON.stringify(normalized.target),
      normalized.sessionPolicy,
      normalized.precheckRef,
      normalized.sourceContextRef,
      normalized.createdAt,
    );
  }

  async findById(scheduleId: string): Promise<AgentScheduleIntent | null> {
    const row = this.store.db.query<Record<string, unknown>, [string]>(`SELECT ${COLUMNS} FROM agent_schedule WHERE schedule_id = ?`).get(scheduleId);
    return row === null ? null : fromRow(row);
  }

  async listByAgent(agentIdValue: AgentId): Promise<readonly AgentScheduleIntent[]> {
    const normalizedAgentId = agentId(agentIdValue);
    return this.store.db.query<Record<string, unknown>, [string]>(`SELECT ${COLUMNS} FROM agent_schedule WHERE agent_id = ? ORDER BY created_at, rowid`).all(normalizedAgentId).map(fromRow);
  }
}
