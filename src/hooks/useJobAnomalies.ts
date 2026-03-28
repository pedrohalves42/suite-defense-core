import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { logger } from '@/lib/logger';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

export interface JobAnomaly {
  anomaly_type: string;
  count: number;
  oldest_occurrence: string | null;
  description: string;
}

export interface AnomalySummary {
  totalAnomalies: number;
  hasAnomalies: boolean;
  isCritical: boolean;
  anomalies: JobAnomaly[];
  oldestAnomaly: Date | null;
}

/**
 * Returns the severity level of an anomaly type
 */
export function getAnomalySeverity(anomalyType: string): 'critical' | 'high' | 'medium' | 'low' {
  const adaptiveInterval = useAdaptivePolling(300000);
  const criticalTypes = [
    'orphan_approved',
    'terminal_without_completed_at',
    'dlq_divergence',
    'zombie_delivered'
  ];
  
  const highTypes = [
    'legacy_pending',
    'orphan_dlq'
  ];

  if (criticalTypes.includes(anomalyType)) return 'critical';
  if (highTypes.includes(anomalyType)) return 'high';
  return 'medium';
}

/**
 * Returns display configuration for anomaly severity
 */
export function getAnomalySeverityConfig(severity: 'critical' | 'high' | 'medium' | 'low') {
  switch (severity) {
    case 'critical':
      return {
        label: 'CRÍTICO',
        color: 'red',
        bgColor: 'bg-red-500/10',
        textColor: 'text-red-600 dark:text-red-400',
        borderColor: 'border-red-500'
      };
    case 'high':
      return {
        label: 'ALTO',
        color: 'orange',
        bgColor: 'bg-orange-500/10',
        textColor: 'text-orange-600 dark:text-orange-400',
        borderColor: 'border-orange-500'
      };
    case 'medium':
      return {
        label: 'MÉDIO',
        color: 'yellow',
        bgColor: 'bg-yellow-500/10',
        textColor: 'text-yellow-600 dark:text-yellow-400',
        borderColor: 'border-yellow-500'
      };
    case 'low':
      return {
        label: 'BAIXO',
        color: 'blue',
        bgColor: 'bg-blue-500/10',
        textColor: 'text-blue-600 dark:text-blue-400',
        borderColor: 'border-blue-500'
      };
  }
}

/**
 * Hook to fetch job health anomalies from v_job_health_anomalies
 * Refreshes every 60 seconds for monitoring
 * ADR-029 CRIT-04: Added loading guard to prevent race conditions
 */
export const useJobAnomalies = () => {
  const { activeTenant, loading } = useActiveTenant();  // ADR-029 CRIT-04: Add loading

  const query = useQuery({
    queryKey: ['job-anomalies', activeTenant?.id],
    queryFn: async (): Promise<JobAnomaly[]> => {
      if (!activeTenant?.id) return [];
      
      // Note: v_job_health_anomalies aggregates job health across the system
      // RLS on base tables (jobs, enrollment_keys) provides tenant isolation
      const { data, error } = await supabase
        .from('v_job_health_anomalies')
        .select('anomaly_type, count, oldest_occurrence, description');

      if (error) {
        logger.error('[useJobAnomalies] Error fetching anomalies', error);
        throw error;
      }

      // Map to our interface
      return ((data || []) as any as Array<Record<string, unknown>>).map((row) => ({
        anomaly_type: String(row.anomaly_type),
        count: Number(row.count || 0),
        oldest_occurrence: String(row.oldest_occurrence || ''),
        description: String(row.description || getDefaultDescription(String(row.anomaly_type)))
      }));
    },
    enabled: !loading && !!activeTenant?.id,  // ADR-029 CRIT-04: Guard with loading state
    refetchInterval: adaptiveInterval,
    staleTime: 30000
  });

  // Calculate summary
  const anomalies = query.data || [];
  const activeAnomalies = anomalies.filter(a => a.count > 0);
  const totalAnomalies = activeAnomalies.reduce((sum, a) => sum + a.count, 0);
  const hasAnomalies = totalAnomalies > 0;
  
  // Check if any critical anomalies exist
  const isCritical = activeAnomalies.some(
    a => getAnomalySeverity(a.anomaly_type) === 'critical'
  );

  // Find oldest anomaly
  const oldestAnomaly = activeAnomalies
    .filter(a => a.oldest_occurrence)
    .map(a => new Date(a.oldest_occurrence!))
    .sort((a, b) => a.getTime() - b.getTime())[0] || null;

  const summary: AnomalySummary = {
    totalAnomalies,
    hasAnomalies,
    isCritical,
    anomalies: activeAnomalies,
    oldestAnomaly
  };

  return {
    ...query,
    summary,
    anomalies: activeAnomalies,
    allAnomalyTypes: anomalies
  };
};

/**
 * Default descriptions for anomaly types
 */
function getDefaultDescription(anomalyType: string): string {
  const descriptions: Record<string, string> = {
    orphan_approved: 'Jobs com approved=true mas status não é "approved"',
    terminal_without_completed_at: 'Jobs terminais sem completed_at definido',
    dlq_divergence: 'Jobs failed sem entrada correspondente no DLQ',
    zombie_delivered: 'Jobs delivered há mais de 2 horas sem execução',
    legacy_pending: 'Jobs com status "pending" (legado, inválido)',
    orphan_dlq: 'Entradas DLQ sem job correspondente',
    expired_active_keys: 'Enrollment keys expiradas mas ainda ativas'
  };
  
  return descriptions[anomalyType] || `Anomalia do tipo: ${anomalyType}`;
}
