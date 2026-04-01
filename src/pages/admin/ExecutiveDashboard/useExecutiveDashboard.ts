import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTodayRiskDelta, getDeltaInfo, formatCurrency } from '@/hooks/useRiskDelta';
import { useUnifiedMetrics } from '@/hooks/useUnifiedMetrics';
import { subDays } from 'date-fns';
import { logger } from '@/lib/logger';

export function useExecutiveDashboard() {
  const { metrics, isLoading: unifiedLoading, refetch: refetchUnified, tenant } = useUnifiedMetrics();
  const tenantId = tenant?.id;
  const { data: riskDelta } = useTodayRiskDelta();

  const { data: execData, isLoading: execLoading, refetch: refetchExec } = useQuery({
    queryKey: ['executive-extra', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const now = new Date();
      const today = new Date(now); today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();
      const thirtyDaysAgo = subDays(now, 30).toISOString();

      const [jobsTodayRes, jobs30dRes, complianceRes] = await Promise.all([
        supabase.from('jobs').select('status, type').eq('tenant_id', tenantId).gte('created_at', todayISO),
        supabase.from('jobs').select('status, type').eq('tenant_id', tenantId).gte('created_at', thirtyDaysAgo),
        supabase.from('compliance_snapshots').select('overall_score, grade, category_scores, calculated_at').eq('tenant_id', tenantId).order('calculated_at', { ascending: false }).limit(1),
      ]);

      const jobsToday: Array<{ status: string; type: string }> = jobsTodayRes.data || [];
      const jobs30d: Array<{ status: string; type: string }> = jobs30dRes.data || [];
      const compliance = complianceRes.data?.[0] || null;

      return {
        compliance,
        automatedJobsCompleted: jobs30d.filter(j => j.status === 'completed').length,
        totalJobs30d: jobs30d.length,
        successRateToday: jobsToday.length > 0 ? Math.round((jobsToday.filter(j => j.status === 'completed').length / jobsToday.length) * 100) : 100,
        totalJobsToday: jobsToday.length,
        completedJobsToday: jobsToday.filter(j => j.status === 'completed').length,
        failedJobsToday: jobsToday.filter(j => j.status === 'failed').length,
        lastUpdate: new Date(),
      };
    },
    enabled: !!tenantId,
    refetchInterval: false,
    staleTime: 600_000,
  });

  const [complianceTriggered, setComplianceTriggered] = useState(false);
  useEffect(() => {
    if (!tenantId || !execData || complianceTriggered) return;
    const needsCalc = !execData.compliance ||
      (execData.compliance?.calculated_at &&
        (Date.now() - new Date(execData.compliance.calculated_at).getTime()) > 3600000);
    if (needsCalc) {
      setComplianceTriggered(true);
      supabase.functions.invoke('calculate-compliance', { body: { tenant_id: tenantId } })
        .then(() => { setTimeout(() => refetchExec(), 3000); })
        .catch((err: unknown) => logger.error('Compliance calc failed', err instanceof Error ? err : undefined));
    }
  }, [tenantId, execData, complianceTriggered, refetchExec]);

  const isLoading = unifiedLoading || execLoading;

  const refetch = () => {
    refetchUnified();
    refetchExec();
    if (tenantId) {
      supabase.functions.invoke('calculate-compliance', { body: { tenant_id: tenantId } })
        .then(() => { setTimeout(() => refetchExec(), 3000); })
        .catch((err: unknown) => logger.error('Compliance recalc failed', err instanceof Error ? err : undefined));
    }
  };

  const totalAgents = metrics?.agents.total || 0;
  const onlineAgents = metrics?.agents.online || 0;
  const offlineAgents = (metrics?.agents.offline || 0) + (metrics?.agents.neverConnected || 0);
  const protectionCoverage = metrics?.agents.protectionPercent || 0;
  const agentHealthScore = totalAgents > 0 ? (onlineAgents / totalAgents) * 100 : 100;
  const alertPenalty = Math.min((metrics?.alerts.active || 0) * 5, 30);
  const overallScore = Math.max(0, Math.round(agentHealthScore - alertPenalty));

  const summaryData = metrics && execData ? {
    activeAlerts: metrics.alerts.active,
    criticalAlerts: metrics.alerts.critical,
    blockedThreats: metrics.blocked.last7d,
    actions30d: {
      auto_repairs: metrics.evidence.autoRepairs,
      auto_detections: 0,
      auto_recoveries: metrics.evidence.autoRecoveries,
      critical_prevented: metrics.evidence.criticalPrevented,
      high_prevented: metrics.evidence.highPrevented,
      medium_prevented: metrics.evidence.mediumPrevented,
      policy_corrections: metrics.evidence.policyDrifts,
      blocked_access: metrics.blocked.last7d,
      total_events: metrics.evidence.incidentsContained + metrics.evidence.autoRepairs + metrics.evidence.autoRecoveries + metrics.evidence.policyDrifts,
    },
    automatedActions: metrics.evidence.autoRepairs + metrics.evidence.autoRecoveries + metrics.evidence.policyDrifts,
    incidentsContained: metrics.evidence.incidentsContained,
    hoursOfITSaved: metrics.financial.hoursOfITSaved,
    automatedJobsCompleted: execData.automatedJobsCompleted,
    totalJobs30d: execData.totalJobs30d,
    financialImpact: metrics.financial.breakdown,
    totalCostAvoided: metrics.financial.totalCostAvoided,
    events7d: {
      critical: metrics.evidence.criticalPrevented,
      high: metrics.evidence.highPrevented,
      warning: metrics.evidence.mediumPrevented,
      info: 0,
    },
    compliance: execData.compliance,
    successRateToday: execData.successRateToday,
    totalJobsToday: execData.totalJobsToday,
    completedJobsToday: execData.completedJobsToday,
    failedJobsToday: execData.failedJobsToday,
    lastUpdate: execData.lastUpdate,
  } : null;

  const deltaInfo = getDeltaInfo(riskDelta?.delta ?? null);

  return {
    isLoading,
    refetch,
    totalAgents,
    onlineAgents,
    offlineAgents,
    overallScore,
    summaryData,
    deltaInfo,
    formatCurrency,
  };
}
