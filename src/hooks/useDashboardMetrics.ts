import { useMemo } from "react";
import { OFFLINE_THRESHOLD_MS } from '@/lib/agent-status-constants';
import type { DashboardAgent, DashboardJob } from "./useDashboardData";

export function useDashboardMetrics(
  agents: DashboardAgent[],
  jobs: DashboardJob[],
  tenantNames: Record<string, string>
) {
  const OFFLINE_MS = OFFLINE_THRESHOLD_MS;

  const activeAgents = useMemo(() => agents.filter(a => {
    if (!a.last_heartbeat) return false;
    try {
      const diffMs = new Date().getTime() - new Date(a.last_heartbeat).getTime();
      return diffMs >= 0 && diffMs < OFFLINE_MS;
    } catch { return false; }
  }), [agents, OFFLINE_MS]);

  const offlineCount = agents.length - activeAgents.length;
  const { pendingJobs, completedJobs, failedJobs } = useMemo(() => {
    let pending = 0, completed = 0, failed = 0;
    for (const j of jobs) {
      if (j.status === 'queued') pending++;
      else if (j.status === 'completed') completed++;
      else if (j.status === 'failed') failed++;
    }
    return { pendingJobs: pending, completedJobs: completed, failedJobs: failed };
  }, [jobs]);
  const successRate = completedJobs + failedJobs > 0 
    ? ((completedJobs / (completedJobs + failedJobs)) * 100).toFixed(0) : '100';

  const alerts = useMemo(() => agents.filter(a => {
    if (!a.last_heartbeat) return true;
    return (new Date().getTime() - new Date(a.last_heartbeat).getTime()) > 5 * 60 * 1000;
  }).length, [agents]);

  const agentsByTenant = useMemo(() => agents.reduce((acc, agent) => {
    acc[agent.tenant_id] = (acc[agent.tenant_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), [agents]);

  // Temporal comparison: last 24h vs previous 24h
  const trends = useMemo(() => {
    const now = new Date().getTime();
    const h24 = 24 * 60 * 60 * 1000;
    const recentJobs = jobs.filter(j => now - new Date(j.created_at).getTime() < h24);
    const prevJobs = jobs.filter(j => {
      const age = now - new Date(j.created_at).getTime();
      return age >= h24 && age < h24 * 2;
    });

    const recentFailed = recentJobs.filter(j => j.status === "failed").length;
    const prevFailed = prevJobs.filter(j => j.status === "failed").length;
    const recentCompleted = recentJobs.filter(j => j.status === "completed").length;
    const prevCompleted = prevJobs.filter(j => j.status === "completed").length;

    const recentSuccessRate = recentCompleted + recentFailed > 0
      ? (recentCompleted / (recentCompleted + recentFailed)) * 100 : 100;
    const prevSuccessRate = prevCompleted + prevFailed > 0
      ? (prevCompleted / (prevCompleted + prevFailed)) * 100 : 100;

    return {
      failedTrend: recentFailed - prevFailed, // positive = worse
      successRateTrend: Math.round(recentSuccessRate - prevSuccessRate), // positive = better
      totalJobsTrend: recentJobs.length - prevJobs.length,
    };
  }, [jobs]);

  // P-13002 FIX: Single pass over agents+jobs, build agentNameToTenant map to avoid O(n²) .find()
  const tenantStats = useMemo(() => {
    const stats: Record<string, { 
      name: string; agentCount: number; offlineCount: number; failedJobsCount: number;
    }> = {};
    
    // Build agent name → tenant lookup (O(n))
    const agentTenantMap = new Map<string, string>();
    
    for (const agent of agents) {
      agentTenantMap.set(agent.agent_name, agent.tenant_id);
      if (!stats[agent.tenant_id]) {
        stats[agent.tenant_id] = {
          name: tenantNames[agent.tenant_id] || agent.tenant_id.slice(0, 8) + '...',
          agentCount: 0, offlineCount: 0, failedJobsCount: 0
        };
      }
      stats[agent.tenant_id].agentCount++;
      const isOffline = !agent.last_heartbeat || 
        (new Date().getTime() - new Date(agent.last_heartbeat).getTime()) > OFFLINE_MS;
      if (isOffline) stats[agent.tenant_id].offlineCount++;
    }
    
    const now = new Date().getTime();
    const last24h = 24 * 60 * 60 * 1000;
    for (const job of jobs) {
      if (job.status === 'failed' && job.created_at) {
        if (now - new Date(job.created_at).getTime() < last24h) {
          // P-13002: O(1) lookup instead of O(n) .find()
          const tid = agentTenantMap.get(job.agent_name);
          if (tid && stats[tid]) {
            stats[tid].failedJobsCount++;
          }
        }
      }
    }
    return stats;
  }, [agents, jobs, tenantNames, OFFLINE_MS]);

  const sortedTenantsByGravity = useMemo(() => {
    return Object.entries(tenantStats)
      .map(([tenantId, data]) => ({
        tenantId, ...data,
        severity: data.offlineCount > 2 || data.failedJobsCount > 3 ? 'critical' as const :
                  data.offlineCount > 0 || data.failedJobsCount > 0 ? 'warning' as const : 'healthy' as const
      }))
      .sort((a, b) => {
        const order = { critical: 0, warning: 1, healthy: 2 };
        return order[a.severity] - order[b.severity];
      });
  }, [tenantStats]);

  const tenantsWithIssues = sortedTenantsByGravity.filter(t => t.severity !== 'healthy').length;

  const onlinePercentage = agents.length > 0 
    ? ((activeAgents.length / agents.length) * 100).toFixed(0) : '0';

  const systemState = useMemo(() => {
    const currentHour = new Date().getHours();
    const isBusinessHours = currentHour >= 7 && currentHour < 20;
    
    // Outside business hours, offline agents are expected
    const effectiveAlerts = isBusinessHours ? alerts : 0;
    
    if (effectiveAlerts === 0 && failedJobs === 0) return 'healthy' as const;
    if (effectiveAlerts > 2 || failedJobs > 5) return 'critical' as const;
    return 'warning' as const;
  }, [alerts, failedJobs]);

  return {
    activeAgents, offlineCount, pendingJobs, completedJobs, failedJobs,
    successRate, alerts, agentsByTenant, sortedTenantsByGravity,
    tenantsWithIssues, onlinePercentage, systemState, trends,
  };
}
