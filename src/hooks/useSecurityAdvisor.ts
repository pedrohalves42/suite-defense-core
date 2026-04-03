import { useQuery } from '@tanstack/react-query';
import { callGateway } from '@/lib/gateway';
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
      const data = await callGateway<SecurityAdvisorData>('security', 'security-advisor', {
        tenant_id: tenant!.id,
      });
      return data;
    },
    enabled: !tenantLoading && !!tenant?.id,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
