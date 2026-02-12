import type { RollbackUpdateUseCase, RollbackUpdateCommand, RollbackUpdateResult } from '../ports/input/RollbackUpdateUseCase';
import type { AgentUpdateRepository } from '../ports/output/AgentUpdateRepository';
import type { DomainEventDispatcher } from '../ports/output/DomainEventDispatcher';
import { UpdateRolledBackEvent } from '@/domain/events/UpdateEvents';
import { BusinessRuleViolationError } from '@/domain/shared/DomainError';

export class RollbackUpdate implements RollbackUpdateUseCase {
  constructor(
    private readonly updateRepo: AgentUpdateRepository,
    private readonly eventDispatcher: DomainEventDispatcher
  ) {}

  async execute(command: RollbackUpdateCommand): Promise<RollbackUpdateResult> {
    const update = await this.updateRepo.findById(command.updateId);
    if (!update) {
      throw new BusinessRuleViolationError(`Update ${command.updateId} not found`);
    }

    const previousStatus = update.status;
    update.rollback(command.reason);
    await this.updateRepo.save(update);

    await this.eventDispatcher.dispatch(
      new UpdateRolledBackEvent(update.agentId.value, update.id, command.reason)
    );

    return {
      updateId: update.id,
      rolledBackFromStatus: previousStatus,
    };
  }
}
