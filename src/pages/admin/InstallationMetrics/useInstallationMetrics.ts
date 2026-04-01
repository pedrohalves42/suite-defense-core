import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface AgentInstallationMetrics {
  tenant_id: string;
  platform: string;
  total_generated: number;
  total_downloaded: number;
  total_copied: number;
  total_installed: number;
  successful_events: number;
  failed_events: number;
  avg_install_time_seconds: number;
  with_network: number;
  without_network: number;
  last_event_at: string;
}

interface InstallationErrorSummary {
  tenant_id: string;
  platform: string;
  event_type: string;
  error_message: string;
  error_count: number;
  last_occurrence: string;
}

interface InstallationHealthStatus {
  tenant_id: string;
  total_agents: number;
  active_agents: number;
  pending_agents: number;
  stuck_agents: number;
  activation_rate_pct: number;
  window_interval: string;
}

export type { AgentInstallationMetrics, InstallationErrorSummary, InstallationHealthStatus };

export function useInstallationMetrics() {
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['agent-installation-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_installation_metrics' as 'agents')
        .select('tenant_id, platform, total_generated, total_downloaded, total_copied, total_installed, successful_events, failed_events, avg_install_time_seconds, with_network, without_network, last_event_at');
      if (error) throw error;
      return data as unknown as AgentInstallationMetrics[];
    },
  });

  const { data: errors, isLoading: errorsLoading } = useQuery({
    queryKey: ['installation-error-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installation_error_summary' as 'agents')
        .select('tenant_id, platform, event_type, error_message, error_count, last_occurrence')
        .limit(20);
      if (error) throw error;
      return data as unknown as InstallationErrorSummary[];
    },
  });

  const { data: healthStatus, isLoading: healthLoading } = useQuery({
    queryKey: ['installation-health-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installation_health_status' as 'agents')
        .select('tenant_id, total_agents, active_agents, pending_agents, stuck_agents, activation_rate_pct, window_interval');
      if (error) throw error;
      return data as unknown as InstallationHealthStatus[];
    },
  });

  const isLoading = metricsLoading || errorsLoading || healthLoading;

  const totalMetrics = metrics?.reduce((acc, curr) => ({
    total_generated: acc.total_generated + (curr.total_generated || 0),
    total_downloaded: acc.total_downloaded + (curr.total_downloaded || 0),
    total_copied: acc.total_copied + (curr.total_copied || 0),
    total_installed: acc.total_installed + (curr.total_installed || 0),
    successful_events: acc.successful_events + (curr.successful_events || 0),
    failed_events: acc.failed_events + (curr.failed_events || 0),
    avg_install_time_seconds: acc.avg_install_time_seconds + (curr.avg_install_time_seconds || 0),
    with_network: acc.with_network + (curr.with_network || 0),
    without_network: acc.without_network + (curr.without_network || 0),
    count: acc.count + 1,
  }), {
    total_generated: 0, total_downloaded: 0, total_copied: 0, total_installed: 0,
    successful_events: 0, failed_events: 0, avg_install_time_seconds: 0,
    with_network: 0, without_network: 0, count: 0,
  });

  const totalAttempts = totalMetrics
    ? totalMetrics.total_generated + totalMetrics.total_downloaded + totalMetrics.total_copied + totalMetrics.total_installed
    : 0;

  const successRate = totalMetrics && totalAttempts > 0
    ? ((totalMetrics.successful_events / totalAttempts) * 100).toFixed(1) : '0';

  const avgInstallTime = totalMetrics && totalMetrics.count > 0
    ? (totalMetrics.avg_install_time_seconds / totalMetrics.count).toFixed(1) : '0';

  const platformMetrics = metrics?.reduce((acc, curr) => {
    const platform = curr.platform?.toLowerCase() || 'unknown';
    if (!acc[platform]) acc[platform] = { total: 0, success: 0, failed: 0, avgTime: 0, count: 0 };
    const platformTotal = (curr.total_generated || 0) + (curr.total_downloaded || 0) + (curr.total_copied || 0) + (curr.total_installed || 0);
    acc[platform].total += platformTotal;
    acc[platform].success += curr.successful_events || 0;
    acc[platform].failed += curr.failed_events || 0;
    acc[platform].avgTime += curr.avg_install_time_seconds || 0;
    acc[platform].count += 1;
    return acc;
  }, {} as Record<string, { total: number; success: number; failed: number; avgTime: number; count: number }>);

  const errorsByPlatform = errors?.reduce((acc, err) => {
    const platform = err.platform || 'unknown';
    if (!acc[platform]) acc[platform] = [];
    acc[platform].push(err);
    return acc;
  }, {} as Record<string, InstallationErrorSummary[]>);

  const healthSummary = healthStatus?.[0];
  const healthLevel = healthSummary
    ? (healthSummary.activation_rate_pct >= 80 ? 'healthy' : healthSummary.activation_rate_pct >= 50 ? 'warning' : 'unhealthy')
    : 'no_data';

  return {
    metrics, errors, isLoading, totalMetrics, totalAttempts,
    successRate, avgInstallTime, platformMetrics,
    errorsByPlatform, healthSummary, healthLevel,
  };
}
