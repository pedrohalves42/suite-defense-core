import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import { toast } from 'sonner';

export interface BlastRadiusPolicy {
  id: string;
  tenant_id: string;
  action_type: string;
  max_affected_percent: number;
  max_affected_count: number | null;
  require_approval_above: number;
  cooldown_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BlastRadiusCheck {
  allowed: boolean;
  requires_approval: boolean;
  affected_percent: number;
  max_allowed_percent: number;
  message: string;
}

export const useBlastRadiusPolicies = () => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['blast-radius-policies', tenant?.id],
    queryFn: async (): Promise<BlastRadiusPolicy[]> => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('blast_radius_policies')
        .select('id, tenant_id, action_type, max_affected_percent, max_affected_count, require_approval_above, cooldown_minutes, is_active, created_at, updated_at')
        .eq('tenant_id', tenant.id)
        .order('action_type');

      if (error) throw error;
      return (data || []) as unknown as BlastRadiusPolicy[];
    },
    enabled: !!tenant?.id
  });
};

export const useCheckBlastRadius = () => {
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ 
      actionType, 
      affectedCount 
    }: { 
      actionType: string; 
      affectedCount: number 
    }): Promise<BlastRadiusCheck> => {
      if (!tenant?.id) {
        throw new Error('Tenant not found');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types
      const { data, error } = await (supabase as unknown as { rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }> })
        .rpc('check_blast_radius', {
          p_tenant_id: tenant.id,
          p_action_type: actionType,
          p_affected_count: affectedCount
        });

      if (error) throw error;
      return data as unknown as BlastRadiusCheck;
    }
  });
};

export const useUpdateBlastRadiusPolicy = () => {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async (policy: Partial<BlastRadiusPolicy> & { action_type: string }) => {
      if (!tenant?.id) throw new Error('Tenant not found');

      const { data, error } = await supabase
        .from('blast_radius_policies')
        .upsert({
          ...policy,
          tenant_id: tenant.id,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'tenant_id,action_type'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blast-radius-policies'] });
      toast.success('Política de blast radius atualizada');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar política: ' + (error as Error).message);
    }
  });
};
