import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/hooks/useTenant';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

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

// V-1026 FIX: Add tenant_id filter to prevent cross-tenant data leakage
export function useAgentExecutionHealth() {
  const adaptiveInterval = useAdaptivePolling(300000);
  const { tenant, loading } = useTenant();

  return useQuery({
    queryKey: ['agent-execution-health', tenant?.id],
    queryFn: async (): Promise<AgentExecutionHealth[]> => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('v_agent_execution_health')
        .select('agent_id, agent_name, tenant_id, status, last_heartbeat, agent_mode, agent_version, minutes_since_heartbeat, last_execution_at, minutes_since_execution, stale_queued_jobs, stale_delivered_jobs, pending_jobs, health_status, severity, health_description, checked_at')
        .eq('tenant_id', tenant.id)
        .order('severity', { ascending: false });

      if (error) throw error;
      return (data || []) as any as AgentExecutionHealth[];
    },
    enabled: !loading && !!tenant?.id,
    refetchInterval: adaptiveInterval
  });
}

// V-1026 FIX: Add tenant_id filter
export function useUnhealthyAgents() {
  const { tenant, loading } = useTenant();

  return useQuery<AgentExecutionHealth[]>({
    queryKey: ['unhealthy-agents', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('v_agent_execution_health')
        .select('agent_id, agent_name, tenant_id, status, last_heartbeat, agent_mode, agent_version, minutes_since_heartbeat, last_execution_at, minutes_since_execution, stale_queued_jobs, stale_delivered_jobs, pending_jobs, health_status, severity, health_description, checked_at')
        .eq('tenant_id', tenant.id)
        .neq('health_status', 'healthy')
        .order('severity', { ascending: false });

      if (error) throw error;
      return (data || []) as AgentExecutionHealth[];
    },
    enabled: !loading && !!tenant?.id,
    refetchInterval: adaptiveInterval
  });
}

// V-1026 FIX: Add tenant_id filter
export function useNonExecutionAlerts() {
  const { tenant, loading } = useTenant();

  return useQuery({
    queryKey: ['non-execution-alerts', tenant?.id],
    queryFn: async (): Promise<NonExecutionAlert[]> => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('system_alerts')
        .select('id, tenant_id, agent_id, alert_type, severity, title, message, resolved, resolved_at, created_at, details')
        .eq('tenant_id', tenant.id)
        .eq('alert_type', 'non_execution_detected')
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as NonExecutionAlert[];
    },
    enabled: !loading && !!tenant?.id,
    refetchInterval: adaptiveInterval
  });
}

/**
 * Hook para resolver alertas com suporte a gate humano para críticos
 * PASSO 2: Gate Humano para Alertas Críticos (+15 pts score)
 * 
 * Alertas críticos requerem:
 * - resolved_by preenchido (enforced via trigger)
 * - resolution_notes obrigatórias
 * - decision_event criado para rastreabilidade
 */
export function useResolveAlert() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ 
      alertId, 
      resolutionNotes
    }: { 
      alertId: string; 
      resolutionNotes?: string;
    }) => {
      // 1. Get current user (required for critical alerts)
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');
      if (!tenant?.id) throw new Error('Tenant not selected');

      // 2. Get alert details to check severity — V-1027 FIX: Add tenant_id filter
      const { data: alert, error: alertError } = await supabase
        .from('system_alerts')
        .select('severity, tenant_id')
        .eq('id', alertId)
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (alertError || !alert) throw new Error(alertError?.message || 'Alert not found');

      // 3. Validate resolution notes for critical alerts
      if (alert.severity === 'critical' && (!resolutionNotes || resolutionNotes.trim().length < 5)) {
        throw new Error('Alertas críticos requerem notas de resolução (mínimo 5 caracteres)');
      }

      // 4. Update the alert with resolved_by (required by trigger for critical)
      // V-1027 FIX: Add tenant_id filter to prevent cross-tenant resolution
      const { error: updateError } = await supabase
        .from('system_alerts')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id
        })
        .eq('id', alertId)
        .eq('tenant_id', tenant.id);

      if (updateError) throw updateError;

      // 5. Create decision_event for critical alerts
      // V-1027 FIX: Use validated tenant.id instead of alert.tenant_id
      if (alert.severity === 'critical') {
        await supabase.from('decision_events').insert({
          tenant_id: tenant.id,
          rule_code: 'CRITICAL_ALERT_RESOLUTION',
          action: 'resolve_critical_alert',
          evidence: {
            alert_id: alertId,
            severity: alert.severity,
            resolution_notes: resolutionNotes,
            resolved_by: user.id,
            user_email: user.email
          },
          decision_source: 'human',
          decision_type: 'alert_resolution'
        });

        // 6. Update the alert with decision_event reference
        const { data: decisionEvent } = await supabase
          .from('decision_events')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('rule_code', 'CRITICAL_ALERT_RESOLUTION')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (decisionEvent) {
          await supabase
            .from('system_alerts')
            .update({ decision_event_id: decisionEvent.id })
            .eq('id', alertId)
            .eq('tenant_id', tenant.id);
        }
      }

      return { success: true, alertId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['non-execution-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['decision-events'] });
      toast({
        title: 'Alerta resolvido',
        description: 'O alerta foi marcado como resolvido.'
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao resolver alerta',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive'
      });
    }
  });
}

/**
 * Hook para resolver múltiplos alertas (apenas não-críticos)
 * Alertas críticos devem ser resolvidos individualmente com useResolveAlert
 */
export function useResolveAllAlerts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ 
      alertIds, 
      resolutionNotes 
    }: { 
      alertIds: string[]; 
      resolutionNotes?: string;
    }) => {
      // 1. Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');
      if (!tenant?.id) throw new Error('Tenant not selected');

      // 2. Check if any alerts are critical (they require individual resolution)
      // V-1028 FIX: Add tenant_id filter
      const { data: criticalAlerts } = await supabase
        .from('system_alerts')
        .select('id')
        .in('id', alertIds)
        .eq('tenant_id', tenant.id)
        .eq('severity', 'critical');

      if (criticalAlerts && criticalAlerts.length > 0) {
        throw new Error(`${criticalAlerts.length} alerta(s) crítico(s) devem ser resolvidos individualmente`);
      }

      // 3. Update all non-critical alerts — V-1028 FIX: Add tenant_id filter
      const { error: updateError } = await supabase
        .from('system_alerts')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id
        })
        .in('id', alertIds)
        .eq('tenant_id', tenant.id);

      if (updateError) throw updateError;

      return { success: true, count: alertIds.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['non-execution-alerts'] });
      toast({
        title: 'Alertas resolvidos',
        description: `${data.count} alerta(s) marcado(s) como resolvido(s).`
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao resolver alertas',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive'
      });
    }
  });
}

export { getHealthStatusTextColor as useHealthStatusColor, getSeverityCombo as useSeverityColor } from '@/lib/severityColors';

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
