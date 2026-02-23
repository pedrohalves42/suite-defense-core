import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

export type RemediationActionType = 'kill_process' | 'firewall_block' | 'patch_apply' | 'quarantine_file' | 'restart_service';

export interface RemediationAction {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  agent_name: string | null;
  action_type: RemediationActionType;
  trigger_source: string;
  trigger_details: Record<string, unknown>;
  status: string;
  result: Record<string, unknown> | null;
  error_message: string | null;
  requires_approval: boolean;
  approved_by: string | null;
  approved_at: string | null;
  executed_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export const useAutoRemediation = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const actions = useQuery({
    queryKey: ['remediation-actions', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('auto_remediation_actions')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as RemediationAction[];
    },
    enabled: !!tenant?.id,
    refetchInterval: 120000, // COST-OPT: 15s → 2min
  });

  const executeRemediation = useMutation({
    mutationFn: async (params: {
      agent_id: string;
      action_type: RemediationActionType;
      trigger_source: string;
      trigger_details: Record<string, unknown>;
      requires_approval?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke('auto-remediate', {
        body: params,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['remediation-actions'] });
      if (data?.status === 'pending_approval') {
        toast.info('Ação aguardando aprovação');
      } else {
        toast.success('Remediação executada com sucesso');
      }
    },
    onError: (err: Error) => {
      toast.error('Erro na remediação', { description: err.message });
    },
  });

  const approveAction = useMutation({
    mutationFn: async (actionId: string) => {
      // Approve then re-dispatch
      const { error } = await supabase
        .from('auto_remediation_actions')
        .update({
          status: 'executing',
          approved_at: new Date().toISOString(),
          executed_at: new Date().toISOString(),
        })
        .eq('id', actionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-actions'] });
      toast.success('Ação aprovada');
    },
  });

  return {
    actions: actions.data || [],
    isLoading: actions.isLoading,
    executeRemediation,
    approveAction,
  };
};
