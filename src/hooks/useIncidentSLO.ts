import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';

export interface IncidentSLOState {
  id: string;
  fingerprint_id: string;
  slo_target: number;
  error_budget: number;
  burn_rate_1h: number;
  burn_rate_6h: number;
  burn_rate_24h: number;
  budget_consumed: number;
  budget_remaining: number;
  occurrences_1h: number;
  occurrences_6h: number;
  occurrences_24h: number;
  status: 'ok' | 'alert' | 'warning' | 'high' | 'critical';
  last_evaluated_at: string;
}

export interface IncidentGroupWithSLO {
  id: string;
  fingerprint_hash: string;
  source_type: 'job' | 'dlq' | 'alert';
  failure_class: string;
  normalized_signature: {
    source_type?: string;
    job_type?: string;
    error_code?: string;
    failure_class?: string;
    agent_version_major?: string;
  };
  severity_hint: 'critical' | 'high' | 'medium' | 'low';
  total_occurrences: number;
  distinct_tenants: number;
  distinct_agents: number;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  is_ongoing: boolean;
  // SLO data
  slo_target: number;
  error_budget: number;
  burn_rate_1h: number;
  burn_rate_6h: number;
  burn_rate_24h: number;
  budget_consumed: number;
  budget_remaining: number;
  slo_status: string;
  occurrences_1h: number;
  occurrences_6h: number;
  last_evaluated_at: string | null;
}

export type BurnRateLevel = 'ok' | 'alert' | 'warning' | 'high' | 'critical';

export interface BurnRateInfo {
  level: BurnRateLevel;
  text: string;
  bg: string;
  label: string;
  labelEn: string;
}

/**
 * Returns color and label info for a given burn rate value
 */
export function getBurnRateInfo(rate: number): BurnRateInfo {
  if (rate >= 5) {
    return { level: 'critical', text: 'text-destructive', bg: 'bg-destructive/10', label: 'CRÍTICO', labelEn: 'CRITICAL' };
  }
  if (rate >= 2) {
    return { level: 'high', text: 'text-[hsl(var(--warning))]', bg: 'bg-[hsl(var(--warning))]/10', label: 'ALTO', labelEn: 'HIGH' };
  }
  if (rate >= 1.5) {
    return { level: 'warning', text: 'text-[hsl(var(--warning))]', bg: 'bg-[hsl(var(--warning))]/10', label: 'ATENÇÃO', labelEn: 'WARNING' };
  }
  if (rate >= 1) {
    return { level: 'alert', text: 'text-[hsl(var(--warning))]', bg: 'bg-[hsl(var(--warning))]/10', label: 'ALERTA', labelEn: 'ALERT' };
  }
  return { level: 'ok', text: 'text-[hsl(var(--success))]', bg: 'bg-[hsl(var(--success))]/10', label: 'OK', labelEn: 'OK' };
}

/**
 * Returns the highest severity burn rate status from the three windows
 */
export function getOverallBurnRateStatus(
  burn1h: number,
  burn6h: number,
  burn24h: number
): BurnRateInfo {
  // Use the 1h rate as primary indicator, but check compound conditions
  if (burn1h >= 5 && burn6h >= 2) {
    return getBurnRateInfo(5); // Critical
  }
  if (burn1h >= 4 || burn6h >= 2) {
    return getBurnRateInfo(2); // High
  }
  if (burn1h >= 2 || burn6h >= 1.5) {
    return getBurnRateInfo(1.5); // Warning
  }
  if (burn1h >= 1) {
    return getBurnRateInfo(1); // Alert
  }
  return getBurnRateInfo(0); // OK
}

/**
 * Returns color for error budget bar based on consumption percentage
 */
export function getErrorBudgetColor(consumed: number): string {
  if (consumed >= 80) return 'bg-destructive';
  if (consumed >= 50) return 'bg-[hsl(var(--warning))]';
  if (consumed >= 30) return 'bg-[hsl(var(--warning))]';
  return 'bg-[hsl(var(--success))]';
}

/**
 * Hook to fetch incident groups with SLO data
 */
export const useIncidentGroupsWithSLO = (limit = 50) => {
  const { activeTenant, loading } = useActiveTenant(); // ADR-029 CRIT-04
  const adaptiveInterval = useAdaptivePolling(300_000);

  return useQuery({
    queryKey: ['incident-groups-slo', activeTenant?.id, limit],
    queryFn: async (): Promise<IncidentGroupWithSLO[]> => {
      if (!activeTenant?.id) return [];
      
      // Note: View joins v_incident_groups with incident_slo_state
      // RLS on base tables provides tenant isolation
      const { data, error } = await supabase
        .from('v_incident_groups_with_slo')
        .select('id, fingerprint_hash, source_type, failure_class, normalized_signature, severity_hint, total_occurrences, distinct_agents, first_seen_at, last_seen_at, is_active, is_ongoing, slo_target, error_budget, burn_rate_1h, burn_rate_6h, burn_rate_24h, budget_consumed, budget_remaining, slo_status, occurrences_1h, occurrences_6h, last_evaluated_at')
        .limit(limit);

      if (error) throw error;
      return (data || []) as unknown as IncidentGroupWithSLO[];
    },
    enabled: !loading && !!activeTenant?.id, // ADR-029 CRIT-04
    refetchInterval: adaptiveInterval,
    staleTime: 120_000
  });
};

/**
 * Hook to fetch SLO summary stats
 */
export const useIncidentSLOSummary = () => {
  const { activeTenant, loading } = useActiveTenant(); // ADR-029 CRIT-04
  const adaptiveInterval = useAdaptivePolling(300_000);

  return useQuery({
    queryKey: ['incident-slo-summary', activeTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incident_slo_state')
        .select('status, burn_rate_1h, budget_consumed');

      if (error) throw error;

      const states = data || [];
      return {
        total: states.length,
        critical: states.filter((s: Record<string, unknown>) => s.status === 'critical').length,
        high: states.filter((s: Record<string, unknown>) => s.status === 'high').length,
        warning: states.filter((s: Record<string, unknown>) => s.status === 'warning').length,
        alert: states.filter((s: Record<string, unknown>) => s.status === 'alert').length,
        ok: states.filter((s: Record<string, unknown>) => s.status === 'ok').length,
        avgBurnRate1h: states.length > 0
          ? states.reduce((sum: number, s: any) => sum + (s.burn_rate_1h || 0), 0) / states.length
          : 0,
        avgBudgetConsumed: states.length > 0
          ? states.reduce((sum: number, s: any) => sum + (s.budget_consumed || 0), 0) / states.length
          : 0
      };
    },
    enabled: !loading && !!activeTenant?.id, // ADR-029 CRIT-04
    refetchInterval: adaptiveInterval,
    staleTime: 120_000
  });
};
