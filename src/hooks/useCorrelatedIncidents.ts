/**
 * useCorrelatedIncidents — React Query hooks for the correlation engine.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';

export interface CorrelatedIncident {
  id: string;
  tenant_id: string;
  title: string;
  description?: string;
  severity: string;
  confidence_score: number;
  status: string;
  mitre_tactics: string[];
  mitre_techniques: string[];
  affected_agents: string[];
  event_count: number;
  first_event_time: string;
  last_event_time: string;
  correlation_rule?: string;
  assigned_to?: string;
  resolved_at?: string;
  resolution_notes?: string;
  created_at: string;
}

export interface IncidentEvent {
  id: string;
  incident_id: string;
  event_type: string;
  event_summary: string;
  event_time: string;
  agent_id: string;
  severity: string;
  event_data: Record<string, unknown>;
}

export function useCorrelatedIncidents(options?: { status?: string; limit?: number }) {
  const { activeTenant, loading } = useActiveTenant();
  const limit = options?.limit ?? 50;

  return useQuery({
    queryKey: ['correlated-incidents', activeTenant?.id, options?.status, limit],
    queryFn: async () => {
      let query = supabase
        .from('correlated_incidents')
        .select('*')
        .eq('tenant_id', activeTenant!.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (options?.status) query = query.eq('status', options.status);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as CorrelatedIncident[];
    },
    enabled: !loading && !!activeTenant?.id,
    refetchInterval: 30_000,
  });
}

export function useIncidentEvents(incidentId: string) {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['incident-events', activeTenant?.id, incidentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('correlated_incident_events')
        .select('*')
        .eq('incident_id', incidentId)
        .eq('tenant_id', activeTenant!.id)
        .order('event_time', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as IncidentEvent[];
    },
    enabled: !loading && !!activeTenant?.id && !!incidentId,
  });
}

export function useUpdateIncidentStatus() {
  const { activeTenant } = useActiveTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ incidentId, status, notes }: { incidentId: string; status: string; notes?: string }) => {
      if (!activeTenant?.id) throw new Error('Tenant not found');
      const update: any = { status, updated_at: new Date().toISOString() };
      if (status === 'resolved') {
        update.resolved_at = new Date().toISOString();
        update.resolution_notes = notes || '';
      }
      // V-3012 FIX: Add tenant_id filter to prevent cross-tenant updates
      const { error } = await supabase
        .from('correlated_incidents')
        .update(update)
        .eq('id', incidentId)
        .eq('tenant_id', activeTenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correlated-incidents'] });
    },
  });
}
