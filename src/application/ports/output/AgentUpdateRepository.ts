import { AgentUpdate } from '@/domain/entities/AgentUpdate';
import { AgentId } from '@/domain/value-objects/AgentId';

/**
 * Output port: Persistence abstraction for AgentUpdate entities.
 */
export interface AgentUpdateRepository {
  findById(id: string): Promise<AgentUpdate | null>;

  /**
   * Find the most recent non-terminal update for an agent, if any.
   */
  findActiveByAgentId(agentId: AgentId): Promise<AgentUpdate | null>;

  save(update: AgentUpdate): Promise<void>;
}
