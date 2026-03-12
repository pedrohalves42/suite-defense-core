/**
 * Hook for Incident Timeline Reconstruction
 * Fase 4: Incident Timeline Narrativa
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

export interface TimelineEvent {
  event_type: 'security_event' | 'job' | 'risk_decision' | 'playbook_execution' | 'system_alert';
  source_id: string;
  event_time: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  data: Record<string, unknown>;
}

export interface IncidentTimeline {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  incident_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  narrative_summary: string | null;
  timeline_events: TimelineEvent[];
  causal_chain: Array<{
    from: string;
    to: string;
    relationship: string;
  }>;
  root_cause: string | null;
  resolution: string | null;
  status: 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';
  started_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  agents?: { agent_name: string; hostname: string } | null;
}

export function useIncidentTimelines(status?: string) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['incident-timelines', tenant?.id, status],
    queryFn: async () => {
      if (!tenant?.id) return [];

      let query = supabase
        .from('incident_timelines')
        .select('*, agents:agent_id(agent_name, hostname)')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as IncidentTimeline[];
    },
    enabled: !!tenant?.id,
  });
}

export function useIncidentTimeline(incidentId: string) {
  return useQuery({
    queryKey: ['incident-timeline', incidentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incident_timelines')
        .select('*, agents:agent_id(agent_name, hostname)')
        .eq('id', incidentId)
        .single();

      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data as unknown as IncidentTimeline;
    },
    enabled: !!incidentId,
  });
}

export function useReconstructTimeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      agentId,
      startTime,
      endTime,
    }: {
      agentId: string;
      startTime: string;
      endTime: string;
    }) => {
      const { data, error } = await supabase.rpc('reconstruct_incident_timeline', {
        p_agent_id: agentId,
        p_start_time: startTime,
        p_end_time: endTime,
      });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = data as any as {
        success: boolean;
        error?: string;
        timeline?: TimelineEvent[];
        events_count?: number;
      };

      if (!result.success) {
        throw new Error(result.error || 'Failed to reconstruct timeline');
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident-timelines'] });
    },
    onError: (error) => {
      console.error('Failed to reconstruct timeline:', error);
      toast.error('Erro ao reconstruir timeline');
    },
  });
}

export function useUpdateIncidentStatus() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      incidentId,
      status,
      resolution,
    }: {
      incidentId: string;
      status: IncidentTimeline['status'];
      resolution?: string;
    }) => {
      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'resolved' || status === 'closed') {
        updates.resolved_at = new Date().toISOString();
      }

      if (resolution) {
        updates.resolution = resolution;
      }

      if (!tenant?.id) throw new Error('Tenant not found');
      // V-1034 FIX: Add tenant_id filter
      const { data, error } = await supabase
        .from('incident_timelines')
        .update(updates)
        .eq('id', incidentId)
        .eq('tenant_id', tenant.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident-timelines'] });
      toast.success('Status do incidente atualizado');
    },
    onError: (error) => {
      console.error('Failed to update incident status:', error);
      toast.error('Erro ao atualizar status');
    },
  });
}

export const INCIDENT_STATUS_LABELS: Record<IncidentTimeline['status'], string> = {
  open: 'Aberto',
  investigating: 'Investigando',
  contained: 'Contido',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

export const INCIDENT_STATUS_COLORS: Record<IncidentTimeline['status'], string> = {
  open: 'bg-red-500/10 text-red-500 border-red-500/20',
  investigating: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  contained: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  resolved: 'bg-green-500/10 text-green-500 border-green-500/20',
  closed: 'bg-muted text-muted-foreground border-border',
};

export const EVENT_TYPE_LABELS: Record<TimelineEvent['event_type'], string> = {
  security_event: 'Evento de Segurança',
  job: 'Tarefa',
  risk_decision: 'Decisão de Risco',
  playbook_execution: 'Execução de Playbook',
  system_alert: 'Alerta do Sistema',
};

export const EVENT_TYPE_ICONS: Record<TimelineEvent['event_type'], string> = {
  security_event: 'ShieldAlert',
  job: 'Cog',
  risk_decision: 'Scale',
  playbook_execution: 'Play',
  system_alert: 'Bell',
};
