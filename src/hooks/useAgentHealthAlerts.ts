import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AgentExecutionHealth {
  agent_id: string;
  agent_name: string;
  tenant_id: string;
  status: string;
  last_heartbeat: string | null;
  agent_mode: string | null;
  agent_version: string | null;
  minutes_since_heartbeat: number | null;
  last_execution_at: string | null;
  minutes_since_execution: number | null;
  stale_queued_jobs: number;
  stale_delivered_jobs: number;
  pending_jobs: number;
  health_status: string;
  severity: string;
  health_description: string;
  checked_at: string;
}

export interface NonExecutionAlert {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  alert_type: string;
  severity: string;
  title: string | null;
  message: string;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  details?: {
    health_status?: string;
    minutes_since_heartbeat?: number;
    minutes_since_execution?: number;
    stale_queued_jobs?: number;
    stale_delivered_jobs?: number;
    pending_jobs?: number;
    agent_mode?: string;
    detected_at?: string;
  } | null;
}

export function useAgentExecutionHealth() {
  return useQuery({
    queryKey: ['agent-execution-health'],
    queryFn: async (): Promise<AgentExecutionHealth[]> => {
      const { data, error } = await supabase
        .from('v_agent_execution_health')
        .select('*')
        .order('severity', { ascending: false });

      if (error) throw error;
      return (data || []) as AgentExecutionHealth[];
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useUnhealthyAgents() {
  return useQuery({
    queryKey: ['unhealthy-agents'],
    queryFn: async (): Promise<AgentExecutionHealth[]> => {
      const { data, error } = await supabase
        .from('v_agent_execution_health')
        .select('*')
        .neq('health_status', 'healthy')
        .order('severity', { ascending: false });

      if (error) throw error;
      return (data || []) as AgentExecutionHealth[];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useNonExecutionAlerts() {
  return useQuery({
    queryKey: ['non-execution-alerts'],
    queryFn: async (): Promise<NonExecutionAlert[]> => {
      const { data, error } = await supabase
        .from('system_alerts')
        .select('*')
        .eq('alert_type', 'non_execution_detected')
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as NonExecutionAlert[];
    },
    refetchInterval: 30000,
  });
}

export function useResolveAlert() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('system_alerts')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', alertId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['non-execution-alerts'] });
      toast({
        title: 'Alerta resolvido',
        description: 'O alerta foi marcado como resolvido.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao resolver alerta',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });
}

export function useResolveAllAlerts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (alertIds: string[]) => {
      const { error } = await supabase
        .from('system_alerts')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
        })
        .in('id', alertIds);

      if (error) throw error;
    },
    onSuccess: (_, alertIds) => {
      queryClient.invalidateQueries({ queryKey: ['non-execution-alerts'] });
      toast({
        title: 'Alertas resolvidos',
        description: `${alertIds.length} alerta(s) marcado(s) como resolvido(s).`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao resolver alertas',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });
}

export function useHealthStatusColor(status: string): string {
  switch (status) {
    case 'healthy':
      return 'text-green-500';
    case 'not_polling_jobs':
    case 'not_executing_jobs':
      return 'text-amber-500';
    case 'execution_stale':
      return 'text-orange-500';
    case 'safe_mode':
      return 'text-blue-500';
    case 'offline':
    case 'never_connected':
      return 'text-red-500';
    default:
      return 'text-muted-foreground';
  }
}

export function useSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'text-red-500 bg-red-500/10';
    case 'high':
      return 'text-orange-500 bg-orange-500/10';
    case 'medium':
      return 'text-amber-500 bg-amber-500/10';
    case 'low':
      return 'text-green-500 bg-green-500/10';
    default:
      return 'text-muted-foreground bg-muted/10';
  }
}

export function useHealthStatusLabel(status: string): string {
  switch (status) {
    case 'healthy':
      return 'Saudável';
    case 'not_polling_jobs':
      return 'Não buscando jobs';
    case 'not_executing_jobs':
      return 'Não executando';
    case 'execution_stale':
      return 'Execução estagnada';
    case 'safe_mode':
      return 'Modo seguro';
    case 'offline':
      return 'Offline';
    case 'never_connected':
      return 'Nunca conectou';
    default:
      return status;
  }
}
