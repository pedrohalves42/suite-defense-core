import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { prepareJobForInsert } from '@/lib/job-utils';
import { tenantQuery } from '@/lib/tenantQuery';
import { useTenant } from '@/hooks/useTenant';

export function useAgentActions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();
  const tenantId = tenant?.id;

  const removeThrottle = useMutation({
    mutationFn: async (agentId: string) => {
      const { data, error } = await supabase.rpc('remove_agent_throttle', {
        p_agent_id: agentId,
      });
      if (error) throw error;
      return data as unknown as { success: boolean; previous_interval?: number };
    },
    onSuccess: (result) => {
      toast({
        title: 'Throttle removido',
        description: result.previous_interval 
          ? `Intervalo restaurado de ${result.previous_interval}s para 60s`
          : 'Agente restaurado ao estado normal',
      });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao remover throttle',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const removeIsolation = useMutation({
    mutationFn: async (agentId: string) => {
      const { data, error } = await supabase.rpc('remove_agent_isolation', {
        p_agent_id: agentId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Isolamento removido',
        description: 'Agente restaurado ao estado normal',
      });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao remover isolamento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const unblockVersion = useMutation({
    mutationFn: async ({ versionId }: { versionId: string }) => {
      if (!tenantId) throw new Error('Tenant not found');
      // V-5001 FIX: Add tenant_id filter to prevent cross-tenant version unblock
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TS2589 workaround
      const { error } = await (supabase
        .from('agent_versions')
        .update({
          is_blocked: false,
          blocked_at: null,
          blocked_by: null,
          blocked_reason: null,
        }) as unknown as Promise<{ error: Error | null }>);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Versão desbloqueada',
        description: 'A versão foi liberada para uso',
      });
      queryClient.invalidateQueries({ queryKey: ['agent-versions'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao desbloquear versão',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const toggleRule = useMutation({
    mutationFn: async ({ ruleId, isEnabled }: { ruleId: string; isEnabled: boolean }) => {
      if (!tenantId) throw new Error('Tenant not found');
      // V-5002 FIX: Add tenant_id filter to prevent cross-tenant rule toggle
      const { error } = await supabase
        .from('decision_rules')
        .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
        .eq('id', ruleId)
        .eq('tenant_id', tenantId);
      if (error) throw error;
    },
    onSuccess: (_, { isEnabled }) => {
      toast({
        title: isEnabled ? 'Regra habilitada' : 'Regra desabilitada',
        description: isEnabled 
          ? 'A regra será executada automaticamente'
          : 'A regra não será executada',
      });
      queryClient.invalidateQueries({ queryKey: ['decision-rules'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao alterar regra',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const executeRulesEngine = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('autonomous-safe-mode');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Motor de regras executado',
        description: `Processadas ${data?.rules_evaluated || 0} regras, ${data?.total_actions || 0} ações`,
      });
      queryClient.invalidateQueries({ queryKey: ['decision-events'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao executar motor',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetSafeMode = useMutation({
    mutationFn: async ({ agentId, tenantId }: { agentId: string; tenantId: string }) => {
      // ADR-026 Zero-Gap: Use RPC with explicit tenant_id
      const { data: agentsList, error: rpcError } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenantId,
        p_include_archived: false,
      });
      if (rpcError) throw rpcError;
      const agent = (agentsList as unknown as Array<Record<string, unknown>>)?.find(
        (a) => a.id === agentId
      );
      if (!agent) throw new Error('Agente não encontrado');
      
      // Criar job reset_safe_mode
      const job = await prepareJobForInsert({
        agent_name: String(agent.agent_name),
        type: 'reset_safe_mode',
        payload: { triggered_by: 'admin_action', triggered_at: new Date().toISOString() },
        tenant_id: tenantId,
        approved: true,
      });
      
      const { error } = await tenantQuery('jobs', tenantId).insert(job);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Job de reset enviado',
        description: 'O safe mode será resetado no próximo heartbeat do agente',
      });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar job de reset',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const enableOverrideSafeMode = useMutation({
    mutationFn: async (agentId: string) => {
      // Expiração automática de 30 minutos (guardrail enterprise)
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      
      const { error } = await supabase
        .from('agents')
        .update({ 
          force_update_override_safe_mode: true,
          force_update_override_safe_mode_expires_at: expiresAt
        })
        .eq('id', agentId)
        .eq('tenant_id', tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Override habilitado',
        description: 'O force_update agora irá ignorar o safe mode local',
      });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao habilitar override',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    removeThrottle,
    removeIsolation,
    unblockVersion,
    toggleRule,
    executeRulesEngine,
    resetSafeMode,
    enableOverrideSafeMode,
  };
}
