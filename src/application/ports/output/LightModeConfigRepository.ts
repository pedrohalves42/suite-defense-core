import { LightModeConfig } from '../../../domain/entities/LightModeConfig';
import { AgentId } from '../../../domain/value-objects/AgentId';

export interface LightModeConfigRepository {
  save(config: LightModeConfig): Promise<void>;
  getByAgentId(agentId: AgentId): Promise<LightModeConfig | null>;
  getActiveConfigs(): Promise<LightModeConfig[]>;
  deleteByAgentId(agentId: AgentId): Promise<void>;
}
