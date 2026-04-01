import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { isAgentOnline } from '@/lib/agent-status-constants';
import { type SecurityEvent, getEventInfo, extractFriendlyDetails } from './security-event-utils';

export function useRealTimeSecurityDashboard() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [isLive, setIsLive] = useState(true);

  const { data: playbookStats, refetch: refetchPlaybooks } = useQuery({
    queryKey: ['realtime-playbook-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { total: 0, autoExecuted: 0, pending: 0 };
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data } = await supabase.from('playbook_executions').select('id, status, auto_executed, dry_run')
        .eq('tenant_id', tenant.id).gte('triggered_at', today.toISOString());
      return {
        total: data?.length || 0,
        autoExecuted: data?.filter(e => e.auto_executed && !e.dry_run).length || 0,
        pending: data?.filter(e => e.status === 'pending').length || 0,
      };
    },
    enabled: !!tenant?.id, refetchInterval: false, staleTime: 600_000,
  });

  const { data: blockedStats, refetch: refetchBlocked } = useQuery({
    queryKey: ['realtime-blocked-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { today: 0 };
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { count } = await supabase.from('blocked_access_attempts').select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id).gte('created_at', today.toISOString());
      return { today: count || 0 };
    },
    enabled: !!tenant?.id, refetchInterval: false, staleTime: 600_000,
  });

  const { data: approvalStats, refetch: refetchApprovals } = useQuery({
    queryKey: ['realtime-approval-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { pending: 0, approved: 0, rejected: 0, expired: 0 };
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data } = await supabase.from('approval_requests').select('id, status')
        .eq('tenant_id', tenant.id).gte('created_at', today.toISOString());
      return {
        pending: data?.filter(a => a.status === 'pending').length || 0,
        approved: data?.filter(a => a.status === 'approved').length || 0,
        rejected: data?.filter(a => a.status === 'rejected').length || 0,
        expired: data?.filter(a => a.status === 'expired').length || 0,
      };
    },
    enabled: !!tenant?.id, refetchInterval: false, staleTime: 600_000,
  });

  const { data: agentStats, refetch: refetchAgents } = useQuery({
    queryKey: ['realtime-agent-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { total: 0, protected: 0, isolated: 0, offline: 0 };
      const { data: rpcData, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id, p_include_archived: false,
      });
      if (error) throw error;
      const rawArr = Array.isArray(rpcData) ? rpcData : [];
      const data = (rawArr as unknown as Array<{ id: string; last_heartbeat: unknown; is_isolated: boolean }>).map(a => ({
        id: String(a.id), last_heartbeat: a.last_heartbeat, is_isolated: !!a.is_isolated,
      }));
      const total = data.length;
      const isolated = data.filter(a => a.is_isolated).length;
      const protectedCount = data.filter(a => !a.is_isolated && isAgentOnline(String(a.last_heartbeat || ''))).length;
      const offline = data.filter(a => !a.is_isolated && !isAgentOnline(String(a.last_heartbeat || ''))).length;
      return { total, protected: protectedCount, isolated, offline };
    },
    enabled: !tenantLoading && !!tenant?.id, refetchInterval: false, staleTime: 600_000,
  });

  const { data: recentLogs } = useQuery({
    queryKey: ['realtime-security-logs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await supabase.from('security_logs').select('id, attack_type, severity, details, created_at')
        .eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
    enabled: !!tenant?.id, refetchInterval: false, staleTime: 600_000,
  });

  // Transform logs
  useEffect(() => {
    if (!recentLogs) return;
    const transformed = recentLogs.map(log => {
      const info = getEventInfo(String(log.attack_type || ''));
      const details = extractFriendlyDetails(log.details);
      return {
        id: log.id, type: log.attack_type || 'info',
        severity: String(log.severity || 'info') as SecurityEvent['severity'],
        title: info.title, explanation: info.explanation, icon: info.icon,
        computer: details.computer, ip: details.ip, extra: details.extra,
        timestamp: String(log.created_at),
      } satisfies SecurityEvent;
    });
    setEvents(transformed.slice(0, 20));
  }, [recentLogs]);

  // Realtime
  useEffect(() => {
    if (!tenant?.id || !isLive) return;
    const channel = supabase
      .channel('realtime-security-dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'security_logs', filter: `tenant_id=eq.${tenant.id}` }, (payload) => {
        const log = payload.new as Record<string, unknown>;
        const info = getEventInfo(String(log.attack_type || ''));
        const details = extractFriendlyDetails(log.details);
        setEvents(prev => [{
          id: String(log.id), type: String(log.attack_type || 'info'),
          severity: String(log.severity || 'info') as SecurityEvent['severity'],
          title: info.title, explanation: info.explanation, icon: info.icon,
          computer: details.computer, ip: details.ip, extra: details.extra,
          timestamp: String(log.created_at),
        } satisfies SecurityEvent, ...prev].slice(0, 20));
        refetchPlaybooks(); refetchBlocked();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_requests', filter: `tenant_id=eq.${tenant.id}` }, () => refetchApprovals())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playbook_executions', filter: `tenant_id=eq.${tenant.id}` }, () => refetchPlaybooks())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agents', filter: `tenant_id=eq.${tenant.id}` }, () => refetchAgents())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, isLive, refetchPlaybooks, refetchBlocked, refetchApprovals, refetchAgents]);

  const refreshAll = () => { refetchPlaybooks(); refetchBlocked(); refetchApprovals(); refetchAgents(); };

  const coveragePercent = agentStats?.total ? Math.round((agentStats.protected / agentStats.total) * 100) : 0;

  return {
    events, isLive, setIsLive, refreshAll,
    playbookStats, blockedStats, approvalStats, agentStats,
    coveragePercent,
  };
}
