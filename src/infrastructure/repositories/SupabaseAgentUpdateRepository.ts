import type { AgentUpdateRepository } from '@/application/ports/output/AgentUpdateRepository';
import { AgentUpdate } from '@/domain/entities/AgentUpdate';
import { AgentId } from '@/domain/value-objects/AgentId';
import { AgentUpdateMapper } from '../mappers/AgentUpdateMapper';
import type { SupabaseClient } from '@supabase/supabase-js';

const TABLE = 'agent_updates';
const TERMINAL_STATUSES = ['completed', 'failed', 'rolled_back'];

/**
 * Supabase adapter implementing the AgentUpdateRepository output port.
 */
export class SupabaseAgentUpdateRepository implements AgentUpdateRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findById(id: string): Promise<AgentUpdate | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to find update: ${error.message}`);
    if (!data) return null;

    return AgentUpdateMapper.toDomain(data);
  }

  async findActiveByAgentId(agentId: AgentId): Promise<AgentUpdate | null> {
    // Find the most recent non-terminal update for this agent
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('agent_id', agentId.value)
      .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed to find active update: ${error.message}`);
    if (!data) return null;

    return AgentUpdateMapper.toDomain(data);
  }

  async save(update: AgentUpdate): Promise<void> {
    const row = AgentUpdateMapper.toPersistence(update);
    const { error } = await this.client
      .from(TABLE)
      .upsert(row, { onConflict: 'id' });

    if (error) throw new Error(`Failed to save update: ${error.message}`);
  }
}
