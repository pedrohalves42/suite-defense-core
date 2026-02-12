import { ProcessSnapshot } from '../../../domain/entities/ProcessSnapshot';
import { AgentId } from '../../../domain/value-objects/AgentId';

export interface ProcessSnapshotRepository {
  save(snapshot: ProcessSnapshot): Promise<void>;
  getByAgentId(agentId: AgentId, limit?: number): Promise<ProcessSnapshot[]>;
  getLatestByAgentId(agentId: AgentId): Promise<ProcessSnapshot | null>;
  deleteOlderThan(agentId: AgentId, date: Date): Promise<void>;
}
