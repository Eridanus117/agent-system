import type { AgentId } from '../../domain/agent';
import type { AgentScheduleIntent } from '../../domain/schedule';

export interface AgentScheduleRepository {
  save(schedule: AgentScheduleIntent): Promise<void>;
  findById(scheduleId: string): Promise<AgentScheduleIntent | null>;
  listByAgent(agentId: AgentId): Promise<readonly AgentScheduleIntent[]>;
}
