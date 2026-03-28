import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { logger } from '@/lib/logger';

export interface JobSLOState {
  id: string;
  tenant_id: string;
  time_window: string;
  burn_rate: number;
  error_rate: number;
  total_jobs: number;
  error_jobs: number;
  evaluated_at: string;
  last_task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BurnRateStatus {
  level: 'ok' | 'alert' | 'warning' | 'high' | 'critical';
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
}

/**
 * Returns the status configuration based on burn rate value
 * Following ADR-032 thresholds:
 * - >= 10: CRITICAL
 * - >= 4: HIGH
 * - >= 2: MEDIUM/WARNING
 * - >= 1: LOW/ALERT
 * - < 1: OK
 */
export function getBurnRateStatus(burnRate: number): BurnRateStatus {
  if (burnRate >= 10) {
    return { level: 'critical', label: 'CRÍTICO', color: 'red', bgColor: 'bg-destructive/10', textColor: 'text-destructive' };
  }
  if (burnRate >= 4) {
    return { level: 'high', label: 'ALTO', color: 'orange', bgColor: 'bg-[hsl(var(--warning))]/10', textColor: 'text-[hsl(var(--warning))]' };
  }
  if (burnRate >= 2) {
    return { level: 'warning', label: 'ATENÇÃO', color: 'amber', bgColor: 'bg-[hsl(var(--warning))]/10', textColor: 'text-[hsl(var(--warning))]' };
  }
  if (burnRate >= 1) {
    return { level: 'alert', label: 'ALERTA', color: 'yellow', bgColor: 'bg-[hsl(var(--warning))]/10', textColor: 'text-[hsl(var(--warning))]' };
  }
  return { level: 'ok', label: 'OK', color: 'green', bgColor: 'bg-[hsl(var(--success))]/10', textColor: 'text-[hsl(var(--success))]' };
}

/**
 * Hook to fetch the current SLO state for the active tenant
 * Refreshes every 30 seconds for near-real-time monitoring
 * ADR-029 CRIT-04: Added loading guard to prevent race conditions
 */
export const useJobsSLO = () => {
  const { activeTenant, loading } = useActiveTenant();  // ADR-029 CRIT-04: Add loading
  const adaptiveInterval = useAdaptivePolling(300_000);
  
  const query = useQuery({
    queryKey: ['job-slo-state', activeTenant?.id],
    queryFn: async (): Promise<JobSLOState | null> => {
      if (!activeTenant?.id) return null;
      
      // Direct query since job_slo_state is a new table not yet in types
      const { data, error } = await supabase
        .from('job_slo_state')
        .select('id, tenant_id, time_window, total_jobs, error_jobs, error_rate, burn_rate, evaluated_at')
        .eq('tenant_id', activeTenant.id)
        .eq('time_window', '1h')
        .maybeSingle();
      
      if (error) {
        logger.error('[useJobsSLO] Error fetching SLO state:', error);
        throw error;
      }
      
      return data as unknown as JobSLOState | null;
    },
    enabled: !loading && !!activeTenant?.id,  // ADR-029 CRIT-04: Guard with loading state
    refetchInterval: adaptiveInterval,
    staleTime: 120_000
  });

  // Calculate derived values
  const sloState = query.data;
  const burnRate = sloState?.burn_rate ?? 0;
  const errorRate = sloState?.error_rate ?? 0;
  const status = getBurnRateStatus(burnRate);
  
  // Check if SLO is breached (any burn rate >= 1 means we're consuming error budget)
  const isBreached = burnRate >= 1;
  const isCritical = burnRate >= 10;
  const needsAttention = burnRate >= 2;

  return {
    ...query,
    sloState,
    burnRate,
    errorRate,
    status,
    isBreached,
    isCritical,
    needsAttention,
    // Formatted values for display
    burnRateFormatted: burnRate.toFixed(2) + 'x',
    errorRateFormatted: (errorRate * 100).toFixed(2) + '%',
    sloTarget: '99.5%',
    errorBudget: '0.5%'
  };
};
