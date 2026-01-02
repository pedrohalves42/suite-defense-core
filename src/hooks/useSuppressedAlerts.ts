import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';

export function useSuppressedAlertsByArchive() {
  const { tenant } = useTenant();

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
    enabled: !!tenant?.id,
    staleTime: 30000,
  });
}
