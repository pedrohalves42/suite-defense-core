import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';

export interface PlatformCoverage {
  platform: string;
  total_techniques: number;
  covered_techniques: number;
  coverage_pct: number;
}

export interface PlatformCoverageData {
  timestamp: string;
  platforms: PlatformCoverage[];
}

export function useMitrePlatformCoverage() {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['mitre-platform-coverage', activeTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_mitre_coverage_by_platform', {
        tenant_uuid: activeTenant!.id,
      });
      if (error) throw error;
      return data as unknown as PlatformCoverageData;
    },
    enabled: !loading && !!activeTenant?.id,
    staleTime: 10 * 60_000,
  });
}
