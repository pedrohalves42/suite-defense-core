
import { Release, Agent } from '../entities.ts';

export interface IAgentReleaseRepository {
  getLatestActiveRelease(platform: string): Promise<Release | null>;
  getReleaseByVersion(version: string, platform: string): Promise<Release | null>;
  updateAgentForceUpdate(agentId: string, update: Partial<Agent>): Promise<void>;
  clearForceUpdateFlag(agentId: string, reason: string | null): Promise<void>;
}
