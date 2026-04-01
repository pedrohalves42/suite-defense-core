import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

export interface GovernanceStats {
  tenant_id: string;
  total_reports: number;
  approved: number;
  pending: number;
  last_report_at: string | null;
  // Computed fields for backward compatibility
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
        .select('tenant_id, total_reports, approved, pending, last_report_at')
        .eq('tenant_id', tenant!.id)
        .maybeSingle();

      if (error) {
        throw error;
      }
      
      const defaults: GovernanceStats = {
        tenant_id: tenant!.id,
        total_reports: 0,
        approved: 0,
        pending: 0,
        last_report_at: null,
        active_tasks: 0,
        unassigned_tasks: 0,
        sla_breached_active: 0,
        critical_open: 0,
        high_open: 0,
        avg_resolution_hours: null,
        resolved_24h: 0,
        ignored_24h: 0,
      };
      
      if (!data) return defaults;
      
      const record = data as unknown as Record<string, unknown>;
      return {
        ...defaults,
        tenant_id: String(record.tenant_id),
        total_reports: Number(record.total_reports) || 0,
        approved: Number(record.approved) || 0,
        pending: Number(record.pending) || 0,
        last_report_at: record.last_report_at ? String(record.last_report_at) : null,
        // Map view data to backward-compatible fields
        active_tasks: Number(record.pending) || 0,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });
}
