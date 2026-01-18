import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';

export function useSuppressedAlertsByArchive() {
  const { tenant, loading } = useTenant(); // ADR-030 CRIT-01

  return useQuery({
    queryKey: ['suppressed-alerts-archive', tenant?.id],
    queryFn: async (): Promise<number> => {
      // Count archived agents using the view we created
      const { data, error } = await supabase
        .from('v_agent_archive_reason_tree')
        .select('agent_id')
        .eq('tenant_id', tenant!.id);

      if (error) throw error;
      return data?.length || 0;
    },
    enabled: !loading && !!tenant?.id, // ADR-030 CRIT-01
    staleTime: 30000,
  });
}
