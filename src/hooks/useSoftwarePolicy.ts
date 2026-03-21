import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { toast } from 'sonner';

export type SoftwareProtectionMode = 'observation' | 'alert' | 'block';

export interface SoftwarePolicy {
  id: string;
  tenant_id: string;
  mode: SoftwareProtectionMode;
  block_risk_levels: string[];
  alert_on_new_software: boolean;
  updated_at: string;
}

export function useSoftwarePolicy() {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['software-policy', activeTenant?.id],
    queryFn: async (): Promise<SoftwarePolicy | null> => {
      if (!activeTenant?.id) return null;

      const { data, error } = await supabase
        .from('tenant_software_policy')
        .select('id, tenant_id, auto_approve_patches, block_unsigned, max_install_age_days, created_at, updated_at')
        .eq('tenant_id', activeTenant.id)
        .maybeSingle();

      if (error) throw error;
      return data as SoftwarePolicy | null;
    },
    enabled: !loading && !!activeTenant?.id,
    staleTime: 60_000,
  });
}

export function useUpdateSoftwarePolicy() {
  const queryClient = useQueryClient();
  const { activeTenant } = useActiveTenant();

  return useMutation({
    mutationFn: async (updates: Partial<Pick<SoftwarePolicy, 'mode' | 'block_risk_levels' | 'alert_on_new_software'>>) => {
      if (!activeTenant?.id) throw new Error('Tenant não encontrado');

      const { data, error } = await supabase
        .from('tenant_software_policy')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('tenant_id', activeTenant.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['software-policy'] });
      toast.success('Modo de proteção atualizado');
    },
    onError: () => {
      toast.error('Erro ao atualizar modo de proteção');
    },
  });
}
