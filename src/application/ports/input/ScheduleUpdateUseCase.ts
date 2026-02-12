import { AgentId } from '@/domain/value-objects/AgentId';
import { UpdatePackageId } from '@/domain/value-objects/UpdatePackageId';

export interface ScheduleUpdateCommand {
  agentId: AgentId;
  packageId: UpdatePackageId;
}

export interface ScheduleUpdateResult {
  updateId: string;
  status: string;
}

/**
 * Input port: Schedules an update for a specific agent.
 */
export interface ScheduleUpdateUseCase {
  execute(command: ScheduleUpdateCommand): Promise<ScheduleUpdateResult>;
}
