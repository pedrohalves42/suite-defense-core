import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { tenantQuery } from '@/lib/tenantQuery';
import { toast } from 'sonner';

export interface TenantActionPolicy {
  id: string;
  tenant_id: string;
  insight_type: string;
  execution_mode: 'auto' | 'approval' | 'disabled';
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export function useTenantActionPolicies() {
  const { activeTenant, loading } = useActiveTenant();  // ADR-029 CRIT-04: Add loading
  const queryClient = useQueryClient();

  const { data: policies, isLoading, error } = useQuery({
    queryKey: ['tenant-action-policies', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return [];
      
      const { data, error } = await tenantQuery('tenant_action_policies', activeTenant.id)
        .select('id, tenant_id, insight_type, execution_mode, created_by, last_applied_at, created_at, updated_at')
        .order('insight_type');
      
      if (error) throw error;
      return data as TenantActionPolicy[];
    },
    enabled: !loading && !!activeTenant?.id,  // ADR-029 CRIT-04: Guard with loading state
  });

  const upsertPolicy = useMutation({
    mutationFn: async ({ insightType, executionMode }: { insightType: string; executionMode: 'auto' | 'approval' | 'disabled' }) => {
      if (!activeTenant?.id) throw new Error('No active tenant');
      
      const { data, error } = await supabase
        .from('tenant_action_policies')
        .upsert({
          tenant_id: activeTenant.id,
          insight_type: insightType,
          execution_mode: executionMode,
        }, {
          onConflict: 'tenant_id,insight_type',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-action-policies', activeTenant?.id] });
      toast.success('Política atualizada');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar política: ${error.message}`);
    },
  });

  const deletePolicy = useMutation({
    mutationFn: async (insightType: string) => {
      if (!activeTenant?.id) throw new Error('No active tenant');
      
      const { error } = await supabase
        .from('tenant_action_policies')
        .delete()
        .eq('tenant_id', activeTenant.id)
        .eq('insight_type', insightType);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-action-policies', activeTenant?.id] });
      toast.success('Política removida (usando padrão)');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao remover política: ${error.message}`);
    },
  });

  // Convert array to map for easy lookup
  const policyMap = new Map(
    (policies || []).map(p => [p.insight_type, p.execution_mode])
  );

  return {
    policies,
    policyMap,
    isLoading,
    error,
    upsertPolicy,
    deletePolicy,
  };
}
