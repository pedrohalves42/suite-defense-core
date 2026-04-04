import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';

export interface TacticCoverage {
  tactic: string;
  total_techniques: number;
  covered_techniques: number;
  coverage_pct: number;
  uncovered_ids: string[] | null;
}

export interface CoverageSummary {
  ref_total: number;
  ref_covered: number;
  overall_pct: number;
  total_active_rules_techniques: number;
  total_active_rules: number;
  extra_techniques: number;
}

export interface MitreCoverageData {
  timestamp: string;
  summary: CoverageSummary;
  tactics: TacticCoverage[];
}

export function useMitreCoverage() {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['mitre-coverage', activeTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_mitre_coverage_by_tactic', {
        tenant_uuid: activeTenant!.id,
      });
      if (error) throw error;
      return data as unknown as MitreCoverageData;
    },
    enabled: !loading && !!activeTenant?.id,
    staleTime: 10 * 60_000,
  });
}
