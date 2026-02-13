import type { NetworkMetrics } from '@/domain/entities/NetworkMetrics';
import type { AgentId } from '@/domain/value-objects/AgentId';

export interface NetworkMetricsRepository {
  save(metrics: NetworkMetrics): Promise<void>;
  saveBatch(metrics: NetworkMetrics[]): Promise<void>;
  findLatestByAgent(agentId: AgentId): Promise<NetworkMetrics[]>;
}
