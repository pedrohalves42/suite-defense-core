import { useEffect, useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { getAgentOnlineStatus } from '@/lib/agent-status-constants';
import { logger } from '@/lib/logger';
import { subDays } from 'date-fns';
import { toast } from 'sonner';
import type { Agent, Job, UptimeDataPoint, ScansTrendPoint, JobsTrendPoint, GlobalStatus } from './types';

export function useAgentMonitoring() {
  const { tenant, loading: tenantLoading } = useTenant();
  const queryClient = useQueryClient();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const getAgentCalculatedStatus = (agent: Agent): 'online' | 'warning' | 'offline' | 'never_connected' => {
    return getAgentOnlineStatus(agent as any);
  };

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['agents-monitoring'] });
    queryClient.invalidateQueries({ queryKey: ['jobs-monitoring'] });
    queryClient.invalidateQueries({ queryKey: ['historical-scans'] });
    queryClient.invalidateQueries({ queryKey: ['historical-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['agent-uptime'] });
    setLastUpdate(new Date());
    toast.success("Dados atualizados!");
  }, [queryClient]);

  // Fetch agents
  const { data: initialAgents } = useQuery({
    queryKey: ['agents-monitoring', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      if (error) throw error;
      return ((data || []) as any[])
        .map((agent: any) => ({
          id: agent.id,
          agent_name: agent.agent_name,
          status: agent.status,
          last_heartbeat: agent.last_heartbeat,
          enrolled_at: agent.enrolled_at,
          agent_state: agent.agent_state,
        }))
        .sort((a: Agent, b: Agent) => new Date(b.enrolled_at).getTime() - new Date(a.enrolled_at).getTime()) as Agent[];
    },
    enabled: !tenantLoading && !!tenant?.id,
  });

  // Fetch jobs
  const { data: initialJobs } = useQuery({
    queryKey: ['jobs-monitoring', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('jobs')
        .select('id, agent_id, agent_name, type, status, created_at, delivered_at, completed_at, approved, tenant_id')
        .eq('tenant_id', tenant.id)
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Job[];
    },
    enabled: !tenantLoading && !!tenant?.id,
  });

  // Historical scans
  const { data: historicalScans } = useQuery({
    queryKey: ['historical-scans', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      const { data, error } = await supabase
        .from('virus_scans')
        .select('scanned_at, is_malicious')
        .eq('tenant_id', tenant.id)
        .gte('scanned_at', sevenDaysAgo)
        .order('scanned_at');
      if (error) throw error;
      return data;
    },
    enabled: !tenantLoading && !!tenant?.id,
  });

  // Historical jobs
  const { data: historicalJobs } = useQuery({
    queryKey: ['historical-jobs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      const { data, error } = await supabase
        .from('jobs')
        .select('created_at, status, completed_at')
        .eq('tenant_id', tenant.id)
        .gte('created_at', sevenDaysAgo)
        .order('created_at');
      if (error) throw error;
      return data;
    },
    enabled: !tenantLoading && !!tenant?.id,
  });

  // Agent uptime
  const { data: agentUptimeData } = useQuery({
    queryKey: ['agent-uptime', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      if (error) throw error;
      return (data || []).map((agent: any) => ({
        agent_name: agent.agent_name,
        last_heartbeat: agent.last_heartbeat,
        enrolled_at: agent.enrolled_at,
      }));
    },
    enabled: !tenantLoading && !!tenant?.id,
  });

  // Sync state
  useEffect(() => {
    if (initialAgents) setAgents(initialAgents);
    if (initialJobs) setRecentJobs(initialJobs);
  }, [initialAgents, initialJobs]);

  // Realtime
  useEffect(() => {
    if (!tenant?.id) return;

    const agentsChannel = supabase
      .channel(`agents-realtime-${tenant.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'agents',
        filter: `tenant_id=eq.${tenant.id}`,
      }, (payload) => {
        logger.debug('Agent change', { payload });
        if (payload.eventType === 'INSERT') {
          setAgents(prev => [payload.new as Agent, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setAgents(prev => prev.map(a => a.id === payload.new.id ? payload.new as Agent : a));
        } else if (payload.eventType === 'DELETE') {
          setAgents(prev => prev.filter(a => a.id !== payload.old.id));
        }
        setLastUpdate(new Date());
      })
      .subscribe();

    const jobsChannel = supabase
      .channel(`jobs-realtime-${tenant.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'jobs',
        filter: `tenant_id=eq.${tenant.id}`,
      }, (payload) => {
        logger.debug('Job change', { payload });
        if (payload.eventType === 'INSERT') {
          setRecentJobs(prev => [payload.new as Job, ...prev].slice(0, 10));
        } else if (payload.eventType === 'UPDATE') {
          setRecentJobs(prev => prev.map(j => j.id === payload.new.id ? payload.new as Job : j));
        }
        setLastUpdate(new Date());
      })
      .subscribe();

    return () => {
      supabase.removeChannel(agentsChannel);
      supabase.removeChannel(jobsChannel);
    };
  }, [tenant?.id]);

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
    const dayScans = historicalScans?.filter((s: any) => s.scanned_at.startsWith(day.date)) || [];
    return {
      date: day.label,
      total: dayScans.length,
      malicious: dayScans.filter((s: any) => s.is_malicious).length,
      clean: dayScans.filter((s: any) => !s.is_malicious).length,
    };
  });

  const jobsTrendData: JobsTrendPoint[] = last7Days.map(day => {
    const dayJobs = historicalJobs?.filter((j: any) => j.created_at.startsWith(day.date)) || [];
    return {
      date: day.label,
      total: dayJobs.length,
      completed: dayJobs.filter((j: any) => j.status === 'completed').length,
      failed: dayJobs.filter((j: any) => j.status === 'failed').length,
      pending: dayJobs.filter((j: any) => j.status === 'queued' || j.status === 'delivered').length,
    };
  });

  const uptimeChartData: UptimeDataPoint[] = agentUptimeData?.map((agent: any) => {
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
