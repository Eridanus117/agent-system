import type { ActivationOperationRepository } from '../../application/ports/activation-operation-repository';
import { ConcurrencyConflictError, InvalidActivationTransitionError, InvalidActivationVersionError } from '../../domain/errors';
import { transitionActivationOperation, type ActivationOperation, type ActivationOperationEvent } from '../../domain/activation-operation';
import { agentId } from '../../domain/agent';
import { configurationName, configurationRevisionId } from '../../domain/configuration';
import { SqliteStore } from './store';

function fromRow(row: Record<string, unknown>): ActivationOperation {
  return {
    operationId: String(row.operation_id),
    revisionId: row.revision_id === null ? null : configurationRevisionId(String(row.revision_id)),
    configName: configurationName(String(row.config_name)),
    agentId: agentId(String(row.agent_id)),
    phase: String(row.phase) as ActivationOperation['phase'],
    version: Number(row.version),
    planHash: String(row.plan_hash),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    terminalReason: row.terminal_reason === null ? undefined : String(row.terminal_reason),
  };
}

const COLUMNS = 'operation_id, revision_id, config_name, agent_id, phase, version, plan_hash, created_at, updated_at, terminal_reason';

export class SqliteActivationOperationRepository implements ActivationOperationRepository {
  constructor(readonly store: SqliteStore) {}

  async insert(operation: ActivationOperation): Promise<void> {
    this.store.db.query(`INSERT INTO activation_operation(${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(operation.operationId, operation.revisionId, operation.configName, operation.agentId, operation.phase, operation.version, operation.planHash, operation.createdAt, operation.updatedAt, operation.terminalReason ?? null);
  }

  async updateIfVersion(operationId: string, expectedVersion: number, nextState: ActivationOperation): Promise<void> {
    if (nextState.operationId !== operationId || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new InvalidActivationVersionError(operationId, expectedVersion, nextState.version);
    }
    const currentRow = this.store.db.query<Record<string, unknown>, [string]>(`SELECT ${COLUMNS} FROM activation_operation WHERE operation_id = ?`).get(operationId);
    if (currentRow === null) throw new ConcurrencyConflictError(operationId, expectedVersion);
    const current = fromRow(currentRow);
    if (current.version !== expectedVersion) throw new ConcurrencyConflictError(operationId, expectedVersion);
    if (nextState.configName !== current.configName || nextState.agentId !== current.agentId || nextState.revisionId !== current.revisionId || nextState.planHash !== current.planHash || nextState.createdAt !== current.createdAt) {
      throw new InvalidActivationTransitionError(current.phase, 'aggregate-mutation');
    }
    const events: readonly ActivationOperationEvent[] = [
      { type: 'awaiting-confirmation' },
      { type: 'confirmed' },
      { type: 'succeeded' },
      { type: 'degraded', reason: nextState.terminalReason },
      { type: 'failed', reason: nextState.terminalReason ?? 'activation-failed' },
      { type: 'cancelled', reason: nextState.terminalReason },
      { type: 'requires-restart', reason: nextState.terminalReason ?? 'restart-required' },
    ];
    if (!events.some((event) => {
      const transition = transitionActivationOperation(current, event);
      return transition.ok && transition.operation.phase === nextState.phase;
    })) throw new InvalidActivationTransitionError(current.phase, nextState.phase);
    if (nextState.version !== expectedVersion + 1) throw new InvalidActivationVersionError(operationId, expectedVersion, nextState.version);
    const result = this.store.db.query(`UPDATE activation_operation SET revision_id = ?, config_name = ?, agent_id = ?, phase = ?, version = ?, plan_hash = ?, updated_at = ?, terminal_reason = ? WHERE operation_id = ? AND version = ?`).run(nextState.revisionId, nextState.configName, nextState.agentId, nextState.phase, nextState.version, nextState.planHash, nextState.updatedAt, nextState.terminalReason ?? null, operationId, expectedVersion);
    if (result.changes !== 1) throw new ConcurrencyConflictError(operationId, expectedVersion);
  }

  async claimApplying(operationId: string, expectedVersion: number, claimedAt: string): Promise<ActivationOperation> {
    const result = this.store.db.query('UPDATE activation_operation SET version = version + 1, updated_at = ? WHERE operation_id = ? AND version = ? AND phase = ?').run(claimedAt, operationId, expectedVersion, 'applying');
    if (result.changes !== 1) throw new ConcurrencyConflictError(operationId, expectedVersion);
    const claimed = await this.findById(operationId);
    if (claimed === null) throw new ConcurrencyConflictError(operationId, expectedVersion);
    return claimed;
  }

  async findById(operationId: string): Promise<ActivationOperation | null> {
    const row = this.store.db.query<Record<string, unknown>, [string]>(`SELECT ${COLUMNS} FROM activation_operation WHERE operation_id = ?`).get(operationId);
    return row === null ? null : fromRow(row);
  }

  async findLatest(): Promise<ActivationOperation | null> {
    const row = this.store.db.query<Record<string, unknown>, []>(`SELECT ${COLUMNS} FROM activation_operation ORDER BY updated_at DESC, rowid DESC LIMIT 1`).get();
    return row === null ? null : fromRow(row);
  }

  async findLatestForAgent(agentIdValue: ActivationOperation['agentId']): Promise<ActivationOperation | null> {
    const row = this.store.db.query<Record<string, unknown>, [string]>(`SELECT ${COLUMNS} FROM activation_operation WHERE agent_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1`).get(agentIdValue);
    return row === null ? null : fromRow(row);
  }
}
