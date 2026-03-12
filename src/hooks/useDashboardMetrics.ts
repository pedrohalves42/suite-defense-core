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
  const pendingJobs = jobs.filter(j => j.status === "queued").length;
  const completedJobs = jobs.filter(j => j.status === "completed").length;
  const failedJobs = jobs.filter(j => j.status === "failed").length;
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

  const tenantStats = useMemo(() => {
    const stats: Record<string, { 
      name: string; agentCount: number; offlineCount: number; failedJobsCount: number;
    }> = {};
    
    agents.forEach(agent => {
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
    });
    
    const now = new Date();
    const last24h = 24 * 60 * 60 * 1000;
    jobs.forEach(job => {
      if (job.status === 'failed' && job.created_at) {
        if (now.getTime() - new Date(job.created_at).getTime() < last24h) {
          const agent = agents.find(a => a.agent_name === job.agent_name);
          if (agent && stats[agent.tenant_id]) {
            stats[agent.tenant_id].failedJobsCount++;
          }
        }
      }
    });
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
    if (alerts === 0 && failedJobs === 0) return 'healthy' as const;
    if (alerts > 2 || failedJobs > 5) return 'critical' as const;
    return 'warning' as const;
  }, [alerts, failedJobs]);

  return {
    activeAgents, offlineCount, pendingJobs, completedJobs, failedJobs,
    successRate, alerts, agentsByTenant, sortedTenantsByGravity,
    tenantsWithIssues, onlinePercentage, systemState,
  };
}
