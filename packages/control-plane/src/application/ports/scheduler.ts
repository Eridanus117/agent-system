import type { AgentScheduleIntent, OrcaAutomationReceipt } from '../../domain/schedule';

export interface AgentSchedulerPort {
  create(input: AgentScheduleIntent): Promise<OrcaAutomationReceipt>;
  cancel(automationId: string): Promise<void>;
}
