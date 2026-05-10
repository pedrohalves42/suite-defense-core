import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AgentLifecycleState, DashboardAgentCard, LifecycleStage } from '@/types/agent-lifecycle';

interface PipelineMetricsData {
  total_generated: number; total_downloaded: number; total_command_copied: number;
  total_installed: number; total_active: number; total_stuck: number;
  success_rate_pct: number; avg_install_time_seconds: number;
  conversion_rate_generated_to_installed_pct: number; conversion_rate_copied_to_installed_pct: number;
}

export function useAgentLifecycle(tenantId: string | undefined, loading?: boolean) {
  return useQuery<DashboardAgentCard[]>({
    queryKey: ['agent-lifecycle', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('v_agent_lifecycle_state')
        .select('id, agent_id, agent_name, display_name, status, agent_state, lifecycle_stage, generated_at, downloaded_at, command_copied_at, installed_at, enrolled_at, last_heartbeat, archived_at, archived_reason, is_stuck, tenant_id, minutes_since_heartbeat, minutes_since_enrollment, installation_time_seconds, last_error_message, installation_metadata')
        .eq('tenant_id', tenantId)
        .order('enrolled_at', { ascending: false });

      if (error) throw new Error(`Erro ao buscar agentes: ${error.message}`);

      // Transform AgentLifecycleState to DashboardAgentCard
      return (data as unknown as AgentLifecycleState[]).map(transformToCard);
    },
    enabled: !loading && !!tenantId,  // V-503a: Guard para sincronização
    staleTime: 30000, // Cache por 30s
    retry: 2, // Tentar 2 vezes antes de falhar
    retryDelay: 1000, // Esperar 1s entre tentativas
  });
}

function transformToCard(state: AgentLifecycleState): DashboardAgentCard {
  const statusBadge = getStatusBadge(state);
  const is_offline = state.lifecycle_stage === 'installed_offline' || 
                    (state.minutes_since_heartbeat !== null && state.minutes_since_heartbeat > 5);
  
  
  return {
    agent_id: state.agent_id ?? '',
    agent_name: state.agent_name ?? 'Unknown',
    lifecycle_stage: (state.lifecycle_stage as LifecycleStage) ?? 'unknown',
    status_badge: statusBadge,
    
    timeline: {
      generated: !!state.generated_at,
      downloaded: !!state.downloaded_at,
      command_copied: !!state.command_copied_at,
      installed: !!state.installed_at,
      active: state.lifecycle_stage === 'active'
    },
    
    metrics: {
      uptime_minutes: state.minutes_since_enrollment ?? null,
      install_time_seconds: state.installation_time_seconds ?? null,
      last_seen: state.last_heartbeat ?? null
    },
    
    flags: {
      is_stuck: state.is_stuck ?? false,
      has_errors: !!state.last_error_message,
      is_offline: is_offline
    },
    
    actions: {
      can_retry_install: (state.is_stuck ?? false) || !!state.last_error_message,
      can_view_logs: !!state.installation_metadata,
      can_delete: true
    }
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
  const stage = state.lifecycle_stage ?? 'unknown';
  switch (stage) {
    case 'active':
      return is_offline ? { label: 'Instalado (Offline)', color: 'warning' } : { label: 'Ativo', color: 'success' };
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

export function usePipelineMetrics(tenantId: string | undefined, hoursBack: number | null = null, loading?: boolean) {
  return useQuery({
    queryKey: ['pipeline-metrics', tenantId, hoursBack],
    queryFn: async () => {
      if (!tenantId) return null;

      const body: Record<string, unknown> = { tenant_id: tenantId };
      if (hoursBack !== null) {
        body.hours_back = hoursBack;
      }

      const { callGateway } = await import('@/lib/gateway');
      const data = await callGateway<{ success: boolean; metrics: PipelineMetricsData; error?: string }>('check', 'get-installation-pipeline-metrics', body);

      if (!data?.success) throw new Error(data?.error || 'Erro desconhecido');
      return data.metrics;
    },
    enabled: !loading && !!tenantId,  // V-503b: Guard para sincronização
    refetchInterval: false,
    staleTime: 300_000,
    refetchOnWindowFocus: true,
    retry: 2, // Tentar 2 vezes antes de falhar
    retryDelay: 1000, // Esperar 1s entre tentativas
  });
}

export function useFailureRate(tenantId: string | undefined, hoursBack: number = 1, loading?: boolean) {
  
  return useQuery({
    queryKey: ['failure-rate', tenantId, hoursBack],
    queryFn: async () => {
      if (!tenantId) return null;

      const { data, error } = await supabase.rpc('check_installation_failure_rate', {
        p_tenant_id: tenantId,
        p_hours_back: hoursBack,
        p_threshold_pct: 30.0
      });

      if (error) throw new Error(`Erro ao buscar taxa de falha: ${error.message}`);
      
      return data && data.length > 0 ? data[0] : null;
    },
    enabled: !loading && !!tenantId,  // V-503c: Guard para sincronização
    refetchInterval: false,
    staleTime: 300_000,
    retry: 2,
    retryDelay: 1000
  });
}

export function useInstallationLogs(filters?: {
  tenantId?: string; // V-4001: Add tenant filter
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
        .select('id, tenant_id, agent_id, agent_name, event_type, platform, success, installation_method, installation_time_seconds, error_message, network_connectivity, metadata, created_at')
        .order('created_at', { ascending: false });

      // V-4001 FIX: Always filter by tenant to prevent cross-tenant data access
      if (filters?.tenantId) {
        query = query.eq('tenant_id', filters.tenantId);
      }
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
    enabled: !!filters?.tenantId, // V-4001: Only query when tenant is known
  });
}
