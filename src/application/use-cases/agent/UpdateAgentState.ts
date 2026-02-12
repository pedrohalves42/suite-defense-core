import type { AgentRepository } from '@/application/ports/output/AgentRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { AgentState } from '@/domain/entities/Agent';
import { AgentId } from '@/domain/value-objects/AgentId';
import { AgentActivatedEvent, AgentDecommissionedEvent } from '@/domain/events/AgentEvents';
import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';

export interface UpdateAgentStateCommand {
  agentId: string;
  newState: string;
  reason?: string;
}

export interface UpdateAgentStateResult {
  agentId: string;
  oldState: string;
  newState: string;
}

/**
 * Use case: Transition an agent's lifecycle state.
 */
export class UpdateAgentState {
  constructor(
    private readonly agentRepo: AgentRepository,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async execute(command: UpdateAgentStateCommand): Promise<Result<UpdateAgentStateResult, ApplicationError>> {
    const agentIdResult = AgentId.create(command.agentId);
    if (agentIdResult.isFailure) {
      return Result.failure(new ApplicationError(`Invalid agent ID: ${command.agentId}`));
    }

    const agent = await this.agentRepo.findById(agentIdResult.value);
    if (!agent) {
      return Result.failure(new ApplicationError('Agent not found'));
    }

    const previousState = agent.state;
    const newState = command.newState as AgentState;

    const transitionResult = agent.transitionTo(newState);
    if (transitionResult.isFailure) {
      return Result.failure(new ApplicationError(transitionResult.error.message));
    }

    await this.agentRepo.save(agent);

    // Dispatch domain events
    if (newState === AgentState.ACTIVE) {
      await this.eventDispatcher.dispatch(
        new AgentActivatedEvent(command.agentId)
      );
    } else if (newState === AgentState.DECOMMISSIONED) {
      await this.eventDispatcher.dispatch(
        new AgentDecommissionedEvent(command.agentId, command.reason ?? 'Admin action')
      );
    }

    return Result.success({
      agentId: command.agentId,
      oldState: previousState,
      newState: agent.state,
    });
  }
}
