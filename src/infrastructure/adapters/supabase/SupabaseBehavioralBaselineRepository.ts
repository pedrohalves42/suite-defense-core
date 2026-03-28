import { supabase } from '@/integrations/supabase/client';
import type { BehavioralBaselineRepository } from '@/application/ports/output/BehavioralBaselineRepository';
import type { BehavioralBaseline } from '@/domain/entities/BehavioralBaseline';
import type { BaselineType } from '@/domain/entities/BehavioralBaseline';
import type { AgentId } from '@/domain/value-objects/AgentId';
import { BehavioralBaselineMapper } from './mappers/BehavioralBaselineMapper';

export class SupabaseBehavioralBaselineRepository implements BehavioralBaselineRepository {
  async save(baseline: BehavioralBaseline): Promise<void> {
    const row = BehavioralBaselineMapper.toPersistence(baseline);
    const { error } = await supabase.from('agent_behavioral_baseline').upsert(row as never);
    if (error) throw new Error(`Failed to save behavioral baseline: ${error.message}`);
  }

  async findActiveByAgent(agentId: AgentId): Promise<BehavioralBaseline[]> {
    const { data, error } = await supabase
      .from('agent_behavioral_baseline')
      .select('*')
      .eq('agent_id', agentId.toString())
      .eq('is_active', true);

    if (error) throw new Error(`Failed to find baselines: ${error.message}`);
    return (data ?? []).map(BehavioralBaselineMapper.toDomain);
  }

  async findByAgentAndType(agentId: AgentId, type: BaselineType): Promise<BehavioralBaseline | null> {
    const { data, error } = await supabase
      .from('agent_behavioral_baseline')
      .select('*')
      .eq('agent_id', agentId.toString())
      .eq('baseline_type', type)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw new Error(`Failed to find baseline: ${error.message}`);
    return data ? BehavioralBaselineMapper.toDomain(data) : null;
  }
}
