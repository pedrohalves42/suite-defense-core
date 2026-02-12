import type { AgentRepository } from '@/application/ports/output/AgentRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { AgentLifecycleState } from '@/domain/entities/Agent';
import { AgentId } from '@/domain/value-objects/AgentId';
import { AgentActivatedEvent, AgentDecommissionedEvent } from '@/domain/events/AgentEvents';
import { BusinessRuleViolationError } from '@/domain/shared/DomainError';

export interface UpdateAgentStateCommand {
  agentId: string;
  newState: string;
  reason?: string;
}

export interface UpdateAgentStateResult {
  agentId: string;
  previousState: string;
  currentState: string;
}

/**
 * Use case: Transition an agent's lifecycle state.
 */
export class UpdateAgentState {
  constructor(
    private readonly agentRepo: AgentRepository,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async execute(command: UpdateAgentStateCommand): Promise<UpdateAgentStateResult> {
    const agentIdResult = AgentId.create(command.agentId);
    if (agentIdResult.isFailure) {
      throw new BusinessRuleViolationError(`Invalid agent ID: ${command.agentId}`);
    }

    const agent = await this.agentRepo.findById(agentIdResult.value);
    if (!agent) {
      throw new BusinessRuleViolationError(`Agent ${command.agentId} not found`);
    }

    const previousState = agent.state;
    const newState = command.newState as AgentLifecycleState;

    agent.transitionTo(newState);
    await this.agentRepo.save(agent);

    // Dispatch domain events
    if (newState === AgentLifecycleState.ACTIVE) {
      await this.eventDispatcher.dispatch(
        new AgentActivatedEvent(command.agentId)
      );
    } else if (newState === AgentLifecycleState.DECOMMISSIONED) {
      await this.eventDispatcher.dispatch(
        new AgentDecommissionedEvent(command.agentId, command.reason ?? 'Admin action')
      );
    }

    return {
      agentId: command.agentId,
      previousState,
      currentState: agent.state,
    };
  }
}
