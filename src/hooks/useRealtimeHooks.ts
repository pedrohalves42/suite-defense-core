import { supabase } from '@/integrations/supabase/client';
import { useRealtimeQuery } from './useRealtimeQuery';

/**
 * Realtime-powered hook for agents list.
 * Subscribes to postgres_changes on public.agents filtered by tenant_id.
 * Replaces polling-based queries for agent lists.
 */
export function useRealtimeAgents(tenantId: string | undefined, select = 'id, agent_name, status, hostname, os_type, last_heartbeat, agent_version, created_at') {
  return useRealtimeQuery({
    queryKey: ['rt-agents', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('agents')
        .select(select)
        .eq('tenant_id', tenantId)
        .order('last_heartbeat', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    realtimeTable: 'agents',
    realtimeFilter: `tenant_id=eq.${tenantId}`,
    enabled: !!tenantId,
    staleTime: 300_000,
  });
}

/**
 * Realtime-powered hook for jobs list.
 */
export function useRealtimeJobs(tenantId: string | undefined, opts?: { status?: string; limit?: number }) {
  const { status, limit = 50 } = opts || {};
  return useRealtimeQuery({
    queryKey: ['rt-jobs', tenantId, status, limit],
    queryFn: async () => {
      if (!tenantId) return [];
      let query = supabase
        .from('jobs')
        .select('id, type, status, agent_id, created_at, started_at, completed_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    realtimeTable: 'jobs',
    realtimeFilter: `tenant_id=eq.${tenantId}`,
    enabled: !!tenantId,
    staleTime: 120_000,
  });
}

/**
 * Realtime-powered hook for system alerts.
 */
export function useRealtimeAlerts(tenantId: string | undefined, opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? true;
  return useRealtimeQuery({
    queryKey: ['rt-alerts', tenantId, activeOnly],
    queryFn: async () => {
      if (!tenantId) return [];
      const baseQuery = supabase
        .from('system_alerts')
        .select('id, alert_type, severity, title, description, is_active, created_at, resolved_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100);
      const finalQuery = activeOnly ? baseQuery.eq('is_active', true) : baseQuery;
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    realtimeTable: 'system_alerts',
    realtimeFilter: `tenant_id=eq.${tenantId}`,
    enabled: !!tenantId,
    staleTime: 300_000,
  });
}
