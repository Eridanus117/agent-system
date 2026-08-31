import type { ActivationOperation } from '../../domain/activation-operation';
import type { AgentId } from '../../domain/agent';

export interface ActivationOperationRepository {
  insert(operation: ActivationOperation): Promise<void>;
  updateIfVersion(operationId: string, expectedVersion: number, nextState: ActivationOperation): Promise<void>;
  claimApplying(operationId: string, expectedVersion: number, claimedAt: string): Promise<ActivationOperation>;
  findById(operationId: string): Promise<ActivationOperation | null>;
  findLatestForAgent(agentId: AgentId): Promise<ActivationOperation | null>;
  findLatest(): Promise<ActivationOperation | null>;
}

