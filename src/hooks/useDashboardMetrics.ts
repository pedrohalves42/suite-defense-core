import { useMemo } from "react";
import { OFFLINE_THRESHOLD_MS } from '@/lib/agent-status-constants';
import type { DashboardAgent, DashboardJob } from "@/types/dashboard";

/**
 * PERF: Safe timestamp parsing — returns 0 on invalid input instead of throwing.
 * Avoids `try/catch` overhead in hot loops.
 */
function safeTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export function useDashboardMetrics(
  agents: DashboardAgent[],
  jobs: DashboardJob[],
  tenantNames: Record<string, string>
) {
  const OFFLINE_MS = OFFLINE_THRESHOLD_MS;

  // PERF: Single pass over agents — compute active count + alerts + agentsByTenant together.
  // Uses Date.parse (number) instead of `new Date()` per row to cut allocations.
  const agentAggregates = useMemo(() => {
    const now = Date.now();
    let activeCount = 0;
    let alertCount = 0;
    const byTenant: Record<string, number> = {};

    for (const a of agents) {
      const hb = safeTime(a.last_heartbeat);
      const diff = hb === 0 ? Infinity : now - hb;
      const isActive = hb !== 0 && diff >= 0 && diff < OFFLINE_MS;
      if (isActive) activeCount++;
      // Alert criterion: missing heartbeat OR exceeded threshold
      if (hb === 0 || diff > OFFLINE_MS) alertCount++;

      byTenant[a.tenant_id] = (byTenant[a.tenant_id] || 0) + 1;
    }

    return { activeCount, alertCount, agentsByTenant: byTenant };
  }, [agents, OFFLINE_MS]);

  const offlineCount = agents.length - agentAggregates.activeCount;
  const alerts = agentAggregates.alertCount;
  const agentsByTenant = agentAggregates.agentsByTenant;

  // PERF: Single pass over jobs for status counters
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

  // PERF: Temporal trends in single pass — avoids 4x .filter() chains over jobs[]
  const trends = useMemo(() => {
    const now = Date.now();
    const h24 = 24 * 60 * 60 * 1000;
    let recentTotal = 0, prevTotal = 0;
    let recentFailed = 0, prevFailed = 0;
    let recentCompleted = 0, prevCompleted = 0;

    for (const j of jobs) {
      const created = safeTime(j.created_at);
      if (created === 0) continue;
      const age = now - created;
      if (age < h24) {
        recentTotal++;
        if (j.status === 'failed') recentFailed++;
        else if (j.status === 'completed') recentCompleted++;
      } else if (age < h24 * 2) {
        prevTotal++;
        if (j.status === 'failed') prevFailed++;
        else if (j.status === 'completed') prevCompleted++;
      }
    }

    const recentSuccessRate = recentCompleted + recentFailed > 0
      ? (recentCompleted / (recentCompleted + recentFailed)) * 100 : 100;
    const prevSuccessRate = prevCompleted + prevFailed > 0
      ? (prevCompleted / (prevCompleted + prevFailed)) * 100 : 100;

    return {
      failedTrend: recentFailed - prevFailed,
      successRateTrend: Math.round(recentSuccessRate - prevSuccessRate),
      totalJobsTrend: recentTotal - prevTotal,
    };
  }, [jobs]);

  // PERF: Single-pass tenant stats with O(1) agent name lookup
  const tenantStats = useMemo(() => {
    const stats: Record<string, {
      name: string; agentCount: number; offlineCount: number; failedJobsCount: number;
    }> = {};
    const agentTenantMap = new Map<string, string>();
    const now = Date.now();

    for (const agent of agents) {
      agentTenantMap.set(agent.agent_name, agent.tenant_id);
      if (!stats[agent.tenant_id]) {
        stats[agent.tenant_id] = {
          name: tenantNames[agent.tenant_id] || agent.tenant_id.slice(0, 8) + '...',
          agentCount: 0, offlineCount: 0, failedJobsCount: 0
        };
      }
      stats[agent.tenant_id].agentCount++;
      const hb = safeTime(agent.last_heartbeat);
      const isOffline = hb === 0 || (now - hb) > OFFLINE_MS;
      if (isOffline) stats[agent.tenant_id].offlineCount++;
    }

    const last24h = 24 * 60 * 60 * 1000;
    for (const job of jobs) {
      if (job.status !== 'failed') continue;
      const created = safeTime(job.created_at);
      if (created === 0 || now - created >= last24h) continue;
      const tid = agentTenantMap.get(job.agent_name);
      if (tid && stats[tid]) {
        stats[tid].failedJobsCount++;
      }
    }
    return stats;
  }, [agents, jobs, tenantNames, OFFLINE_MS]);

  const sortedTenantsByGravity = useMemo(() => {
    const order = { critical: 0, warning: 1, healthy: 2 } as const;
    return Object.entries(tenantStats)
      .map(([tenantId, data]) => ({
        tenantId, ...data,
        severity: data.offlineCount > 2 || data.failedJobsCount > 3 ? 'critical' as const :
                  data.offlineCount > 0 || data.failedJobsCount > 0 ? 'warning' as const : 'healthy' as const
      }))
      .sort((a, b) => order[a.severity] - order[b.severity]);
  }, [tenantStats]);

  const tenantsWithIssues = useMemo(
    () => sortedTenantsByGravity.reduce((n, t) => n + (t.severity !== 'healthy' ? 1 : 0), 0),
    [sortedTenantsByGravity]
  );

  const onlinePercentage = agents.length > 0
    ? ((agentAggregates.activeCount / agents.length) * 100).toFixed(0) : '0';

  const systemState = useMemo(() => {
    const currentHour = new Date().getHours();
    const isBusinessHours = currentHour >= 7 && currentHour < 20;
    const effectiveAlerts = isBusinessHours ? alerts : 0;

    if (effectiveAlerts === 0 && failedJobs === 0) return 'healthy' as const;
    if (effectiveAlerts > 2 || failedJobs > 5) return 'critical' as const;
    return 'warning' as const;
  }, [alerts, failedJobs]);

  // PERF: activeAgents only computed if a consumer needs the array (rare).
  // Recomputed lazily via useMemo with same deps to keep referential stability.
  const activeAgents = useMemo(() => {
    const now = Date.now();
    return agents.filter(a => {
      const hb = safeTime(a.last_heartbeat);
      if (hb === 0) return false;
      const diff = now - hb;
      return diff >= 0 && diff < OFFLINE_MS;
    });
  }, [agents, OFFLINE_MS]);

  return {
    activeAgents, offlineCount, pendingJobs, completedJobs, failedJobs,
    successRate, alerts, agentsByTenant, sortedTenantsByGravity,
    tenantsWithIssues, onlinePercentage, systemState, trends,
  };
}

