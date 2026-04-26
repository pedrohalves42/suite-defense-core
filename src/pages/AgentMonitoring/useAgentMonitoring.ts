import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { getAgentOnlineStatus } from '@/lib/agent-status-constants';
import { logger } from '@/lib/logger';
import { realtimeChannelManager } from '@/lib/realtime-manager';
import { subDays } from 'date-fns';
import { toast } from 'sonner';
import type { Agent, Job, UptimeDataPoint, ScansTrendPoint, JobsTrendPoint, GlobalStatus } from './types';

export function useAgentMonitoring() {
  const { tenant, loading: tenantLoading } = useTenant();
  const queryClient = useQueryClient();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const instanceId = useRef(`monitor-${Math.random().toString(36).substring(2, 9)}`).current;

  const getAgentCalculatedStatus = (agent: Agent): 'online' | 'warning' | 'offline' | 'never_connected' => {
// ... keep existing code
  // Sync state
  useEffect(() => {
    if (initialAgents) setAgents(initialAgents);
    if (initialJobs) setRecentJobs(initialJobs);
  }, [initialAgents, initialJobs]);

  // Realtime
  useEffect(() => {
    if (!tenant?.id) return;

    logger.debug('[useAgentMonitoring] Setting up realtime subscriptions via manager');

    // Subscribe to Agents
    realtimeChannelManager.subscribe(
      `${instanceId}-agents`,
      'agents',
      `tenant_id=eq.${tenant.id}`,
      (payload) => {
        logger.debug('Agent change via manager', { payload });
        if (payload.eventType === 'INSERT') {
          setAgents(prev => [payload.new as Agent, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setAgents(prev => prev.map(a => a.id === payload.new.id ? payload.new as Agent : a));
        } else if (payload.eventType === 'DELETE') {
          setAgents(prev => prev.filter(a => a.id !== payload.old.id));
        }
        setLastUpdate(new Date());
      }
    );

    // Subscribe to Jobs
    realtimeChannelManager.subscribe(
      `${instanceId}-jobs`,
      'jobs',
      `tenant_id=eq.${tenant.id}`,
      (payload) => {
        logger.debug('Job change via manager', { payload });
        if (payload.eventType === 'INSERT') {
          setRecentJobs(prev => [payload.new as Job, ...prev].slice(0, 10));
        } else if (payload.eventType === 'UPDATE') {
          setRecentJobs(prev => prev.map(j => j.id === payload.new.id ? payload.new as Job : j));
        }
        setLastUpdate(new Date());
      }
    );

    return () => {
      logger.debug('[useAgentMonitoring] Cleaning up realtime subscriptions');
      realtimeChannelManager.unsubscribe(`${instanceId}-agents`, 'agents', `tenant_id=eq.${tenant.id}`);
      realtimeChannelManager.unsubscribe(`${instanceId}-jobs`, 'jobs', `tenant_id=eq.${tenant.id}`);
    };
  }, [tenant?.id, instanceId]);

  // Metrics
  const totalAgents = agents.length;
  const onlineAgents = agents.filter(a => {
    const status = getAgentCalculatedStatus(a);
    return status === 'online' || status === 'warning';
  }).length;
  const offlineAgents = agents.filter(a => {
    const status = getAgentCalculatedStatus(a);
    return status === 'offline' || status === 'never_connected';
  }).length;
  const failedJobs = recentJobs.filter(j => j.status === 'failed').length;
  const finishedJobs = recentJobs.filter(j => j.status === 'completed' || j.status === 'failed');
  const successRate = finishedJobs.length > 0
    ? Math.round((finishedJobs.filter(j => j.status === 'completed').length / finishedJobs.length) * 100)
    : 100;

  const globalStatus = useMemo<GlobalStatus>(() => {
    if (offlineAgents === 0 && successRate >= 90) return 'healthy';
    if (offlineAgents > 2 || successRate < 50) return 'critical';
    return 'warning';
  }, [offlineAgents, successRate]);

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      const getMinutes = (agent: Agent) => {
        if (!agent.last_heartbeat) return 999999;
        return (Date.now() - new Date(agent.last_heartbeat).getTime()) / 1000 / 60;
      };
      const aMin = getMinutes(a);
      const bMin = getMinutes(b);
      if (aMin >= 5 && bMin < 5) return -1;
      if (bMin >= 5 && aMin < 5) return 1;
      return bMin - aMin;
    });
  }, [agents]);

  // Chart data helpers
  const getLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateStr = date.toISOString().split('T')[0];
      const label = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
      days.push({ date: dateStr, label });
    }
    return days;
  };

  const last7Days = getLast7Days();

  const scansTrendData: ScansTrendPoint[] = last7Days.map(day => {
    const dayScans = historicalScans?.filter(s => s.scanned_at.startsWith(day.date)) || [];
    return {
      date: day.label,
      total: dayScans.length,
      malicious: dayScans.filter(s => s.is_malicious).length,
      clean: dayScans.filter(s => !s.is_malicious).length,
    };
  });

  const jobsTrendData: JobsTrendPoint[] = last7Days.map(day => {
    const dayJobs = historicalJobs?.filter(j => j.created_at.startsWith(day.date)) || [];
    return {
      date: day.label,
      total: dayJobs.length,
      completed: dayJobs.filter(j => j.status === 'completed').length,
      failed: dayJobs.filter(j => j.status === 'failed').length,
      pending: dayJobs.filter(j => j.status === 'queued' || j.status === 'delivered').length,
    };
  });

  const uptimeChartData: UptimeDataPoint[] = agentUptimeData?.map((agent) => {
    const lastHeartbeat = agent.last_heartbeat ? new Date(agent.last_heartbeat) : null;
    const diffMins = lastHeartbeat ? (Date.now() - lastHeartbeat.getTime()) / (1000 * 60) : 999;
    return {
      name: agent.agent_name.length > 15 ? agent.agent_name.substring(0, 12) + '...' : agent.agent_name,
      uptime: diffMins < 5 ? 100 : 0,
    };
  }) || [];

  const getTimeSince = (date: string | null) => {
    if (!date) return 'Nunca';
    const diffMs = Date.now() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Agora mesmo';
    if (diffMins < 60) return `${diffMins}min atrás`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d atrás`;
  };

  return {
    tenant,
    tenantLoading,
    lastUpdate,
    handleRefresh,
    // Metrics
    totalAgents,
    onlineAgents,
    offlineAgents,
    failedJobs,
    successRate,
    globalStatus,
    // Data
    sortedAgents,
    recentJobs,
    scansTrendData,
    jobsTrendData,
    uptimeChartData,
    // Helpers
    getTimeSince,
  };
}
