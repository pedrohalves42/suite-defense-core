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
        .select('tenant_id, active_tasks, unassigned_tasks, sla_breached_active, critical_open, high_open, avg_resolution_hours, resolved_24h, ignored_24h')
        .eq('tenant_id', tenant!.id)
        .maybeSingle();

      if (error) {
        throw error;
      }
      
      if (!data) {
        return {
          tenant_id: tenant!.id,
          active_tasks: 0,
          unassigned_tasks: 0,
          sla_breached_active: 0,
          critical_open: 0,
          high_open: 0,
          avg_resolution_hours: null,
          resolved_24h: 0,
          ignored_24h: 0
        } as GovernanceStats;
      }
      
      // Cast to unknown first since the view schema has been updated
      const record = data as unknown as Record<string, unknown>;
      return {
        tenant_id: String(record.tenant_id),
        active_tasks: Number(record.active_tasks) || 0,
        unassigned_tasks: Number(record.unassigned_tasks) || 0,
        sla_breached_active: Number(record.sla_breached_active) || 0,
        critical_open: Number(record.critical_open) || 0,
        high_open: Number(record.high_open) || 0,
        avg_resolution_hours: record.avg_resolution_hours != null ? Number(record.avg_resolution_hours) : null,
        resolved_24h: Number(record.resolved_24h) || 0,
        ignored_24h: Number(record.ignored_24h) || 0
      } as GovernanceStats;
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });
}
