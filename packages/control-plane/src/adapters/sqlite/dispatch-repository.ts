import type { DispatchOperationRepository } from '../../application/ports/dispatch-repository';
import { agentId, type AgentId } from '../../domain/agent';
import {
  transitionDispatchOperation,
  validateDispatchOperation,
  type DispatchOperation,
} from '../../domain/dispatch-operation';
import {
  createOrcaAutomationReceipt,
  type OrcaAutomationReceipt,
} from '../../domain/schedule';
import { SqliteStore } from './store';

const COLUMNS = 'operation_id, schedule_id, agent_id, revision_id, target_json, phase, automation_id, manifest_hash, created_at, updated_at, terminal_reason, version, receipt_automation_id, receipt_provider, receipt_target_json, receipt_trigger_json, receipt_created_at, receipt_source_evidence';

function fromRow(row: Record<string, unknown>): DispatchOperation {
  const operation: DispatchOperation = {
    operationId: String(row.operation_id),
    scheduleId: String(row.schedule_id),
    agentId: agentId(String(row.agent_id)),
    revisionId: String(row.revision_id),
    target: JSON.parse(String(row.target_json)),
    phase: String(row.phase) as DispatchOperation['phase'],
    automationId: row.automation_id === null ? null : String(row.automation_id),
    manifestHash: String(row.manifest_hash),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    terminalReason: row.terminal_reason === null ? null : String(row.terminal_reason),
    version: Number(row.version),
  };
  validateDispatchOperation(operation);
  return operation;
}

function sameReceipt(row: Record<string, unknown>, receipt: OrcaAutomationReceipt): boolean {
  return String(row.receipt_automation_id ?? '') === receipt.automationId
    && String(row.receipt_provider ?? '') === receipt.provider
    && String(row.receipt_target_json ?? '') === JSON.stringify(receipt.target)
    && String(row.receipt_trigger_json ?? '') === JSON.stringify(receipt.trigger)
    && String(row.receipt_created_at ?? '') === receipt.createdAt
    && String(row.receipt_source_evidence ?? '') === receipt.sourceEvidence;
}

export class SqliteDispatchOperationRepository implements DispatchOperationRepository {
  constructor(readonly store: SqliteStore) {}

