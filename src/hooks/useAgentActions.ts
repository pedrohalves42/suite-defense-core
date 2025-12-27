import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useAgentActions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      const { error } = await supabase
        .from('agent_versions')
        .update({
          is_blocked: false,
          blocked_at: null,
          blocked_by: null,
          blocked_reason: null,
        })
        .eq('id', versionId);
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
      const { error } = await supabase
        .from('decision_rules')
        .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
        .eq('id', ruleId);
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

  return {
    removeThrottle,
    removeIsolation,
    unblockVersion,
    toggleRule,
    executeRulesEngine,
  };
}
