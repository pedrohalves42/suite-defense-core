import type { ProcessUpdateStatusUseCase, ProcessUpdateStatusCommand, ProcessUpdateStatusResult } from '../ports/input/ProcessUpdateStatusUseCase';
import type { AgentUpdateRepository } from '../ports/output/AgentUpdateRepository';
import type { DomainEventDispatcher } from '../ports/output/DomainEventDispatcher';
import { UpdateDownloadStartedEvent, UpdateCompletedEvent, UpdateFailedEvent } from '@/domain/events/UpdateEvents';
import { BusinessRuleViolationError } from '@/domain/shared/DomainError';

export class ProcessUpdateStatus implements ProcessUpdateStatusUseCase {
  constructor(
    private readonly updateRepo: AgentUpdateRepository,
    private readonly eventDispatcher: DomainEventDispatcher
  ) {}

  async execute(command: ProcessUpdateStatusCommand): Promise<ProcessUpdateStatusResult> {
    const update = await this.updateRepo.findById(command.updateId);
    if (!update) {
      throw new BusinessRuleViolationError(`Update ${command.updateId} not found`);
    }

    const previousStatus = update.status;

    switch (command.newStatus) {
      case 'downloading':
        update.startDownload();
        await this.eventDispatcher.dispatch(
          new UpdateDownloadStartedEvent(update.agentId.value, update.id)
        );
        break;

      case 'applying':
        update.completeDownload();
        update.startApply();
        break;

      case 'completed':
        update.complete();
        await this.eventDispatcher.dispatch(
          new UpdateCompletedEvent(update.agentId.value, update.id, '')
        );
        break;

      case 'failed':
        update.fail(command.errorMessage || 'Unknown error');
        await this.eventDispatcher.dispatch(
          new UpdateFailedEvent(update.agentId.value, update.id, command.errorMessage || 'Unknown error')
        );
        break;
    }

    await this.updateRepo.save(update);

    return {
      updateId: update.id,
      previousStatus,
      currentStatus: update.status,
    };
  }
}
