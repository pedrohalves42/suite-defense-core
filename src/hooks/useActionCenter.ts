import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTenant } from './useTenant';
import { useEffect } from 'react';

export interface ActionItem {
  item_id: string;
  source_type: 'playbook' | 'alert' | 'agent_offline';
  agent_id: string | null;
  agent_name: string | null;
  hostname: string | null;
  title: string;
  description: string | null;
  severity: string;
  risk_score: number | null;
  context: Record<string, unknown>;
  created_at: string;
  trigger_type: string;
  playbook_id: string | null;
  priority_score: number;
  humanized?: {
    title: string;
    description: string;
    cta: string;
  } | null;
}

export interface ActionCenterFeed {
  urgent: ActionItem[];
  recommended: ActionItem[];
  informational: ActionItem[];
  healthy_count: number;
  offline_count: number;
  total_agents: number;
  generated_at: string;
  warning?: string;
}


export function useActionCenter() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['action-center', tenant?.id],
    queryFn: async (): Promise<ActionCenterFeed> => {
      const { data, error } = await supabase.functions.invoke('action-center-feed', {
        method: 'GET',
        headers: {
          'x-tenant-id': tenant!.id,
        },
      });

      if (error) throw error;
      return data as ActionCenterFeed;
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000,
  });

  // Subscribe to realtime updates for playbook_executions
  useEffect(() => {
    if (!tenant?.id) return;

    const channel = supabase
      .channel('action-center-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'playbook_executions',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['action-center', tenant.id] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_alerts',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['action-center', tenant.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, queryClient]);

  return query;
}

export function useExecuteActionItem() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({
      itemId,
      sourceType,
      action,
      reason,
    }: {
      itemId: string;
      sourceType: 'playbook' | 'alert' | 'agent_offline';
      action: 'execute' | 'ignore' | 'acknowledge';
      reason?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('action-center-feed', {
        method: 'POST',
        headers: {
          'x-tenant-id': tenant?.id || '',
        },
        body: {
          item_id: itemId,
          source_type: sourceType,
          action,
          reason,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { action }) => {
      const messages: Record<string, string> = {
        execute: 'Ação executada com sucesso',
        ignore: 'Ação ignorada',
        acknowledge: 'Alerta reconhecido',
      };
      toast.success(messages[action] || 'Operação concluída');
      queryClient.invalidateQueries({ queryKey: ['action-center', tenant?.id] });
      queryClient.invalidateQueries({ queryKey: ['playbook-executions-pending'] });
    },
    onError: (error) => {
      console.error('Execute action error:', error);
      toast.error('Erro ao executar ação');
    },
  });
}

export function useActionCenterCount() {
  const { data } = useActionCenter();
  
  return {
    urgentCount: data?.urgent?.length || 0,
    recommendedCount: data?.recommended?.length || 0,
    totalCount: (data?.urgent?.length || 0) + (data?.recommended?.length || 0),
  };
}
