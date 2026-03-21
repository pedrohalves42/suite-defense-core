/**
 * useNormalizedEvents — Query the unified v_normalized_events view (Sprint 30)
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';

export interface NormalizedEvent {
  id: string;
  tenant_id: string;
  agent_id: string;
  event_time: string;
  event_category: string;
  event_type: string;
  process_name?: string;
  command_line?: string;
  file_hash?: string;
  file_path?: string;
  remote_address?: string;
  remote_port?: number;
  domain?: string;
  key_path?: string;
  user_name?: string;
  process_pid?: number;
  parent_process_pid?: number;
  parent_process_name?: string;
  mitre_technique_id?: string;
  mitre_tactic?: string;
  is_suspicious: boolean;
  detection_tags: string[];
  severity?: string;
  detection_name?: string;
  created_at: string;
}

export interface NormalizedEventFilters {
  searchTerm?: string;
  eventCategory?: string;
  suspiciousOnly?: boolean;
  agentId?: string;
  limit?: number;
}

export function useNormalizedEvents(filters: NormalizedEventFilters, enabled = true) {
  const { activeTenant, loading } = useActiveTenant();
  const limit = filters.limit ?? 200;

  return useQuery({
    queryKey: ['normalized-events', activeTenant?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from('v_normalized_events')
        .select('id, tenant_id, agent_id, event_time, event_category, event_type, process_name, command_line, file_path, remote_address, domain, key_path, user_name, mitre_technique_id, is_suspicious, detection_tags, severity, detection_name, created_at')
        .eq('tenant_id', activeTenant!.id)
        .order('event_time', { ascending: false })
        .limit(limit);

      if (filters.eventCategory && filters.eventCategory !== 'all') {
        query = query.eq('event_category', filters.eventCategory);
      }
      if (filters.suspiciousOnly) {
        query = query.eq('is_suspicious', true);
      }
      if (filters.agentId) {
        query = query.eq('agent_id', filters.agentId);
      }
      if (filters.searchTerm) {
        const term = filters.searchTerm;
        query = query.or(
          `process_name.ilike.%${term}%,command_line.ilike.%${term}%,file_path.ilike.%${term}%,remote_address.ilike.%${term}%,domain.ilike.%${term}%,key_path.ilike.%${term}%,detection_name.ilike.%${term}%,mitre_technique_id.ilike.%${term}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as NormalizedEvent[];
    },
    enabled: enabled && !loading && !!activeTenant?.id,
  });
}

export function useRetentionConfig() {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['telemetry-retention-config', activeTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('telemetry_retention_config')
        .select('id, tenant_id, event_category, retention_days, is_enabled, updated_at')
        .eq('tenant_id', activeTenant!.id)
        .order('event_category');
      if (error) throw error;
      return data || [];
    },
    enabled: !loading && !!activeTenant?.id,
  });
}

export function useEventSummaries(options?: { agentId?: string; category?: string; period?: string }) {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['telemetry-summaries', activeTenant?.id, options],
    queryFn: async () => {
      let query = supabase
        .from('telemetry_event_summaries')
        .select('*')
        .eq('tenant_id', activeTenant!.id)
        .order('period_start', { ascending: false })
        .limit(200);

      if (options?.agentId) query = query.eq('agent_id', options.agentId);
      if (options?.category) query = query.eq('event_category', options.category);
      if (options?.period) query = query.eq('summary_period', options.period);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !loading && !!activeTenant?.id,
  });
}