  async save(operation: DispatchOperation): Promise<void> {
    validateDispatchOperation(operation);
    this.store.db.query(`INSERT INTO dispatch_operation(operation_id, schedule_id, agent_id, revision_id, target_json, phase, automation_id, manifest_hash, created_at, updated_at, terminal_reason, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      operation.operationId,
      operation.scheduleId,
      operation.agentId,
      operation.revisionId,
      JSON.stringify(operation.target),
      operation.phase,
      operation.automationId,
      operation.manifestHash,
      operation.createdAt,
      operation.updatedAt,
      operation.terminalReason,
      operation.version,
    );
  }

  async findById(operationId: string): Promise<DispatchOperation | null> {
    const row = this.store.db.query<Record<string, unknown>, [string]>(`SELECT ${COLUMNS} FROM dispatch_operation WHERE operation_id = ?`).get(operationId);
    return row === null ? null : fromRow(row);
  }

  async listByAgent(agentIdValue: AgentId): Promise<readonly DispatchOperation[]> {
    const normalizedAgentId = agentId(agentIdValue);
    return this.store.db.query<Record<string, unknown>, [string]>(`SELECT ${COLUMNS} FROM dispatch_operation WHERE agent_id = ? ORDER BY updated_at DESC, rowid DESC`).all(normalizedAgentId).map(fromRow);
  }

  async updatePhase(operationId: string, expectedPhase: DispatchOperation['phase'], nextState: DispatchOperation): Promise<void> {
    validateDispatchOperation(nextState);
    if (nextState.operationId !== operationId || nextState.version < 1) throw new Error(`dispatch operation update conflict: ${operationId}`);
    const expectedVersion = nextState.version - 1;
    const current = await this.findById(operationId);
    if (current === null) throw new Error(`dispatch operation not found: ${operationId}`);
    if (current.phase !== expectedPhase || current.version !== expectedVersion) throw new Error(`dispatch operation stale update: ${operationId}`);
    if (current.scheduleId !== nextState.scheduleId || current.agentId !== nextState.agentId || current.revisionId !== nextState.revisionId || JSON.stringify(current.target) !== JSON.stringify(nextState.target) || current.manifestHash !== nextState.manifestHash || current.createdAt !== nextState.createdAt) {
      throw new Error(`dispatch operation aggregate mutation: ${operationId}`);
    }
    const event = nextState.phase === 'dispatched'
      ? { type: 'dispatched' as const, automationId: nextState.automationId ?? '' }
      : nextState.phase === 'observing'
        ? { type: 'observing' as const }
        : { type: nextState.phase as 'succeeded' | 'degraded' | 'failed' | 'skipped' | 'unknown', reason: nextState.terminalReason ?? undefined };
    const transition = transitionDispatchOperation(current, event);
    if (!transition.ok || transition.operation.phase !== nextState.phase || transition.operation.automationId !== nextState.automationId || transition.operation.terminalReason !== nextState.terminalReason) {
      throw new Error(`dispatch operation invalid transition: ${operationId}`);
    }
    const result = this.store.db.query('UPDATE dispatch_operation SET agent_id = ?, revision_id = ?, target_json = ?, phase = ?, automation_id = ?, manifest_hash = ?, created_at = ?, updated_at = ?, terminal_reason = ?, version = ? WHERE operation_id = ? AND phase = ? AND version = ?').run(nextState.agentId, nextState.revisionId, JSON.stringify(nextState.target), nextState.phase, nextState.automationId, nextState.manifestHash, nextState.createdAt, nextState.updatedAt, nextState.terminalReason, nextState.version, operationId, expectedPhase, expectedVersion);
    if (result.changes !== 1) throw new Error(`dispatch operation stale update: ${operationId}`);
  }

  async appendReceipt(operationId: string, receiptInput: OrcaAutomationReceipt): Promise<void> {
    const receipt = createOrcaAutomationReceipt(receiptInput);
    const row = this.store.db.query<Record<string, unknown>, [string]>(`SELECT ${COLUMNS} FROM dispatch_operation WHERE operation_id = ?`).get(operationId);
    if (row === null) throw new Error(`dispatch operation not found: ${operationId}`);
    if (row.automation_id === null || String(row.automation_id) !== receipt.automationId) throw new Error(`dispatch receipt correlation mismatch: ${operationId}`);
    if (JSON.stringify(JSON.parse(String(row.target_json))) !== JSON.stringify(receipt.target)) throw new Error(`dispatch receipt target mismatch: ${operationId}`);
    const schedule = this.store.db.query<{ trigger_json: string }, [string]>('SELECT trigger_json FROM agent_schedule WHERE schedule_id = ?').get(String(row.schedule_id));
    if (schedule === null || JSON.stringify(JSON.parse(schedule.trigger_json)) !== JSON.stringify(receipt.trigger)) throw new Error(`dispatch receipt trigger mismatch: ${operationId}`);
    if (row.receipt_automation_id !== null) {
      if (sameReceipt(row, receipt)) return;
      throw new Error(`dispatch receipt conflict: ${operationId}`);
    }
    const result = this.store.db.query('UPDATE dispatch_operation SET receipt_automation_id = ?, receipt_provider = ?, receipt_target_json = ?, receipt_trigger_json = ?, receipt_created_at = ?, receipt_source_evidence = ? WHERE operation_id = ? AND automation_id = ? AND receipt_automation_id IS NULL').run(receipt.automationId, receipt.provider, JSON.stringify(receipt.target), JSON.stringify(receipt.trigger), receipt.createdAt, receipt.sourceEvidence, operationId, receipt.automationId);
    if (result.changes === 1) return;
    const concurrent = this.store.db.query<Record<string, unknown>, [string]>(`SELECT ${COLUMNS} FROM dispatch_operation WHERE operation_id = ?`).get(operationId);
    if (concurrent !== null && sameReceipt(concurrent, receipt)) return;
    throw new Error(`dispatch receipt conflict: ${operationId}`);
  }
}
