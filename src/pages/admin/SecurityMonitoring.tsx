import { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Shield, AlertTriangle, Ban, RefreshCw, Clock, Unlock,
  ShieldCheck, Activity, MonitorOff, Wrench, 
  ArrowUpRight, TrendingUp, Zap, Globe, Lock, Eye, Flame,
  ChevronRight, Server, ShieldAlert, ShieldOff, ArrowDown
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from 'sonner';
import { subHours, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { AGENT_STATUS_THRESHOLDS } from '@/lib/agent-status-constants';
import { UI_LABELS, getAttackTypeLabel } from '@/lib/ui-dictionary';
import { motion, AnimatePresence } from 'framer-motion';
import { useTenant } from '@/hooks/useTenant';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const alertTypeLabels: Record<string, string> = {
  firewall_disabled: 'Firewall desativado',
  antivirus_inactive: 'Antivírus inativo',
  suspicious_process: 'Processo suspeito',
  unauthorized_access: 'Acesso não autorizado',
  malware_detected: 'Malware detectado',
  brute_force: 'Tentativa de força bruta',
  port_scan: 'Port scan',
  policy_violation: 'Violação de política',
  disk_critical: 'Disco crítico',
  service_stopped: 'Serviço parado',
  state_change: 'Mudança de estado',
};

const eventTypeLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  security_event: { label: 'Evento de segurança', icon: <ShieldAlert className="h-3.5 w-3.5" />, color: 'text-red-400' },
  auto_repair: { label: 'Reparo automático', icon: <Wrench className="h-3.5 w-3.5" />, color: 'text-blue-400' },
  auto_recovery: { label: 'Restauração de serviço', icon: <RefreshCw className="h-3.5 w-3.5" />, color: 'text-emerald-400' },
  policy_drift: { label: 'Desvio de conformidade', icon: <ShieldOff className="h-3.5 w-3.5" />, color: 'text-amber-400' },
  state_change: { label: 'Mudança de estado', icon: <Activity className="h-3.5 w-3.5" />, color: 'text-sky-400' },
  blocked_access: { label: 'Acesso bloqueado', icon: <Ban className="h-3.5 w-3.5" />, color: 'text-red-400' },
};

const remediableAlerts = new Set(['firewall_disabled', 'antivirus_inactive', 'service_stopped', 'policy_violation']);

const severityConfig: Record<string, { label: string; dotColor: string; badgeBg: string; badgeText: string }> = {
  critical: { label: 'Crítico', dotColor: 'bg-red-500', badgeBg: 'bg-red-500/10', badgeText: 'text-red-400' },
  high: { label: 'Alto', dotColor: 'bg-orange-500', badgeBg: 'bg-orange-500/10', badgeText: 'text-orange-400' },
  error: { label: 'Erro', dotColor: 'bg-orange-500', badgeBg: 'bg-orange-500/10', badgeText: 'text-orange-400' },
  warning: { label: 'Médio', dotColor: 'bg-amber-500', badgeBg: 'bg-amber-500/10', badgeText: 'text-amber-400' },
  medium: { label: 'Médio', dotColor: 'bg-amber-500', badgeBg: 'bg-amber-500/10', badgeText: 'text-amber-400' },
  info: { label: 'Info', dotColor: 'bg-blue-500', badgeBg: 'bg-blue-500/10', badgeText: 'text-blue-400' },
};

export default function SecurityMonitoring() {
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const { tenant } = useTenant();
  const eventsRef = useRef<HTMLDivElement>(null);
  const getTimeRangeDate = useCallback(() => {
    const hours = timeRange === '1h' ? 1 : timeRange === '6h' ? 6 : timeRange === '24h' ? 24 : 168;
    return subHours(new Date(), hours);
  }, [timeRange]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['security-monitoring', timeRange, tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const since = getTimeRangeDate().toISOString();
      const sb = supabase as any;

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
        endpoint: string; details: Record<string, unknown>; created_at: string; blocked: boolean;
      }>;
      const blockedAttempts = (blockedAttemptsRes.data || []) as Array<{
        id: string; agent_name: string; domain: string; attempted_at: string; blocked_by: string;
      }>;
      const evidenceLogs = (evidenceRes.data || []) as Array<{
        id: string; event_type: string; severity: string; agent_name: string; created_at: string; event_data: Record<string, unknown>;
      }>;
      const activeAlerts = (alertsRes.data || []) as Array<{
        id: string; title: string; severity: string; status: string; alert_type: string; created_at: string;
      }>;

      // Build unified events
      const unifiedEvents: Array<{
        id: string; type: string; label: string; detail: string; severity: string;
        created_at: string; source: string; agentName?: string; alertType?: string; 
        remediable?: boolean; eventCategory: string;
      }> = [];

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
        const alertType = (eventData as any).alert_type as string || '';
        const alertMsg = (eventData as any).alert_message as string || '';
        const details = (eventData as any).details || {};
        const skipRemediation = details?.skip_remediation === true;

        // Build a descriptive label using the actual alert data
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

        // Build a meaningful detail string from event_data
        let detail = '';
        if (alertMsg && alertType) {
          // Use alert_message as detail when label came from alertType mapping
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
          if ((eventData as any).state_before && (eventData as any).state_after) {
            parts.push(`${(eventData as any).state_before} → ${(eventData as any).state_after}`);
          }
          detail = parts.join(' · ') || '';
        }

        unifiedEvents.push({
          id: e.id, type: alertType || e.event_type, label, 
          detail,
          severity: (eventData as any).severity || e.severity, 
          created_at: e.created_at, source: 'evidence_logs',
          agentName: e.agent_name, alertType,
          remediable: !skipRemediation && remediableAlerts.has(alertType),
          eventCategory: e.event_type === 'security_event' ? 'security' : 
                         e.event_type === 'policy_drift' ? 'compliance' :
                         e.event_type === 'auto_recovery' || e.event_type === 'auto_repair' ? 'recovery' : 'system',
        });
      });

      // Deduplicate: group by (agent, type, severity) within same minute
      const dedupeKey = (e: typeof unifiedEvents[0]) => {
        const minute = e.created_at.substring(0, 16); // yyyy-mm-ddTHH:MM
        return `${e.agentName || ''}_${e.type}_${e.severity}_${minute}`;
      };
      const seen = new Map<string, typeof unifiedEvents[0] & { count: number }>();
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

      // Better chart: group by intervals based on time range
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

      // Fill gaps and create labels
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

      // Category counts for filter
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
    refetchInterval: 120000,
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
    try {
      const { error } = await supabase.functions.invoke('security-alert-dispatcher');
      if (error) throw error;
      toast.success('Verificação de segurança iniciada');
      refetch();
    } catch { toast.error('Erro ao iniciar verificação'); }
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
      const { error } = await (supabase as any).from('jobs').insert({
        tenant_id: tenant.id,
        agent_name: event.agentName,
        type: jobType,
        status: 'pending',
        payload: { alert_type: event.alertType, source: 'security_monitoring' },
      });
      if (error) throw error;
      toast.success(`Remediação enviada para ${event.agentName}`);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    }
  };

  const filteredEvents = useMemo(() => {
    if (!data?.unifiedEvents) return [];
    if (eventFilter === 'all') return data.unifiedEvents;
    return data.unifiedEvents.filter(e => e.eventCategory === eventFilter);
  }, [data?.unifiedEvents, eventFilter]);

  const m = data?.metrics;
  const hasActivity = m && (m.totalEvents > 0 || m.blockedIps > 0);
  const hasCritical = m && m.criticalEvents > 0;

  if (isLoading) {
    return (
      <AdminPageLayout title="Proteção em Tempo Real" description="Monitoramento de segurança do ambiente">
        <div className="space-y-4">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title={UI_LABELS.pages.security_monitoring.title}
      description={UI_LABELS.pages.security_monitoring.description}
    >
      <div className="space-y-5">
        {/* === HEADER CONTROLS === */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)}>
            <TabsList className="h-9">
              <TabsTrigger value="1h" className="text-xs px-3">1h</TabsTrigger>
              <TabsTrigger value="6h" className="text-xs px-3">6h</TabsTrigger>
              <TabsTrigger value="24h" className="text-xs px-3">24h</TabsTrigger>
              <TabsTrigger value="7d" className="text-xs px-3">7 dias</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={handleRunScan} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Verificar Agora
          </Button>
        </div>

        {/* === STATUS BANNER === */}
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={cn(
            "border overflow-hidden relative",
            hasCritical ? "border-destructive/30 bg-destructive/5" :
            hasActivity ? "border-amber-500/20 bg-amber-500/5" :
            "border-emerald-500/20 bg-emerald-500/5"
          )}>
            {/* Glow effect */}
            <div className={cn(
              "absolute inset-0 opacity-5",
              hasCritical ? "bg-gradient-to-r from-destructive to-transparent" :
              hasActivity ? "bg-gradient-to-r from-amber-500 to-transparent" :
              "bg-gradient-to-r from-emerald-500 to-transparent"
            )} />
            <CardContent className="py-4 flex items-center gap-3 relative">
              {hasCritical ? (
                <>
                  <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-destructive">
                      {m.criticalEvents} evento{m.criticalEvents > 1 ? 's' : ''} crítico{m.criticalEvents > 1 ? 's' : ''} detectado{m.criticalEvents > 1 ? 's' : ''}
                    </p>
                   <p className="text-xs text-muted-foreground">Revise os eventos abaixo e tome ações corretivas</p>
                   </div>
                   <Button
                     variant="destructive"
                     size="sm"
                     className="shrink-0 gap-1.5"
                     onClick={() => {
                       setEventFilter('security');
                       eventsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                     }}
                   >
                     <ArrowDown className="h-3.5 w-3.5" /> Ver eventos críticos
                   </Button>
                 </>
               ) : hasActivity ? (
                 <>
                   <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                     <Shield className="h-5 w-5 text-amber-500" />
                   </div>
                   <div className="flex-1">
                     <p className="text-sm font-semibold text-amber-500">Atividade detectada</p>
                     <p className="text-xs text-muted-foreground">
                       {m.totalEvents} evento{m.totalEvents > 1 ? 's' : ''} no período
                       {m.blockedAttempts > 0 && ` · ${m.blockedAttempts} acesso${m.blockedAttempts > 1 ? 's' : ''} bloqueado${m.blockedAttempts > 1 ? 's' : ''}`}
                     </p>
                   </div>
                 </>
               ) : (
                 <>
                   <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                     <ShieldCheck className="h-5 w-5 text-emerald-500" />
                   </div>
                   <div className="flex-1">
                     <p className="text-sm font-semibold text-emerald-500">Tudo tranquilo</p>
                     <p className="text-xs text-muted-foreground">Nenhuma ameaça detectada no período selecionado</p>
                   </div>
                   <Badge variant="outline" className="shrink-0 text-emerald-500 border-emerald-500/30 gap-1">
                     <ShieldCheck className="h-3 w-3" /> Protegido
                   </Badge>
                 </>
               )}
            </CardContent>
          </Card>
        </motion.div>

        {/* === METRIC CARDS === */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Alertas Críticos"
            value={m?.criticalEvents || 0}
            icon={<AlertTriangle className="h-4 w-4" />}
            variant={m?.criticalEvents ? 'danger' : 'neutral'}
            subtitle={m?.activeAlerts ? `+${m.activeAlerts} pendente${m.activeAlerts > 1 ? 's' : ''}` : undefined}
          />
          <MetricCard
            label="Acessos Bloqueados"
            value={m?.blockedAttempts || 0}
            icon={<Ban className="h-4 w-4" />}
            variant={m?.blockedAttempts ? 'warning' : 'neutral'}
            subtitle="Sites e domínios"
          />
          <MetricCard
            label="IPs Bloqueados"
            value={m?.blockedIps || 0}
            icon={<Globe className="h-4 w-4" />}
            variant={m?.blockedIps ? 'warning' : 'neutral'}
            subtitle={m?.failedLogins ? `${m.failedLogins} tentativa${m.failedLogins > 1 ? 's' : ''} login` : undefined}
          />
          <MetricCard
            label="Computadores Offline"
            value={m?.agentsOffline || 0}
            icon={<MonitorOff className="h-4 w-4" />}
            variant={m?.agentsOffline ? 'danger' : 'neutral'}
            subtitle="Sem comunicação"
          />
        </div>

        {/* === ACTIVITY CHART === */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Atividade no Período
              </CardTitle>
              <span className="text-[10px] text-muted-foreground">
                {m?.totalEvents || 0} evento{(m?.totalEvents || 0) !== 1 ? 's' : ''} detectado{(m?.totalEvents || 0) !== 1 ? 's' : ''}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {data?.chartData && data.chartData.some(d => d.eventos > 0) ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={data.chartData}>
                  <defs>
                    <linearGradient id="gradEventos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gradCriticos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis 
                    dataKey="label" 
                    className="text-[10px]" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} 
                    interval="preserveStartEnd"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    className="text-[10px]" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} 
                    width={30}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }} 
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Area type="monotone" dataKey="eventos" stroke="hsl(var(--primary))" fill="url(#gradEventos)" name="Eventos" strokeWidth={2} />
                  <Area type="monotone" dataKey="criticos" stroke="hsl(var(--destructive))" fill="url(#gradCriticos)" name="Críticos" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[180px] text-muted-foreground">
                <ShieldCheck className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs">Sem atividade no período</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* === EVENTS + SIDEBAR === */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Events List - 2 cols */}
          <Card className="lg:col-span-2" ref={eventsRef}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Eventos Recentes
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Detecções de segurança em tempo real
                  </CardDescription>
                </div>
              </div>
              {/* Category filter pills */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                <FilterPill 
                  active={eventFilter === 'all'} 
                  onClick={() => setEventFilter('all')}
                  count={data?.unifiedEvents?.length || 0}
                >
                  Todos
                </FilterPill>
                {data?.categoryCounts && Object.entries(data.categoryCounts).map(([cat, count]) => (
                  <FilterPill 
                    key={cat}
                    active={eventFilter === cat}
                    onClick={() => setEventFilter(cat)}
                    count={count as number}
                  >
                    {{
                      security: 'Segurança',
                      compliance: 'Conformidade',
                      recovery: 'Recuperação',
                      system: 'Sistema',
                      blocked: 'Bloqueados',
                    }[cat] || cat}
                  </FilterPill>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {filteredEvents.length > 0 ? (
                <ScrollArea className="h-[420px] pr-2">
                  <div className="space-y-1.5">
                    <AnimatePresence mode="popLayout">
                      {filteredEvents.slice(0, 30).map((event) => {
                        const sev = severityConfig[event.severity] || severityConfig.info;
                        const evtMeta = eventTypeLabels[event.type] || eventTypeLabels[event.source === 'blocked_attempts' ? 'blocked_access' : 'security_event'];
                        
                        return (
                          <motion.div 
                            key={event.id} 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-card/50 hover:bg-accent/5 transition-colors group"
                          >
                            {/* Severity dot + icon */}
                            <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                              <span className={cn("w-2 h-2 rounded-full", sev.dotColor)} />
                              <span className={cn("opacity-60", evtMeta?.color)}>{evtMeta?.icon}</span>
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate">
                                  {event.label}
                                  {event.agentName && (
                                    <span className="text-muted-foreground font-normal"> em {event.agentName}</span>
                                  )}
                                </p>
                                {(event as any).count > 1 && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                                    ×{(event as any).count}
                                  </Badge>
                                )}
                              </div>
                              {event.detail && (
                                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{event.detail}</p>
                              )}
                              {!event.detail && event.alertType && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  Tipo: {alertTypeLabels[event.alertType] || event.alertType}
                                </p>
                              )}
                            </div>

                            {/* Right side */}
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: ptBR })}
                              </span>
                              <Badge className={cn("text-[9px] px-1.5 py-0 h-4 border-0", sev.badgeBg, sev.badgeText)}>
                                {sev.label}
                              </Badge>
                              {event.remediable && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => handleRemediate(event)}
                                    >
                                      <Wrench className="h-3.5 w-3.5 text-primary" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="text-xs">Corrigir automaticamente</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-center">
                  <ShieldCheck className="h-10 w-10 text-emerald-500/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">Nenhum evento no período</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Seu ambiente está seguro</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sidebar - 1 col */}
          <div className="space-y-4">
            {/* Active Alerts */}
            {data?.activeAlerts && data.activeAlerts.length > 0 && (
              <Card className="border-destructive/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Alertas Ativos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.activeAlerts.slice(0, 5).map(alert => {
                      const sev = severityConfig[alert.severity] || severityConfig.warning;
                      return (
                        <div key={alert.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
                          <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", sev.dotColor)} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{alert.title}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true, locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Blocked IPs */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  IPs Bloqueados
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data?.blockedIPs && data.blockedIPs.length > 0 ? (
                  <div className="space-y-2">
                    {data.blockedIPs.slice(0, 8).map((ip) => (
                      <div key={ip.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 group">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-mono truncate">{ip.ip_address}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{ip.reason}</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0" 
                          onClick={() => handleUnblockIP(ip.id, ip.ip_address)}
                        >
                          <Unlock className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <Shield className="h-6 w-6 text-muted-foreground/20 mb-2" />
                    <p className="text-xs text-muted-foreground">Nenhum IP bloqueado</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Failed Login Stats */}
            {data?.failedLoginStats && data.failedLoginStats.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    Tentativas de Login
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.failedLoginStats.slice(0, 5).map((stat) => (
                      <div key={stat.ip_address} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                        <span className="text-xs font-mono truncate">{stat.ip_address}</span>
                        <Badge variant={stat.count >= 10 ? 'destructive' : 'outline'} className="text-[10px] shrink-0">
                          {stat.count}×
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AdminPageLayout>
  );
}

/* ─── Sub-components ──────────────────────────── */

function MetricCard({ label, value, icon, variant, subtitle }: {
  label: string; value: number; icon: React.ReactNode;
  variant: 'danger' | 'warning' | 'neutral';
  subtitle?: string;
}) {
  const styles = {
    danger: 'border-destructive/20 bg-destructive/5',
    warning: 'border-amber-500/20 bg-amber-500/5',
    neutral: 'bg-card border-border/40',
  }[variant];
  const valueColor = {
    danger: 'text-destructive',
    warning: 'text-amber-500',
    neutral: 'text-foreground',
  }[variant];
  const iconColor = {
    danger: 'text-destructive/70',
    warning: 'text-amber-500/70',
    neutral: 'text-muted-foreground',
  }[variant];

  return (
    <Card className={cn("border transition-all hover:shadow-md", styles)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-muted-foreground font-medium leading-tight">{label}</span>
          <span className={iconColor}>{icon}</span>
        </div>
        <p className={cn("text-3xl font-bold tracking-tight", valueColor)}>{value}</p>
        {subtitle && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function FilterPill({ children, active, onClick, count }: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-muted/50 text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
      <span className={cn(
        "text-[9px] px-1.5 py-0 rounded-full min-w-[18px] text-center",
        active ? "bg-primary-foreground/20" : "bg-background/80"
      )}>
        {count}
      </span>
    </button>
  );
}
