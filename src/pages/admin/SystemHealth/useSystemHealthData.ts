import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { format, ptBR } from '@/lib/date-utils';

interface AgentStats {
  total: number; active: number; pending: number; inactive: number;
  healthy: number; stale: number; offline: number;
}

interface JobStats {
  total: number; completed: number; failed: number; pending: number;
  delivered: number; v3: number; avgCompletionTime: number; stuckCount: number;
}

interface PerformanceMetric {
  name: string; avgDuration: number; callCount: number; errorCount: number;
}

interface AIInsightsStats {
  total: number; critical: number; high: number; medium: number; low: number; info: number;
}

export function useSystemHealthData() {
  const { tenant, loading: tenantLoading } = useTenant();

  const { data: agentStats, isLoading: loadingAgents } = useQuery<AgentStats | null>({
    queryKey: ["system-health-agents", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const { data: rpcData, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id, p_include_archived: false,
      });
      if (error) throw error;
      const rawArr = Array.isArray(rpcData) ? rpcData : [];
      const data = (rawArr as unknown as Array<{ id: string; status: string; last_heartbeat: string | null }>)
        .map(a => ({ id: a.id, status: a.status, last_heartbeat: a.last_heartbeat }));

      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

      return {
        total: data.length,
        active: data.filter(a => a.status === 'active').length,
        pending: data.filter(a => a.status === 'pending').length,
        inactive: data.filter(a => a.status === 'inactive').length,
        healthy: data.filter(a => a.last_heartbeat && new Date(String(a.last_heartbeat)) > fiveMinutesAgo).length,
        stale: data.filter(a => a.last_heartbeat && new Date(String(a.last_heartbeat)) <= fiveMinutesAgo && new Date(String(a.last_heartbeat)) > thirtyMinutesAgo).length,
        offline: data.filter(a => !a.last_heartbeat || new Date(String(a.last_heartbeat)) <= thirtyMinutesAgo).length,
      };
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: false,
  });

  const { data: jobStats, isLoading: loadingJobs } = useQuery<JobStats | null>({
    queryKey: ["system-health-jobs", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("jobs")
        .select("id, status, output, created_at, completed_at, delivered_at")
        .eq("tenant_id", tenant.id)
        .gte("created_at", twentyFourHoursAgo);
      if (error) throw error;

      const completedJobs = data.filter(j => j.status === 'completed' && j.completed_at && j.created_at);
      const avgCompletionTime = completedJobs.length > 0
        ? completedJobs.reduce((acc, j) => acc + (new Date(j.completed_at).getTime() - new Date(j.created_at).getTime()), 0) / completedJobs.length / 1000
        : 0;

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const stuckJobs = data.filter(j => j.status === 'delivered' && j.delivered_at && new Date(j.delivered_at) < oneHourAgo);

      return {
        total: data.length,
        completed: data.filter(j => j.status === 'completed').length,
        failed: data.filter(j => j.status === 'failed').length,
        pending: data.filter(j => ['queued', 'pending'].includes(j.status)).length,
        delivered: data.filter(j => j.status === 'delivered').length,
        v3: data.filter(j => j.output !== null).length,
        avgCompletionTime: Math.round(avgCompletionTime),
        stuckCount: stuckJobs.length,
      };
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: false,
  });

  const { data: jobsOverTime, isLoading: loadingTimeline } = useQuery({
    queryKey: ["system-health-jobs-timeline", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("jobs")
        .select("created_at, status")
        .eq("tenant_id", tenant.id)
        .gte("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const hourlyData: Record<string, { hour: string; total: number; completed: number; failed: number }> = {};
      data.forEach(job => {
        const hour = format(new Date(job.created_at), "HH:00");
        if (!hourlyData[hour]) hourlyData[hour] = { hour, total: 0, completed: 0, failed: 0 };
        hourlyData[hour].total++;
        if (job.status === 'completed') hourlyData[hour].completed++;
        if (job.status === 'failed') hourlyData[hour].failed++;
      });
      return Object.values(hourlyData).slice(-12);
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
  });

  const { data: aiInsightsStats, isLoading: loadingInsights } = useQuery<AIInsightsStats | null>({
    queryKey: ["system-health-ai-insights", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const { data, error } = await supabase
        .from("ai_insights")
        .select("id, severity, acknowledged")
        .eq("tenant_id", tenant.id)
        .eq("acknowledged", false);
      if (error) throw error;
      return {
        total: data.length,
        critical: data.filter(i => i.severity === 'critical').length,
        high: data.filter(i => i.severity === 'high').length,
        medium: data.filter(i => i.severity === 'medium').length,
        low: data.filter(i => i.severity === 'low').length,
        info: data.filter(i => i.severity === 'info').length,
      };
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
  });

  const { data: performanceMetrics, isLoading: loadingPerformance } = useQuery<PerformanceMetric[]>({
    queryKey: ["system-health-performance"],
    queryFn: async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("performance_metrics")
        .select("function_name, duration_ms, status_code")
        .gte("created_at", twentyFourHoursAgo);
      if (error) throw error;

      const functionStats = data.reduce((acc, metric) => {
        if (!acc[metric.function_name]) acc[metric.function_name] = { count: 0, totalDuration: 0, errorCount: 0 };
        acc[metric.function_name].count++;
        acc[metric.function_name].totalDuration += metric.duration_ms;
        if (metric.status_code && metric.status_code >= 400) acc[metric.function_name].errorCount++;
        return acc;
      }, {} as Record<string, { count: number; totalDuration: number; errorCount: number }>);

      return Object.entries(functionStats)
        .map(([name, stats]) => ({ name, avgDuration: Math.round(stats.totalDuration / stats.count), callCount: stats.count, errorCount: stats.errorCount }))
        .filter(s => s.avgDuration > 1000)
        .sort((a, b) => b.avgDuration - a.avgDuration)
        .slice(0, 5);
    },
    refetchInterval: false,
    staleTime: 600_000,
  });

  const isLoading = loadingAgents || loadingJobs || loadingPerformance || loadingTimeline || loadingInsights;

  // Derived metrics
  const onlineOrWarningCount = agentStats ? (agentStats.healthy + agentStats.stale) : 0;
  const healthScore = agentStats && agentStats.total > 0 ? Math.round((onlineOrWarningCount / agentStats.total) * 100) : 0;
  const jobSuccessRate = jobStats?.total ? Math.round((jobStats.completed / jobStats.total) * 100) : 0;
  const v3AdoptionRate = jobStats?.total ? Math.round((jobStats.v3 / jobStats.total) * 100) : 0;

  const currentHour = new Date().getHours();
  const isBusinessHours = currentHour >= 7 && currentHour < 20;
  const hasActiveAgents = agentStats ? agentStats.total > 0 : false;

  const overallHealth = (() => {
    if (!hasActiveAgents) return "healthy";
    const hasCriticalFailures = jobSuccessRate < 50 && (jobStats?.total || 0) > 5;
    const hasStuckJobs = (jobStats?.stuckCount || 0) > 0;
    if (hasCriticalFailures) return "critical";
    if (isBusinessHours) {
      if (healthScore >= 70 && jobSuccessRate >= 80 && !hasStuckJobs) return "healthy";
      if (healthScore >= 30 && jobSuccessRate >= 60) return "degraded";
      if (healthScore < 20) return "critical";
      return "degraded";
    } else {
      if (jobSuccessRate >= 80 && !hasStuckJobs) return "healthy";
      if (hasStuckJobs || jobSuccessRate < 60) return "degraded";
      return "healthy";
    }
  })();

  return {
    isLoading, agentStats, jobStats, jobsOverTime, aiInsightsStats, performanceMetrics,
    healthScore, jobSuccessRate, v3AdoptionRate, overallHealth,
  };
}
