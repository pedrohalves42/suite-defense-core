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

// TS2589 workaround: system_alerts causes infinite type depth in Supabase SDK due to excessive FK relationships.
// Extracting query to a helper with explicit return type breaks the deep type chain.
async function fetchAlerts(tenantId: string, activeOnly: boolean) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/system_alerts?select=id,alert_type,severity,title,description,is_active,created_at,resolved_at&tenant_id=eq.${tenantId}${activeOnly ? '&is_active=eq.true' : ''}&order=created_at.desc&limit=100`;
  const res = await fetch(url, {
    headers: {
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
    },
  });
  if (!res.ok) return { data: null, error: new Error(`${res.status} ${res.statusText}`) };
  const data = await res.json();
  return { data: data as SystemAlert[], error: null };
}

/**
 * Realtime-powered hook for agents list.
 * Subscribes to postgres_changes on public.agents filtered by tenant_id.
 * Replaces polling-based queries for agent lists.
 */
export function useRealtimeAgents(tenantId: string | undefined, select = 'id, agent_name, status, hostname, os_type, last_heartbeat, agent_version, created_at, enrolled_at', enabled = true) {
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
    realtimeFilter: tenantId ? `tenant_id=eq.${tenantId}` : undefined,
    enabled: enabled && !!tenantId,
    staleTime: 300_000,
  });
}

/**
 * Realtime-powered hook for jobs list.
 */
export function useRealtimeJobs(tenantId: string | undefined, opts?: { status?: string; limit?: number; enabled?: boolean }) {
  const { status, limit = 50, enabled = true } = opts || {};
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
    realtimeFilter: tenantId ? `tenant_id=eq.${tenantId}` : undefined,
    enabled: enabled && !!tenantId,
    staleTime: 120_000,
  });
}

/**
 * Realtime-powered hook for system alerts.
 */
export function useRealtimeAlerts(tenantId: string | undefined, opts?: { activeOnly?: boolean; enabled?: boolean }) {
  const activeOnly = opts?.activeOnly ?? true;
  const enabled = opts?.enabled ?? true;
  return useRealtimeQuery({
    queryKey: ['rt-alerts', tenantId, activeOnly],
    queryFn: async (): Promise<SystemAlert[]> => {
      if (!tenantId) return [];
      // TS2589: system_alerts has excessive FK relationships causing infinite type recursion.
      // Workaround: use postgrest-js directly to avoid deep type instantiation.
      const { data, error } = await fetchAlerts(tenantId, activeOnly);
      if (error) throw error;
      return (data || []) as SystemAlert[];
    },
    realtimeTable: 'system_alerts',
    realtimeFilter: tenantId ? `tenant_id=eq.${tenantId}` : undefined,
    enabled: enabled && !!tenantId,
    staleTime: 300_000,
  });
}
