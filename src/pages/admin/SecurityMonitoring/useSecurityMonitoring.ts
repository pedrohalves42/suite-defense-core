import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { subHours } from 'date-fns';
import { toast } from 'sonner';
import { getAttackTypeLabel } from '@/lib/ui-dictionary';
import { AGENT_STATUS_THRESHOLDS } from '@/lib/agent-status-constants';
import type { SecurityData, TimeRange, UnifiedEvent } from './types';
import { alertTypeLabels, remediableAlerts, eventTypeLabels } from './types';

export function useSecurityMonitoring() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [isScanning, setIsScanning] = useState(false);
  const { tenant } = useTenant();

  const getTimeRangeDate = useCallback(() => {
    const hours = timeRange === '1h' ? 1 : timeRange === '6h' ? 6 : timeRange === '24h' ? 24 : 168;
    return subHours(new Date(), hours);
  }, [timeRange]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['security-monitoring', timeRange, tenant?.id],
    queryFn: async (): Promise<SecurityData | null> => {
      if (!tenant?.id) return null;
      const since = getTimeRangeDate().toISOString();
      const sb = supabase;

      const [rateLimitsRes, failedLoginsRes, blockedIpsRes, securityEventsRes, agentsRes, blockedAttemptsRes, evidenceRes, alertsRes] = await Promise.all([
        sb.from('rate_limits').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).gte('window_start', since).not('blocked_until', 'is', null),
        sb.from('failed_login_attempts').select('ip_address, created_at').eq('tenant_id', tenant.id).gte('created_at', since),
        sb.from('ip_blocklist').select('id, ip_address, reason, blocked_until, created_at').eq('tenant_id', tenant.id).gte('blocked_until', new Date().toISOString()).order('created_at', { ascending: false }).limit(20),
        sb.from('security_logs').select('id, attack_type, severity, ip_address, endpoint, details, created_at, blocked').eq('tenant_id', tenant.id).gte('created_at', since).order('created_at', { ascending: false }).limit(50),
        supabase.rpc('get_agents_list', { p_tenant_id: tenant.id, p_include_archived: false }),
        sb.from('blocked_access_attempts').select('id, agent_name, domain, attempted_at, blocked_by').eq('tenant_id', tenant.id).gte('attempted_at', since).order('attempted_at', { ascending: false }).limit(50),
        sb.from('agent_evidence_logs').select('id, event_type, severity, agent_name, created_at, event_data').eq('tenant_id', tenant.id).gte('created_at', since).order('created_at', { ascending: false }).limit(100),
        sb.from('system_alerts').select('id, title, severity, status, alert_type, created_at').eq('tenant_id', tenant.id).eq('resolved', false).order('created_at', { ascending: false }).limit(20),
      ]);

      const secLogEvents = (securityEventsRes.data || []) as Array<{
        id: string; attack_type: string; severity: string; ip_address: string;
        endpoint: string; details: any; created_at: string; blocked: boolean;
      }>;
      const blockedAttempts = (blockedAttemptsRes.data || []) as Array<{
        id: string; agent_name: string; domain: string; attempted_at: string; blocked_by: string;
      }>;
      const evidenceLogs = (evidenceRes.data || []) as Array<{
        id: string; event_type: string; severity: string; agent_name: string; created_at: string; event_data: any;
      }>;
      const activeAlerts = (alertsRes.data || []) as Array<{
        id: string; title: string; severity: string; status: string; alert_type: string; created_at: string;
      }>;

      // Build unified events
      const unifiedEvents: Array<Omit<UnifiedEvent, 'count'>> = [];

      secLogEvents.forEach(e => {
        unifiedEvents.push({
          id: e.id, type: e.attack_type, label: getAttackTypeLabel(e.attack_type),
          detail: e.ip_address || '', severity: e.severity, created_at: e.created_at,
          source: 'security_logs', eventCategory: 'security',
        });
      });

      blockedAttempts.forEach(e => {
        unifiedEvents.push({
          id: e.id, type: 'blocked_access', label: `Acesso bloqueado: ${e.domain}`,
          detail: e.agent_name, severity: 'warning',
          created_at: e.attempted_at, source: 'blocked_attempts', agentName: e.agent_name,
          eventCategory: 'blocked',
        });
      });

      evidenceLogs
        .filter(e => e.severity !== 'info' && e.severity !== 'debug')
        .forEach(e => {
        const eventData = e.event_data || {};
        const ed = eventData as Record<string, unknown>;
        const alertType = (ed.alert_type as string) || '';
        const alertMsg = (ed.alert_message as string) || '';
        const details = (ed.details || {}) as Record<string, unknown>;
        const skipRemediation = details?.skip_remediation === true;

        let label: string;
        if (alertType && alertTypeLabels[alertType]) {
          label = alertTypeLabels[alertType];
        } else if (alertMsg) {
          label = alertMsg;
        } else if (alertType) {
          label = alertType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        } else {
          label = eventTypeLabels[e.event_type]?.label || e.event_type.replace(/_/g, ' ');
        }

        let detail = '';
        if (alertMsg && alertType) {
          detail = alertMsg;
        }
        if (!detail) {
          const parts: string[] = [];
          if (details.service_name) parts.push(`Serviço: ${details.service_name}`);
          if (details.process_name) parts.push(`Processo: ${details.process_name}`);
          if (details.rule_name) parts.push(`Regra: ${details.rule_name}`);
          if (details.policy_name) parts.push(`Política: ${details.policy_name}`);
          if (details.file_path) parts.push(`Arquivo: ${details.file_path}`);
          if (details.detection_method) parts.push(`Método: ${details.detection_method}`);
          if (details.checked_edrs) parts.push(`EDRs verificados: ${details.checked_edrs}`);
          if (details.expected !== undefined && details.actual !== undefined) {
            parts.push(`Esperado: ${details.expected} → Atual: ${details.actual}`);
          }
           if (ed.state_before && ed.state_after) {
            parts.push(`${ed.state_before} → ${ed.state_after}`);
          }
          detail = parts.join(' · ') || '';
        }

        unifiedEvents.push({
          id: e.id, type: alertType || e.event_type, label, detail,
          severity: (ed.severity as string) || e.severity,
          created_at: e.created_at, source: 'evidence_logs',
          agentName: e.agent_name, alertType,
          remediable: !skipRemediation && remediableAlerts.has(alertType),
          eventCategory: e.event_type === 'security_event' ? 'security' :
                         e.event_type === 'policy_drift' ? 'compliance' :
                         e.event_type === 'auto_recovery' || e.event_type === 'auto_repair' ? 'recovery' : 'system',
        });
      });

      // Deduplicate
      const dedupeKey = (e: typeof unifiedEvents[0]) => {
        const minute = e.created_at.substring(0, 16);
        return `${e.agentName || ''}_${e.type}_${e.severity}_${minute}`;
      };
      const seen = new Map<string, UnifiedEvent>();
      unifiedEvents.forEach(e => {
        const key = dedupeKey(e);
        if (seen.has(key)) {
          seen.get(key)!.count++;
        } else {
          seen.set(key, { ...e, count: 1 });
        }
      });
      const dedupedEvents = Array.from(seen.values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Metrics
      const criticalCount = dedupedEvents.filter(e => e.severity === 'high' || e.severity === 'critical').length;
      const offlineThreshold = subHours(new Date(), AGENT_STATUS_THRESHOLDS.OFFLINE_ALERT_HOURS).toISOString();
      const allAgents = (agentsRes.data as unknown as Array<{ last_heartbeat: string | null; status: string }>) || [];
      const offlineAgents = allAgents.filter(a => a.status === 'active' && a.last_heartbeat && a.last_heartbeat < offlineThreshold).length;

      const failedLogins = (failedLoginsRes.data || []) as Array<{ ip_address: string; created_at: string }>;
      const ipCounts: Record<string, { count: number; last_attempt: string }> = {};
      failedLogins.forEach((a) => {
        if (!ipCounts[a.ip_address]) ipCounts[a.ip_address] = { count: 0, last_attempt: a.created_at };
        ipCounts[a.ip_address].count++;
        if (a.created_at > ipCounts[a.ip_address].last_attempt) ipCounts[a.ip_address].last_attempt = a.created_at;
      });
      const failedLoginStats = Object.entries(ipCounts)
        .map(([ip, stats]) => ({ ip_address: ip, ...stats }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Chart data
      const intervalMinutes = timeRange === '1h' ? 5 : timeRange === '6h' ? 30 : timeRange === '24h' ? 60 : 360;
      const chartMap = new Map<number, { slot: number; eventos: number; bloqueados: number; criticos: number }>();
      const rangeStart = getTimeRangeDate().getTime();

      dedupedEvents.forEach(event => {
        const ts = new Date(event.created_at).getTime();
        const slot = Math.floor((ts - rangeStart) / (intervalMinutes * 60 * 1000));
        if (!chartMap.has(slot)) chartMap.set(slot, { slot, eventos: 0, bloqueados: 0, criticos: 0 });
        const entry = chartMap.get(slot)!;
        entry.eventos += event.count;
        if (event.source === 'blocked_attempts') entry.bloqueados += event.count;
        if (event.severity === 'critical' || event.severity === 'high') entry.criticos += event.count;
      });

      const totalSlots = Math.ceil((Date.now() - rangeStart) / (intervalMinutes * 60 * 1000));
      const chartData: Array<{ label: string; eventos: number; bloqueados: number; criticos: number }> = [];
      for (let i = 0; i <= totalSlots; i++) {
        const slotTime = new Date(rangeStart + i * intervalMinutes * 60 * 1000);
        const label = `${String(slotTime.getHours()).padStart(2, '0')}:${String(slotTime.getMinutes()).padStart(2, '0')}`;
        const entry = chartMap.get(i);
        chartData.push({
          label,
          eventos: entry?.eventos || 0,
          bloqueados: entry?.bloqueados || 0,
          criticos: entry?.criticos || 0,
        });
      }

      // Category counts
      const categoryCounts: Record<string, number> = {};
      dedupedEvents.forEach(e => {
        categoryCounts[e.eventCategory] = (categoryCounts[e.eventCategory] || 0) + 1;
      });

      return {
        metrics: {
          rateLimitBreaches: rateLimitsRes.count || 0,
          failedLogins: failedLogins.length,
          blockedIps: (blockedIpsRes.data || []).length,
          criticalEvents: criticalCount,
          agentsOffline: offlineAgents,
          blockedAttempts: blockedAttempts.length,
          activeAlerts: activeAlerts.length,
          totalEvents: dedupedEvents.length,
        },
        unifiedEvents: dedupedEvents,
        blockedIPs: (blockedIpsRes.data || []) as Array<{ id: string; ip_address: string; reason: string; blocked_until: string }>,
        failedLoginStats,
        activeAlerts,
        chartData: chartData.slice(-24),
        categoryCounts,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });

  const handleUnblockIP = async (id: string, ip: string) => {
    try {
      const { error } = await supabase.from('ip_blocklist').delete().eq('id', id).eq('tenant_id', tenant!.id);
      if (error) throw error;
      toast.success(`IP ${ip} desbloqueado`);
      refetch();
    } catch { toast.error('Erro ao desbloquear IP'); }
  };

  const handleRunScan = async () => {
    setIsScanning(true);
    try {
      await refetch();
      toast.success('Verificação concluída', { description: 'Dados de segurança atualizados com sucesso' });
    } catch {
      toast.error('Erro ao verificar segurança');
    } finally {
      setIsScanning(false);
    }
  };

  const handleRemediate = async (event: { agentName?: string; alertType?: string; label: string }) => {
    if (!event.agentName || !tenant?.id) return;
    try {
      const jobTypeMap: Record<string, string> = {
        firewall_disabled: 'enable_firewall',
        antivirus_inactive: 'check_antivirus',
        service_stopped: 'restart_service',
        policy_violation: 'enforce_policy',
      };
      const jobType = jobTypeMap[event.alertType || ''] || 'security_remediation';
      const jobData = await prepareJobForInsert({
        tenant_id: tenant.id,
        agent_name: event.agentName,
        type: jobType,
        status: 'pending' as const,
        payload: { alert_type: event.alertType, source: 'security_monitoring' },
      });
      const { error } = await supabase.from('jobs').insert(jobData);
      if (error) throw error;
      toast.success(`Remediação enviada para ${event.agentName}`);
    } catch (err: unknown) {
      toast.error(`Erro: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    }
  };

  const filteredEvents = useMemo(() => {
    if (!data?.unifiedEvents) return [];
    if (eventFilter === 'all') return data.unifiedEvents;
    return data.unifiedEvents.filter(e => e.eventCategory === eventFilter);
  }, [data?.unifiedEvents, eventFilter]);

  return {
    data,
    isLoading,
    timeRange,
    setTimeRange,
    eventFilter,
    setEventFilter,
    isScanning,
    filteredEvents,
    handleUnblockIP,
    handleRunScan,
    handleRemediate,
  };
}

