import type { AgentId } from '../../domain/agent';
import type { DispatchOperation } from '../../domain/dispatch-operation';
import type { OrcaAutomationReceipt } from '../../domain/schedule';

export interface DispatchOperationRepository {
  save(operation: DispatchOperation): Promise<void>;
  findById(operationId: string): Promise<DispatchOperation | null>;
  listByAgent(agentId: AgentId): Promise<readonly DispatchOperation[]>;
  updatePhase(operationId: string, expectedPhase: DispatchOperation['phase'], nextState: DispatchOperation): Promise<void>;
  appendReceipt(operationId: string, receipt: OrcaAutomationReceipt): Promise<void>;
}
