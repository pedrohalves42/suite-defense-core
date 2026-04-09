/**
 * Hook for SOC 2 Control Status management
 * Reads/writes to soc2_control_status table
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

export interface ControlStatus {
  id: string;
  control_id: string;
  status: string;
  notes: string | null;
  filled_by: string | null;
  filled_at: string;
  auto_filled: boolean | null;
  tenant_id: string;
}

export function useSOC2ControlStatuses() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['soc2-control-statuses', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('soc2_control_status')
        .select('*')
        .eq('tenant_id', tenant!.id)
        .order('filled_at', { ascending: false });

      if (error) throw error;

      // Deduplicate: keep latest per control_id
      const latest = new Map<string, ControlStatus>();
      for (const row of (data as ControlStatus[])) {
        if (!latest.has(row.control_id)) {
          latest.set(row.control_id, row);
        }
      }
      return Object.fromEntries(latest);
    },
    staleTime: 300_000, // 5 min cache
    enabled: !!tenant?.id,
  });
}

export function useSaveControlStatus() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({
      controlId,
      status,
      notes,
      autoFilled = false,
    }: {
      controlId: string;
      status: string;
      notes: string;
      autoFilled?: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('soc2_control_status')
        .insert({
          tenant_id: tenant!.id,
          control_id: controlId,
          status,
          notes,
          filled_by: user?.id ?? null,
          auto_filled: autoFilled,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['soc2-control-statuses'] });
    },
    onError: () => {
      toast.error('Erro ao salvar status do controle');
    },
  });
}
