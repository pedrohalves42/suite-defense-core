
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export class SystemHealthRepository {
  constructor(private supabase: SupabaseClient) {}

  async getRecentAgentHeartbeats(oneHourAgo: string) {
    return await this.supabase
      .from('agents')
      .select('id, agent_name, last_heartbeat')
      .gte('last_heartbeat', oneHourAgo)
      .neq('status', 'inactive');
  }

  async getActiveAgentsCount() {
    return await this.supabase
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .in('status', ['active', 'pending']);
  }

  async getInstallationAnalytics(oneDayAgo: string) {
    return await this.supabase
      .from('installation_analytics')
      .select('success, event_type')
      .gte('created_at', oneDayAgo)
      .in('event_type', ['post_installation', 'post_installation_unverified']);
  }

  async getQueuedStuckJobsCount(thirtyMinutesAgo: string) {
    return await this.supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued')
      .lt('created_at', thirtyMinutesAgo);
  }

  async createSystemAlert(alert: any) {
    return await this.supabase.from('system_alerts').insert(alert);
  }
}
