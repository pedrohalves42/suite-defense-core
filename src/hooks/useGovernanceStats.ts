import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

export interface GovernanceStats {
  tenant_id: string;
  active_tasks: number;
  unassigned_tasks: number;
  sla_breached_active: number;
  critical_open: number;
  high_open: number;
  avg_resolution_hours: number | null;
  resolved_24h: number;
  ignored_24h: number;
}

export function useGovernanceStats() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['governance-stats', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_governance_stats')
        .select('*')
        .eq('tenant_id', tenant!.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            tenant_id: tenant!.id,
            active_tasks: 0,
            unassigned_tasks: 0,
            sla_breached_active: 0,
            critical_open: 0,
            high_open: 0,
            avg_resolution_hours: null,
            resolved_24h: 0,
            ignored_24h: 0,
          } as GovernanceStats;
        }
        throw error;
      }
      return data as GovernanceStats;
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000,
  });
}
