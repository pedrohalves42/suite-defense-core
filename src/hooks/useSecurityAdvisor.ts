import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';

export interface SecurityTip {
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  actionPath: string;
  actionLabel: string;
}

export interface SecurityAdvisorData {
  tips: SecurityTip[];
  maturity: {
    score: number;
    level: 'basic' | 'intermediate' | 'advanced';
    label: string;
  };
  summary: {
    totalAgents: number;
    onlineAgents: number;
    avCoverage: number;
    criticalVulns: number;
    pendingAlerts: number;
  };
  generated_at: string;
}

export function useSecurityAdvisor() {
  const { tenant, loading: tenantLoading } = useTenant();

  return useQuery({
    queryKey: ['security-advisor', tenant?.id],
    queryFn: async (): Promise<SecurityAdvisorData> => {
      const { data, error } = await supabase.functions.invoke('security-advisor', {
        body: { tenant_id: tenant!.id }
      });

      if (error) throw new Error(error.message || 'Failed to fetch security advisor');
      return data as SecurityAdvisorData;
    },
    enabled: !tenantLoading && !!tenant?.id,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
