import type { Agent } from '@/domain/entities/Agent';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';

/**
 * Output port: Persistence abstraction for Agent entities.
 */
export interface AgentRepository {
  findById(id: AgentId): Promise<Agent | null>;

  findByNameAndTenant(name: string, tenantId: TenantId): Promise<Agent | null>;

  findActiveByTenant(tenantId: TenantId): Promise<Agent[]>;

  findOfflineAgents(thresholdDate: Date): Promise<Agent[]>;

  save(agent: Agent): Promise<void>;

  delete(id: AgentId): Promise<void>;
}
