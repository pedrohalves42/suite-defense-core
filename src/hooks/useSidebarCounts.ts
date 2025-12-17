import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

export const useSidebarCounts = () => {
  const { tenant } = useTenant();

  const { data: counts } = useQuery({
    queryKey: ['sidebar-counts', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      // Fetch counts in parallel
      const [
        { count: alertsCount },
        { count: vulnCount },
        { count: deadLetterCount }
      ] = await Promise.all([
        supabase
          .from('system_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('resolved', false),
        supabase
          .from('vuln_findings')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id),
        supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('status', 'failed')
      ]);

      return {
        alerts: alertsCount || 0,
        vulnerabilities: vulnCount || 0,
        deadLetter: deadLetterCount || 0
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000
  });

  return {
    alertsCount: counts?.alerts || 0,
    vulnCount: counts?.vulnerabilities || 0,
    deadLetterCount: counts?.deadLetter || 0
  };
};
