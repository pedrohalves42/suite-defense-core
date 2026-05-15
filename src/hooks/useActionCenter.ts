import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callGateway } from '@/lib/gateway';
import { toast } from 'sonner';
import { useTenant } from './useTenant';
import { logger } from '@/lib/logger';
import { useEffect } from 'react';
import { realtimeChannelManager } from '@/lib/realtime-manager';

export interface ActionItem {
  item_id: string;
  source_type: 'playbook' | 'alert' | 'agent_offline' | 'ai_insight';
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
  is_historical?: boolean;
  humanized?: {
    title: string;
    description: string;
    cta: string;
  } | null;
  // P1-A: Campos de efetividade para o EffectivenessBadge
  effectiveness_status?: 'pending' | 'resolved' | 'partial' | 'failed' | 'unknown' | null;
  effectiveness_checked_at?: string | null;
  effectiveness_evidence?: Record<string, unknown> | null;
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
  // V-FIX: Use loading guard to prevent race condition during tenant sync
  const { tenant, loading: tenantLoading } = useTenant();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['action-center', tenant?.id],
    queryFn: async (): Promise<ActionCenterFeed> => {
      if (!tenant?.id) throw new Error('Tenant ID required');
      
      const data = await callGateway<ActionCenterFeed>('agent', 'action-center-feed', {
        action: 'get-feed',
        tenant_id: tenant.id
      });
      return data;
    },
    // V-FIX: Guard with !tenantLoading to prevent queries before JWT sync completes
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: false,
    staleTime: 120_000
  });

  // Subscribe to realtime updates for relevant tables using central manager
  useEffect(() => {
    if (!tenant?.id || !queryClient) return;

    const instanceId = `action-center-${tenant.id}`;
    const tables = ['playbook_executions', 'system_alerts', 'ai_insights'];
    
    tables.forEach(table => {
      realtimeChannelManager.subscribe(
        instanceId,
        table,
        `tenant_id=eq.${tenant.id}`,
        () => {
          queryClient.invalidateQueries({ queryKey: ['action-center', tenant.id] });
        },
        'public',
        tenant.id
      );
    });

    return () => {
      tables.forEach(table => {
        realtimeChannelManager.unsubscribe(instanceId, table, `tenant_id=eq.${tenant.id}`, 'public', tenant.id);
      });
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
      reason
    }: {
      itemId: string;
      sourceType: 'playbook' | 'alert' | 'agent_offline' | 'ai_insight';
      action: 'execute' | 'ignore' | 'acknowledge';
      reason?: string;
    }) => {
      // V-5007 FIX: Guard against empty tenant_id
      if (!tenant?.id) throw new Error('Tenant not found');
      const data = await callGateway('agent', 'action-center-feed', {
        item_id: itemId,
        source_type: sourceType,
        action,
        reason,
        tenant_id: tenant.id,
      });
      return data;
    },
    onSuccess: (response, { action, sourceType }) => {
      // Mensagens específicas baseadas no tipo de resposta
      let message = 'Operação concluída';
      
      if (response?.status === 'reviewed_no_action') {
        message = 'Insight revisado - sem ações automatizadas disponíveis';
      } else if (response?.status === 'acknowledged') {
        message = 'Alerta reconhecido com sucesso';
      } else {
        const messages: Record<string, string> = {
          execute: sourceType === 'ai_insight' ? 'Recomendação aplicada' : 'Ação executada com sucesso',
          ignore: 'Item ignorado',
          acknowledge: 'Alerta reconhecido'
        };
        message = messages[action] || 'Operação concluída';
      }
      
      toast.success(message);
      queryClient.invalidateQueries({ queryKey: ['action-center', tenant?.id] });
      queryClient.invalidateQueries({ queryKey: ['playbook-executions-pending'] });
      queryClient.invalidateQueries({ queryKey: ['unified-metrics', tenant?.id] });
      queryClient.invalidateQueries({ queryKey: ['action-center-history', tenant?.id] });
    },
    onError: (error) => {
      logger.error('Execute action error', error instanceof Error ? error : undefined);
      toast.error('Erro ao executar ação');
    }
  });
}

export function useActionCenterCount() {
  const { data } = useActionCenter();
  
  return {
    urgentCount: data?.urgent?.length || 0,
    recommendedCount: data?.recommended?.length || 0,
    totalCount: (data?.urgent?.length || 0) + (data?.recommended?.length || 0)
  };
}

