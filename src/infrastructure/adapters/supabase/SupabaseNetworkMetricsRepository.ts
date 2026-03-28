import { supabase } from '@/integrations/supabase/client';
import type { NetworkMetricsRepository } from '@/application/ports/output/NetworkMetricsRepository';
import type { NetworkMetrics } from '@/domain/entities/NetworkMetrics';
import type { AgentId } from '@/domain/value-objects/AgentId';
import { NetworkMetricsMapper } from './mappers/NetworkMetricsMapper';

export class SupabaseNetworkMetricsRepository implements NetworkMetricsRepository {
  async save(metrics: NetworkMetrics): Promise<void> {
    const row = NetworkMetricsMapper.toPersistence(metrics);
    const { error } = await supabase.from('agent_network_metrics').insert(row as any);
    if (error) throw new Error(`Failed to save network metrics: ${error.message}`);
  }

  async saveBatch(metrics: NetworkMetrics[]): Promise<void> {
    if (metrics.length === 0) return;
    const rows = metrics.map(m => NetworkMetricsMapper.toPersistence(m));
    const { error } = await supabase.from('agent_network_metrics').insert(rows as any);
    if (error) throw new Error(`Failed to save network metrics batch: ${error.message}`);
  }

  async findLatestByAgent(agentId: AgentId): Promise<NetworkMetrics[]> {
    const { data, error } = await supabase
      .from('agent_network_metrics')
      .select('*')
      .eq('agent_id', agentId.toString())
      .order('collected_at', { ascending: false })
      .limit(50);

    if (error) throw new Error(`Failed to find network metrics: ${error.message}`);
    return (data ?? []).map(NetworkMetricsMapper.toDomain);
  }
}
