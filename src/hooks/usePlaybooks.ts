import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import { toast } from 'sonner';
import { useEffect } from 'react';

export interface PlaybookAction {
  id: string;
  playbook_id: string;
  order_index: number;
  action_type: string;
  label: string;
  description: string | null;
  action_payload: Record<string, unknown>;
  risk_level: string;
}

export interface Playbook {
  id: string;
  tenant_id: string | null;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_conditions: Record<string, unknown>;
  severity: string;
  is_system: boolean;
  is_enabled: boolean;
  require_approval: boolean;
  cooldown_minutes: number;
  created_at: string;
  actions?: PlaybookAction[];
}

export interface PlaybookExecution {
  id: string;
  playbook_id: string | null;
  tenant_id: string;
  agent_id: string | null;
  trigger_event_id: string | null;
  trigger_source: string | null;
  trigger_context: Record<string, unknown>;
  triggered_at: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'ignored';
  executed_by: string | null;
  actions_taken: Array<{
    action_id: string;
    action_type: string;
    label: string;
    success: boolean;
    result?: Record<string, unknown>;
    error?: string;
    executed_at: string;
  }>;
  evidence_ids: string[];
  completed_at: string | null;
  notes: string | null;
  ignore_reason: string | null;
  playbook?: Playbook;
  agent?: {
    agent_name: string;
    hostname: string | null;
  };
}

export function usePlaybooks() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['playbooks', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playbooks')
        .select(`
          *,
          actions:playbook_actions(*)
        `)
        .or(`tenant_id.eq.${tenant?.id},is_system.eq.true`)
        .order('is_system', { ascending: false })
        .order('name');

      if (error) throw error;
      return data as Playbook[];
    },
    enabled: !!tenant?.id,
  });
}

export function usePendingPlaybookExecutions() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['playbook-executions-pending', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playbook_executions')
        .select(`
          *,
          playbook:playbooks(*),
          agent:agents(agent_name, hostname)
        `)
        .eq('tenant_id', tenant?.id)
        .eq('status', 'pending')
        .order('triggered_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as unknown as PlaybookExecution[];
    },
    enabled: !!tenant?.id,
    refetchInterval: 120000, // COST-OPT: 30s → 2min
    staleTime: 30_000,
  });

  // Subscribe to realtime updates
  useEffect(() => {
    if (!tenant?.id) return;

    const channel = supabase
      .channel('playbook-executions-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'playbook_executions',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          console.log('[usePlaybooks] Realtime update:', payload);
          queryClient.invalidateQueries({ 
            queryKey: ['playbook-executions-pending', tenant.id] 
          });
          queryClient.invalidateQueries({ 
            queryKey: ['playbook-executions-history', tenant.id] 
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, queryClient]);

  return query;
}

export function usePlaybookExecutionHistory(limit = 50) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['playbook-executions-history', tenant?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playbook_executions')
        .select(`
          *,
          playbook:playbooks(id, name, severity),
          agent:agents(agent_name, hostname)
        `)
        .eq('tenant_id', tenant?.id)
        .neq('status', 'pending')
        .order('triggered_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as unknown as PlaybookExecution[];
    },
    enabled: !!tenant?.id,
  });
}

export function useExecutePlaybook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      executionId, 
      actionIndex, 
      notes 
    }: { 
      executionId: string; 
      actionIndex?: number;
      notes?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('execute-playbook-action', {
        body: {
          execution_id: executionId,
          action_index: actionIndex,
          notes,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      toast.success('Ações do playbook executadas com sucesso');
      queryClient.invalidateQueries({ queryKey: ['playbook-executions-pending'] });
      queryClient.invalidateQueries({ queryKey: ['playbook-executions-history'] });
    },
    onError: (error) => {
      console.error('Execute playbook error:', error);
      toast.error('Erro ao executar playbook');
    },
  });
}

export function useIgnorePlaybookExecution() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      executionId, 
      reason 
    }: { 
      executionId: string; 
      reason: string;
    }) => {
      if (!tenant?.id) throw new Error('Tenant not found');
      // V-1033 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('playbook_executions')
        .update({
          status: 'ignored',
          ignore_reason: reason,
          completed_at: new Date().toISOString(),
        })
        .eq('id', executionId)
        .eq('tenant_id', tenant.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Recomendação ignorada');
      queryClient.invalidateQueries({ queryKey: ['playbook-executions-pending'] });
      queryClient.invalidateQueries({ queryKey: ['playbook-executions-history'] });
    },
    onError: (error) => {
      console.error('Ignore playbook error:', error);
      toast.error('Erro ao ignorar recomendação');
    },
  });
}

export function useTriggerManualPlaybook() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      playbookId,
      agentId,
      context = {},
    }: { 
      playbookId: string;
      agentId?: string;
      context?: Record<string, unknown>;
    }) => {
      if (!tenant?.id) throw new Error('Tenant not found');

      // ✅ CRÍTICO: Usar Edge Function para gerar snapshots imutáveis
      const response = await supabase.functions.invoke('evaluate-playbook-triggers', {
        body: {
          tenant_id: tenant.id,
          trigger_type: 'manual',
          agent_id: agentId,
          context: {
            ...context,
            playbook_id: playbookId, // Forçar playbook específico
          },
        },
      });

      if (response.error) throw response.error;
      
      if (!response.data?.triggered) {
        throw new Error(response.data?.reason || 'Playbook não pode ser acionado no momento');
      }
      
      return response.data;
    },
    onSuccess: () => {
      toast.success('Playbook acionado manualmente');
      queryClient.invalidateQueries({ queryKey: ['playbook-executions-pending'] });
    },
    onError: (error: any) => {
      console.error('Trigger manual playbook error:', error);
      toast.error(error.message || 'Erro ao acionar playbook');
    },
  });
}

export function useTogglePlaybook() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      playbookId, 
      enabled 
    }: { 
      playbookId: string; 
      enabled: boolean;
    }) => {
      if (!tenant?.id) throw new Error('Tenant not found');
      // V-3010 FIX: Add tenant_id filter to prevent cross-tenant toggle
      // For system playbooks (tenant_id IS NULL), only allow if user is admin
      const { error } = await supabase
        .from('playbooks')
        .update({ is_enabled: enabled })
        .eq('id', playbookId)
        .or(`tenant_id.eq.${tenant.id},is_system.eq.true`);

      if (error) throw error;
    },
    onSuccess: (_, { enabled }) => {
      toast.success(enabled ? 'Playbook ativado' : 'Playbook desativado');
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
    },
    onError: (error) => {
      console.error('Toggle playbook error:', error);
      toast.error('Erro ao alterar status do playbook');
    },
  });
}
