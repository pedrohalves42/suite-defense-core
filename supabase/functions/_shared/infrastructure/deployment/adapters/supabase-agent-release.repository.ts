
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Database } from '../../../database.types.ts';
import { Release, Agent } from '../../../../domain/deployment/entities.ts';
import { IAgentReleaseRepository } from '../../../../domain/deployment/ports/agent-release.repository.ts';

export class SupabaseAgentReleaseRepository implements IAgentReleaseRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async getLatestActiveRelease(platform: string): Promise<Release | null> {
    const { data, error } = await this.supabase
      .from('agent_releases')
      .select('*')
      .eq('platform', platform)
      .eq('channel', 'stable')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as Release | null;
  }

  async getReleaseByVersion(version: string, platform: string): Promise<Release | null> {
    const { data, error } = await this.supabase
      .from('agent_releases')
      .select('*')
      .eq('version', version)
      .eq('platform', platform)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    return data as Release | null;
  }

  async updateAgentForceUpdate(agentId: string, update: Partial<Agent>): Promise<void> {
    const { error } = await this.supabase
      .from('agents')
      .update(update as any)
      .eq('id', agentId);

    if (error) throw error;
  }

  async clearForceUpdateFlag(agentId: string, reason: string | null): Promise<void> {
    const { error } = await this.supabase
      .from('agents')
      .update({
        force_update_version: null,
        force_update_reason: reason,
        force_update_at: null,
        force_update_delivered_count: 0,
        force_update_first_delivered_at: null,
        force_update_override_safe_mode: false,
        force_update_override_safe_mode_expires_at: null,
      })
      .eq('id', agentId);

    if (error) throw error;
  }
}
