import type { ScheduleUpdateUseCase, ScheduleUpdateCommand, ScheduleUpdateResult } from '../ports/input/ScheduleUpdateUseCase';
import type { UpdatePackageRepository } from '../ports/output/UpdatePackageRepository';
import type { AgentUpdateRepository } from '../ports/output/AgentUpdateRepository';
import type { DomainEventDispatcher } from '../ports/output/DomainEventDispatcher';
import { AgentUpdate } from '@/domain/entities/AgentUpdate';
import { UpdateScheduledEvent } from '@/domain/events/UpdateEvents';
import { BusinessRuleViolationError } from '@/domain/shared/DomainError';

export class ScheduleUpdate implements ScheduleUpdateUseCase {
  constructor(
    private readonly packageRepo: UpdatePackageRepository,
    private readonly updateRepo: AgentUpdateRepository,
    private readonly eventDispatcher: DomainEventDispatcher
  ) {}

  async execute(command: ScheduleUpdateCommand): Promise<ScheduleUpdateResult> {
    // Prevent duplicate active updates
    const existing = await this.updateRepo.findActiveByAgentId(command.agentId);
    if (existing) {
      throw new BusinessRuleViolationError(
        `Agent ${command.agentId.value} already has an active update (${existing.id})`
      );
    }

    // Validate package exists
    const pkg = await this.packageRepo.findById(command.packageId);
    if (!pkg) {
      throw new BusinessRuleViolationError(
        `Update package ${command.packageId.value} not found`
      );
    }
    if (!pkg.isActive) {
      throw new BusinessRuleViolationError(
        `Update package ${command.packageId.value} is not active`
      );
    }

    const agentUpdate = AgentUpdate.create(command.agentId, command.packageId);
    await this.updateRepo.save(agentUpdate);

    await this.eventDispatcher.dispatch(
      new UpdateScheduledEvent(command.agentId.value, command.packageId.value)
    );

    return {
      updateId: agentUpdate.id,
      status: agentUpdate.status,
    };
  }
}
