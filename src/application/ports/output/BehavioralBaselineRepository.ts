import type { BehavioralBaseline } from '@/domain/entities/BehavioralBaseline';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { BaselineType } from '@/domain/entities/BehavioralBaseline';

export interface BehavioralBaselineRepository {
  save(baseline: BehavioralBaseline): Promise<void>;
  findActiveByAgent(agentId: AgentId): Promise<BehavioralBaseline[]>;
  findByAgentAndType(agentId: AgentId, type: BaselineType): Promise<BehavioralBaseline | null>;
}
