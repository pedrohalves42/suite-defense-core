import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';

export interface RansomwareIndicator {
  id: string;
  agent_id: string;
  tenant_id: string;
  indicator_type: string;
  severity: string;
  process_name: string | null;
  process_pid: number | null;
  process_path: string | null;
  affected_path: string | null;
  affected_files_count: number;
  files_per_second: number | null;
  entropy_score: number | null;
  status: string;
  auto_response_taken: string | null;
  contained_at: string | null;
  evidence_hash: string | null;
  sample_files: string[] | null;
  detected_at: string;
  created_at: string;
  details: Record<string, unknown>;
}

export interface RansomwareSummary {
  total: number;
  active: number;
  contained: number;
  critical: number;
  indicators: RansomwareIndicator[];
  isUnderAttack: boolean;
}

export function useRansomwareIndicators() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['ransomware-indicators', tenant?.id],
    queryFn: async (): Promise<RansomwareSummary> => {
      const { data, error } = await supabase
        .from('ransomware_indicators')
        .select('id, agent_id, tenant_id, indicator_type, severity, process_name, process_path, affected_path, affected_files_count, status, auto_response_taken, contained_at, detected_at')
        .eq('tenant_id', tenant!.id)
        .order('detected_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const indicators = (data || []) as unknown as RansomwareIndicator[];
      const active = indicators.filter(i => i.status === 'active');
      const contained = indicators.filter(i => i.status === 'contained');
      const critical = indicators.filter(i => i.severity === 'critical' && i.status === 'active');

      return {
        total: indicators.length,
        active: active.length,
        contained: contained.length,
        critical: critical.length,
        indicators,
        isUnderAttack: active.length > 0,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 300_000, // COST-OPT: 15s → 5min
    refetchIntervalInBackground: false,
    staleTime: 120_000,
  });
}
