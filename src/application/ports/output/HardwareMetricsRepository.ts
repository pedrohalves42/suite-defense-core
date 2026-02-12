import { HardwareMetrics } from '../../../domain/entities/HardwareMetrics';
import { AgentId } from '../../../domain/value-objects/AgentId';

export interface HardwareMetricsRepository {
  save(metrics: HardwareMetrics): Promise<void>;
  getByAgentId(agentId: AgentId, limit?: number): Promise<HardwareMetrics[]>;
  getLatestByAgentId(agentId: AgentId): Promise<HardwareMetrics | null>;
}
