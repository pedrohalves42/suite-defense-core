import type { AgentRepository } from '@/application/ports/output/AgentRepository';
import { Agent } from '@/domain/entities/Agent';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';
import { AgentMapper } from '../mappers/AgentMapper';
import type { SupabaseClient } from '@supabase/supabase-js';

const TABLE = 'agents';

/**
 * Supabase adapter implementing the AgentRepository output port.
 */
export class SupabaseAgentRepository implements AgentRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findById(id: AgentId): Promise<Agent | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('id', id.value)
      .maybeSingle();

    if (error) throw new Error(`Failed to find agent: ${error.message}`);
    if (!data) return null;

    return AgentMapper.toDomain(data);
  }

  async findByNameAndTenant(name: string, tenantId: TenantId): Promise<Agent | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('agent_name', name)
      .eq('tenant_id', tenantId.value)
      .maybeSingle();

    if (error) throw new Error(`Failed to find agent by name: ${error.message}`);
    if (!data) return null;

    return AgentMapper.toDomain(data);
  }

  async findActiveByTenant(tenantId: TenantId): Promise<Agent[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('tenant_id', tenantId.value)
      .eq('status', 'active');

    if (error) throw new Error(`Failed to find active agents: ${error.message}`);
    return (data ?? []).map(AgentMapper.toDomain);
  }

  async findOfflineAgents(thresholdDate: Date): Promise<Agent[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('status', 'active')
      .lt('last_seen', thresholdDate.toISOString());

    if (error) throw new Error(`Failed to find offline agents: ${error.message}`);
    return (data ?? []).map(AgentMapper.toDomain);
  }

  async save(agent: Agent): Promise<void> {
    const row = AgentMapper.toPersistence(agent);
    const { error } = await this.client
      .from(TABLE)
      .upsert(row, { onConflict: 'id' });

    if (error) throw new Error(`Failed to save agent: ${error.message}`);
  }

  async delete(id: AgentId): Promise<void> {
    const { error } = await this.client
      .from(TABLE)
      .delete()
      .eq('id', id.value);

    if (error) throw new Error(`Failed to delete agent: ${error.message}`);
  }
}
