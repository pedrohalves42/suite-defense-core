import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

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
  const adaptiveInterval = useAdaptivePolling(300000);
  const { tenant, loading } = useTenant(); // ADR-030 CRIT-01

  return useQuery({
    queryKey: ['coverage-gates', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('validate_governance_coverage', {
        tenant_uuid: tenant!.id
      });

      if (error) throw error;
      return data as unknown as CoverageResult;
    },
    enabled: !loading && !!tenant?.id, // ADR-030 CRIT-01
    refetchInterval: adaptiveInterval,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
