import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useCalculatedSLOs } from '@/hooks/useSLOData';
import { logger } from '@/lib/logger';

export interface SLOMetrics {
  heartbeat: { target: number; current: number; errorBudgetUsed: number; status: 'healthy' | 'warning' | 'critical' };
  jobExecution: { target: number; current: number; errorBudgetUsed: number; status: 'healthy' | 'warning' | 'critical' };
  agentUptime: { target: number; current: number; errorBudgetUsed: number; status: 'healthy' | 'warning' | 'critical' };
}

export interface JobStats { total: number; completed: number; failed: number; pending: number; successRate: number; }
export interface AgentStats { total: number; online: number; offline: number; pending: number; healthyRate: number; }

export function useSLOMetrics() {
  const { tenant, loading: tenantLoading } = useTenant();
  const tenantId = tenant?.id;
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<SLOMetrics | null>(null);
  const [jobStats, setJobStats] = useState<JobStats | null>(null);
  const [agentStats, setAgentStats] = useState<AgentStats | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const { data: calculatedSLOs, isLoading: sloLoading } = useCalculatedSLOs();

  useEffect(() => {
    if (tenantId) {
      loadMetrics();
      const interval = setInterval(loadMetrics, 300_000);
      return () => clearInterval(interval);
    }
  }, [tenantId]);

  async function loadMetrics() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data: agentsRaw } = await supabase.rpc('get_agents_list', { p_tenant_id: tenantId, p_include_archived: false });
      const agents = (agentsRaw as unknown as Array<{ id: string; status: string; last_heartbeat: string | null }>) || [];
      const now = new Date();
      const cutoff = new Date(now.getTime() - 30 * 60 * 1000);
      const online = agents.filter(a => a.last_heartbeat && new Date(a.last_heartbeat) > cutoff).length;
      const offline = agents.filter(a => a.last_heartbeat && new Date(a.last_heartbeat) <= cutoff).length;
      const pending = agents.filter(a => !a.last_heartbeat).length;

      setAgentStats({ total: agents.length, online, offline, pending, healthyRate: agents.length > 0 ? (online / agents.length) * 100 : 100 });

      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { data: jobs } = await supabase.from('jobs').select('id, status').eq('tenant_id', tenantId).gte('created_at', oneDayAgo);
      const jobData = jobs || [];
      const completed = jobData.filter(j => j.status === 'completed').length;
      const failed = jobData.filter(j => j.status === 'failed').length;
      const pendingJobs = jobData.filter(j => ['queued', 'delivered'].includes(j.status)).length;
      const jobSuccessRate = jobData.length > 0 ? (completed / (completed + failed)) * 100 : 100;

      setJobStats({ total: jobData.length, completed, failed, pending: pendingJobs, successRate: isNaN(jobSuccessRate) ? 100 : jobSuccessRate });

      const heartbeatSLO = 99.9, jobSLO = 99.5, uptimeSLO = 99.0;
      const currentHeartbeat = agents.length > 0 ? (online / agents.length) * 100 : 100;
      const currentUptime = agents.length > 0 ? ((online + pending) / agents.length) * 100 : 100;

      const calcBudget = (current: number, target: number) => Math.min(100, Math.max(0, ((100 - current) / (100 - target)) * 100));
      const hb = calcBudget(currentHeartbeat, heartbeatSLO);
      const jb = calcBudget(jobSuccessRate, jobSLO);
      const ub = calcBudget(currentUptime, uptimeSLO);
      const getStatus = (v: number) => v > 80 ? 'critical' as const : v > 50 ? 'warning' as const : 'healthy' as const;

      setMetrics({
        heartbeat: { target: heartbeatSLO, current: currentHeartbeat, errorBudgetUsed: isNaN(hb) ? 0 : hb, status: getStatus(isNaN(hb) ? 0 : hb) },
        jobExecution: { target: jobSLO, current: isNaN(jobSuccessRate) ? 100 : jobSuccessRate, errorBudgetUsed: isNaN(jb) ? 0 : jb, status: getStatus(isNaN(jb) ? 0 : jb) },
        agentUptime: { target: uptimeSLO, current: currentUptime, errorBudgetUsed: isNaN(ub) ? 0 : ub, status: getStatus(isNaN(ub) ? 0 : ub) },
      });
      setLastUpdated(new Date());
    } catch (error) {
      logger.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  }

  return { loading, metrics, jobStats, agentStats, lastUpdated, calculatedSLOs, sloLoading };
}
