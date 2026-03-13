import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

export type RemediationActionType =
  | 'kill_process'
  | 'firewall_block'
  | 'patch_apply'
  | 'quarantine_file'
  | 'restart_service'
  | 'enable_antivirus'
  | 'enable_firewall'
  | 'block_usb_device'
  | 'suggest_patch'
  | 'force_windows_update';

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

export const ROLLBACK_SUPPORTED: RemediationActionType[] = [
  'enable_firewall',
  'enable_antivirus',
  'kill_process',
  'block_usb_device',
  'firewall_block',
];

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
    refetchInterval: 120000,
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
      if (data?.error) throw new Error(data.message || data.error);
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
      if (!tenant?.id) throw new Error('Tenant not found');
      const { data: action, error: fetchErr } = await supabase
        .from('auto_remediation_actions')
        .select('*')
        .eq('id', actionId)
        .eq('tenant_id', tenant.id)
        .single();
      if (fetchErr || !action) throw new Error('Ação não encontrada');

      // V-3009 FIX: Set approved_by to track who approved
      const { data: { user } } = await supabase.auth.getUser();
      const { error: updateErr } = await supabase
        .from('auto_remediation_actions')
        .update({
          status: 'executing',
          approved_by: user?.id || null,
          approved_at: new Date().toISOString(),
          executed_at: new Date().toISOString(),
        })
        .eq('id', actionId)
        .eq('tenant_id', tenant.id);
      if (updateErr) throw updateErr;

      const { data, error: invokeErr } = await supabase.functions.invoke('auto-remediate', {
        body: {
          agent_id: action.agent_id,
          action_type: action.action_type,
          trigger_source: `approved:${action.trigger_source}`,
          trigger_details: {
            ...(action.trigger_details as Record<string, unknown>),
            original_action_id: actionId,
            approved: true,
          },
          requires_approval: false,
        },
      });
      if (invokeErr) throw invokeErr;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-actions'] });
      toast.success('Ação aprovada e executada com sucesso');
    },
    onError: (err: Error) => {
      toast.error('Erro ao executar ação aprovada', { description: err.message });
    },
  });

  const rollbackAction = useMutation({
    mutationFn: async (actionId: string) => {
      const { data, error } = await supabase.functions.invoke('rollback-remediation', {
        body: { action_id: actionId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-actions'] });
      toast.success('Rollback iniciado com sucesso');
    },
    onError: (err: Error) => {
      toast.error('Erro no rollback', { description: err.message });
    },
  });

  return {
    actions: actions.data || [],
    isLoading: actions.isLoading,
    executeRemediation,
    approveAction,
    rollbackAction,
  };
};
