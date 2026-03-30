/**
 * Hook for Two-Man-Rule Approval Requests
 * Fase 1: Two-Man-Rule & Policy Engine Hierárquico
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';

export interface ApprovalRequest {
  id: string;
  tenant_id: string;
  chain_id: string | null;
  playbook_execution_id: string | null;
  action_type: string;
  action_payload: Record<string, unknown>;
  target_agent_id: string | null;
  requested_by: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed';
  required_approvers: number;
  current_approvers: number;
  expires_at: string;
  approved_at: string | null;
  executed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  // Joined fields
  agents?: { agent_name: string; hostname: string } | null;
  approval_chains?: { name: string } | null;
}

export interface Approval {
  id: string;
  request_id: string;
  approved_by: string;
  decision: 'approved' | 'rejected';
  reason: string | null;
  created_at: string;
}

export function usePendingApprovalRequests() {
  const adaptiveInterval = useAdaptivePolling(300_000);
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['approval-requests', 'pending', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('approval_requests')
        .select(`
          *,
          agents:target_agent_id(agent_name, hostname),
          approval_chains:chain_id(name)
        `)
        .eq('tenant_id', tenant.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as ApprovalRequest[];
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Realtime subscription
  useEffect(() => {
    if (!tenant?.id) return;

    const channel = supabase
      .channel('approval-requests-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'approval_requests',
          filter: `tenant_id=eq.${tenant.id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, queryClient]);

  return query;
}

export function useApprovalRequestHistory(limit = 50) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['approval-requests', 'history', tenant?.id, limit],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('approval_requests')
        .select(`
          *,
          agents:target_agent_id(agent_name, hostname),
          approval_chains:chain_id(name)
        `)
        .eq('tenant_id', tenant.id)
        .neq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as ApprovalRequest[];
    },
    enabled: !!tenant?.id
  });
}

export function useApprovalVotes(requestId: string) {
  return useQuery({
    queryKey: ['approvals', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approvals')
        .select('id, request_id, approved_by, decision, reason, created_at')
        .eq('request_id', requestId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as Approval[];
    },
    enabled: !!requestId
  });
}

export function useSubmitApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      decision,
      reason
    }: {
      requestId: string;
      decision: 'approved' | 'rejected';
      reason?: string;
    }) => {
      const { data, error } = await supabase.rpc('submit_approval', {
        p_request_id: requestId,
        p_decision: decision,
        p_reason: reason || null
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; status?: string; message?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to submit approval');
      }

      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });

      if (data.status === 'approved') {
        toast.success('Ação aprovada! O quórum foi atingido.');
      } else if (data.status === 'rejected') {
        toast.info('Ação rejeitada.');
      } else {
        toast.success('Voto registrado. Aguardando mais aprovadores.');
      }
    },
    onError: (error) => {
      logger.error('Failed to submit approval', error instanceof Error ? error : undefined);
      toast.error(error.message || 'Erro ao submeter aprovação');
    }
  });
}

export function useCreateApprovalRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      actionType,
      actionPayload,
      targetAgentId,
      playbookExecutionId
    }: {
      actionType: string;
      actionPayload: Record<string, unknown>;
      targetAgentId?: string;
      playbookExecutionId?: string;
    }) => {
      const { data, error } = await supabase.rpc('create_approval_request', {
        p_action_type: actionType,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        p_action_payload: actionPayload as any,
        p_target_agent_id: targetAgentId || null,
        p_playbook_execution_id: playbookExecutionId || null
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; request_id?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to create approval request');
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
      toast.success('Solicitação de aprovação criada. Aguardando aprovadores.');
    },
    onError: (error) => {
      logger.error('Failed to create approval request', error instanceof Error ? error : undefined);
      toast.error(error.message || 'Erro ao criar solicitação');
    }
  });
}

export const ACTION_TYPE_LABELS: Record<string, string> = {
  isolate: 'Isolar Agente',
  kill_process: 'Encerrar Processo',
  stop_service: 'Parar Serviço',
  disable_service: 'Desabilitar Serviço',
  revoke_token: 'Revogar Token',
  quarantine: 'Quarentena',
  network_isolate: 'Isolamento de Rede'
};

export const ACTION_TYPE_SEVERITY: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  isolate: 'critical',
  kill_process: 'high',
  stop_service: 'high',
  disable_service: 'high',
  revoke_token: 'medium',
  quarantine: 'critical',
  network_isolate: 'critical'
};
