import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

export interface RiskDebtItem {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  severity: string;
  risk_accepted_by: string | null;
  risk_accepted_at: string | null;
  risk_expiry_at: string | null;
  risk_justification: string | null;
  days_until_expiry: number | null;
  risk_status: 'expiring_soon' | 'active';
}

export function useRiskDebt() {
  const { tenant, loading } = useTenant();

  return useQuery({
    queryKey: ['risk-debt', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_active_risk_debt')
        .select('*')
        .eq('tenant_id', tenant!.id)
        .order('risk_expiry_at', { ascending: true });

      if (error) throw error;
      return data as RiskDebtItem[];
    },
    enabled: !loading && !!tenant?.id,
    refetchInterval: 300000, // COST-OPT: 60s → 5min
  });
}

export function useRiskDebtSummary() {
  const { data: riskDebt, isLoading } = useRiskDebt();

  const summary = {
    total: riskDebt?.length || 0,
    expiringSoon: riskDebt?.filter(r => r.risk_status === 'expiring_soon').length || 0,
    bySeverity: {
      critical: riskDebt?.filter(r => r.severity === 'critical').length || 0,
      high: riskDebt?.filter(r => r.severity === 'high').length || 0,
      medium: riskDebt?.filter(r => r.severity === 'medium').length || 0,
      low: riskDebt?.filter(r => r.severity === 'low').length || 0,
    }
  };

  return { summary, isLoading };
}
