import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

export interface CoverageGate {
  gate: string;
  passed: boolean;
  count: number;
}

export interface CoverageResult {
  timestamp: string;
  is_compliant: boolean;
  alerts_uncovered: number;
  insights_uncovered: number;
  orphan_critical_tasks: number;
  gates: CoverageGate[];
}

export function useCoverageGates() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['coverage-gates', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('validate_governance_coverage', {
        tenant_uuid: tenant!.id
      });

      if (error) throw error;
      return data as unknown as CoverageResult;
    },
    enabled: !!tenant?.id,
    refetchInterval: 60000,
  });
}
