import { supabase } from '@/integrations/supabase/client';
import { useRealtimeQuery } from './useRealtimeQuery';

interface SystemAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  resolved_at: string | null;
}

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
    queryFn: async (): Promise<SystemAlert[]> => {
      if (!tenantId) return [];
      // TS2589: system_alerts has excessive FK relationships causing infinite type depth.
      // Cast to simpler table type to avoid TS2589, then cast result back.
      const from = supabase.from as (table: string) => ReturnType<typeof supabase.from<'active_sessions'>>;
      const builder = from('system_alerts')
        .select('id, alert_type, severity, title, description, is_active, created_at, resolved_at');
      
      let q = (builder as Record<string, CallableFunction>).eq('tenant_id', tenantId);
      if (activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data || []) as unknown as SystemAlert[];
    },
    realtimeTable: 'system_alerts',
    realtimeFilter: `tenant_id=eq.${tenantId}`,
    enabled: !!tenantId,
    staleTime: 300_000,
  });
}
