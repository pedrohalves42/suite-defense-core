import type { AgentRepository } from '@/application/ports/output/AgentRepository';
import type { Agent } from '@/domain/entities/Agent';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';
import { AgentMapper } from '@/infrastructure/mappers/AgentMapper';
import { supabase } from '@/integrations/supabase/client';

/**
 * Supabase adapter for AgentRepository port.
 * Translates domain operations into Supabase queries.
 */
export class SupabaseAgentRepository implements AgentRepository {
  async findById(id: AgentId): Promise<Agent | null> {
    // TUNING v11: slim select — exclude heavy JSON columns
    const { data, error } = await supabase
      .from('agents')
      .select('id, tenant_id, agent_name, status, enrolled_at, last_heartbeat, agent_version, os_type, os_version, hostname, scheduling_paused, scheduling_paused_reason, is_isolated, is_throttled, safe_mode_reason, hmac_secret')
      .eq('id', id.value)
      .maybeSingle();

    if (error || !data) return null;
    return AgentMapper.toDomain(data);
  }

  async findByNameAndTenant(name: string, tenantId: TenantId): Promise<Agent | null> {
    const { data, error } = await supabase
      .from('agents')
      .select('id, tenant_id, agent_name, status, enrolled_at, last_heartbeat, agent_version, os_type, os_version, hostname, scheduling_paused, scheduling_paused_reason, is_isolated, is_throttled, safe_mode_reason, hmac_secret')
      .eq('agent_name', name)
      .eq('tenant_id', tenantId.value)
      .maybeSingle();

    if (error || !data) return null;
    return AgentMapper.toDomain(data);
  }

  async findActiveByTenant(tenantId: TenantId): Promise<Agent[]> {
    const { data, error } = await supabase
      .from('agents')
      .select('id, tenant_id, agent_name, status, enrolled_at, last_heartbeat, agent_version, os_type, os_version, hostname, scheduling_paused, scheduling_paused_reason, is_isolated, is_throttled, safe_mode_reason')
      .eq('tenant_id', tenantId.value)
      .eq('status', 'active')
      .limit(1000);

    if (error || !data) return [];
    return data.map(row => AgentMapper.toDomain(row));
  }

  async findOfflineAgents(thresholdDate: Date): Promise<Agent[]> {
    const { data, error } = await supabase
      .from('agents')
      .select('id, tenant_id, agent_name, status, last_heartbeat, agent_version, scheduling_paused, is_isolated')
      .eq('status', 'active')
      .lt('last_heartbeat', thresholdDate.toISOString())
      .limit(500);

    if (error || !data) return [];
    return data.map(row => AgentMapper.toDomain(row));
  }

  async save(agent: Agent): Promise<void> {
    const persistence = AgentMapper.toPersistence(agent);
    const { error } = await supabase
      .from('agents')
      .upsert(persistence);

    if (error) {
      throw new Error(`Failed to save agent: ${error.message}`);
    }
  }

  async delete(id: AgentId): Promise<void> {
    const { error } = await supabase
      .from('agents')
      .delete()
      .eq('id', id.value);

    if (error) {
      throw new Error(`Failed to delete agent: ${error.message}`);
    }
  }
}
