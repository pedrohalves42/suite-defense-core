import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AgentLifecycleState, DashboardAgentCard, LifecycleStage } from '@/types/agent-lifecycle';

export function useAgentLifecycle(tenantId: string | undefined) {
  return useQuery<DashboardAgentCard[]>({
    queryKey: ['agent-lifecycle', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('v_agent_lifecycle_state')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('enrolled_at', { ascending: false });

      if (error) throw error;

      // Transform AgentLifecycleState to DashboardAgentCard
      return (data as AgentLifecycleState[]).map(transformToCard);
    },
    enabled: !!tenantId,
  });
}

function transformToCard(state: AgentLifecycleState): DashboardAgentCard {
  const statusBadge = getStatusBadge(state);
  
  return {
    agent_id: state.agent_id,
    agent_name: state.agent_name,
    lifecycle_stage: state.lifecycle_stage,
    status_badge: statusBadge,
    
    timeline: {
      generated: !!state.generated_at,
      downloaded: !!state.downloaded_at,
      command_copied: !!state.command_copied_at,
      installed: !!state.installed_at,
      active: state.lifecycle_stage === 'active',
    },
    
    metrics: {
      uptime_minutes: state.minutes_since_enrollment,
      install_time_seconds: state.installation_time_seconds,
      last_seen: state.last_heartbeat,
    },
    
    flags: {
      is_stuck: state.is_stuck,
      has_errors: !!state.last_error_message,
      is_offline: state.lifecycle_stage === 'installed_offline' || 
                  (state.minutes_since_heartbeat !== null && state.minutes_since_heartbeat > 5),
    },
    
    actions: {
      can_retry_install: state.is_stuck || !!state.last_error_message,
      can_view_logs: !!state.installation_metadata,
      can_delete: true,
    },
  };
}

function getStatusBadge(state: AgentLifecycleState): DashboardAgentCard['status_badge'] {
  // Stuck installations (highest priority)
  if (state.is_stuck) {
    return { label: 'Travado', color: 'error' };
  }
  
  // Error states
  if (state.last_error_message) {
    return { label: 'Erro', color: 'error' };
  }
  
  // Based on lifecycle stage
  switch (state.lifecycle_stage) {
    case 'active':
      return { label: 'Ativo', color: 'success' };
    case 'installed_offline':
      return { label: 'Instalado (Offline)', color: 'warning' };
    case 'installing':
      return { label: 'Instalando', color: 'info' };
    case 'downloaded':
      return { label: 'Baixado', color: 'info' };
    case 'generated':
      return { label: 'Gerado', color: 'info' };
    default:
      return { label: 'Desconhecido', color: 'warning' };
  }
}

export function usePipelineMetrics(tenantId: string | undefined, hoursBack: number = 24) {
  return useQuery({
    queryKey: ['pipeline-metrics', tenantId, hoursBack],
    queryFn: async () => {
      if (!tenantId) return null;

      const { data, error } = await supabase.functions.invoke('get-installation-pipeline-metrics', {
        body: { tenant_id: tenantId, hours_back: hoursBack }
      });

      if (error) throw error;
      return data.metrics;
    },
    enabled: !!tenantId,
    refetchInterval: 60000, // Refetch every minute
  });
}

export function useInstallationLogs(filters?: {
  agentId?: string;
  agentName?: string;
  eventType?: string;
  success?: boolean;
  errorType?: string;
  platform?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['installation-logs', filters],
    queryFn: async () => {
      let query = supabase
        .from('installation_analytics')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.agentId) {
        query = query.eq('agent_id', filters.agentId);
      }
      if (filters?.agentName) {
        query = query.eq('agent_name', filters.agentName);
      }
      if (filters?.eventType) {
        query = query.eq('event_type', filters.eventType);
      }
      if (filters?.success !== undefined) {
        query = query.eq('success', filters.success);
      }
      if (filters?.platform) {
        query = query.eq('platform', filters.platform);
      }
      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }
      if (filters?.errorType) {
        query = query.ilike('error_message', `%${filters.errorType}%`);
      }

      const limit = filters?.limit || 100;
      query = query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}
