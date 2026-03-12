import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, AlertTriangle, Ban, RefreshCw, Clock, Lock, Unlock,
  CheckCircle, ShieldCheck, Activity, MonitorOff, XCircle
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from 'sonner';
import { subHours } from 'date-fns';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { AGENT_STATUS_THRESHOLDS } from '@/lib/agent-status-constants';
import { UI_LABELS, getAttackTypeLabel, getSeverityInfo } from '@/lib/ui-dictionary';
import { motion } from 'framer-motion';
import { useTenant } from '@/hooks/useTenant';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export default function SecurityMonitoring() {
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const { tenant } = useTenant();
  
  const getTimeRangeDate = useCallback(() => {
    const hours = timeRange === '1h' ? 1 : timeRange === '6h' ? 6 : timeRange === '24h' ? 24 : 168;
    return subHours(new Date(), hours);
  }, [timeRange]);

  // === ALL DATA IN ONE QUERY ===
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['security-monitoring', timeRange, tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const since = getTimeRangeDate().toISOString();
      const sb = supabase as any;

      const [rateLimitsRes, failedLoginsRes, blockedIpsRes, securityEventsRes, agentsRes, blockedAttemptsRes, evidenceRes, alertsRes] = await Promise.all([
        sb.from('rate_limits').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).gte('window_start', since).not('blocked_until', 'is', null),
        sb.from('failed_login_attempts').select('ip_address, created_at').eq('tenant_id', tenant.id).gte('created_at', since),
        sb.from('ip_blocklist').select('*').eq('tenant_id', tenant.id).gte('blocked_until', new Date().toISOString()).order('created_at', { ascending: false }).limit(20),
        sb.from('security_logs').select('*').eq('tenant_id', tenant.id).gte('created_at', since).order('created_at', { ascending: false }).limit(50),
        supabase.rpc('get_agents_list', { p_tenant_id: tenant.id, p_include_archived: false }),
        // Additional sources that SimpleDashboard uses
        sb.from('blocked_access_attempts').select('id, agent_name, domain, attempted_at, blocked_by').eq('tenant_id', tenant.id).gte('attempted_at', since).order('attempted_at', { ascending: false }).limit(50),
        sb.from('agent_evidence_logs').select('id, event_type, severity, agent_name, created_at, event_data').eq('tenant_id', tenant.id).gte('created_at', since).order('created_at', { ascending: false }).limit(50),
        sb.from('system_alerts').select('id, title, severity, status, alert_type, created_at').eq('tenant_id', tenant.id).eq('resolved', false).order('created_at', { ascending: false }).limit(20),
      ]);

      // Process security events from security_logs
      const secLogEvents = (securityEventsRes.data || []) as Array<{
        id: string; attack_type: string; severity: string; ip_address: string;
        endpoint: string; details: Record<string, unknown>; created_at: string; blocked: boolean;
      }>;

      // Process blocked access attempts  
      const blockedAttempts = (blockedAttemptsRes.data || []) as Array<{
        id: string; agent_name: string; domain: string; attempted_at: string; blocked_by: string;
      }>;

      // Process evidence logs (security events from agents)
      const evidenceLogs = (evidenceRes.data || []) as Array<{
        id: string; event_type: string; severity: string; agent_name: string; created_at: string; event_data: Record<string, unknown>;
      }>;

      // Process system alerts
      const activeAlerts = (alertsRes.data || []) as Array<{
        id: string; title: string; severity: string; status: string; alert_type: string; created_at: string;
      }>;

      // Merge all events into a unified timeline
      const unifiedEvents: Array<{
        id: string; type: string; label: string; detail: string; severity: string;
        created_at: string; source: string;
      }> = [];

      // From security_logs
      secLogEvents.forEach(e => {
        unifiedEvents.push({
          id: e.id, type: e.attack_type, label: getAttackTypeLabel(e.attack_type),
          detail: e.ip_address || '', severity: e.severity, created_at: e.created_at,
          source: 'security_logs',
        });
      });

      // From blocked_access_attempts
      blockedAttempts.forEach(e => {
        unifiedEvents.push({
          id: e.id, type: 'blocked_access', label: 'Tentativa de acesso negada',
          detail: `${e.domain} — ${e.agent_name}`, severity: 'warning',
          created_at: e.attempted_at, source: 'blocked_attempts',
        });
      });

      // From agent_evidence_logs (only actionable ones)
      evidenceLogs.filter(e => e.severity !== 'info' && e.severity !== 'debug').forEach(e => {
        const labelMap: Record<string, string> = {
          security_event: 'Evento de segurança',
          auto_repair: 'Reparo automático',
          auto_recovery: 'Restauração de serviço',
          policy_drift: 'Desvio de conformidade',
        };
        unifiedEvents.push({
          id: e.id, type: e.event_type, label: labelMap[e.event_type] || e.event_type,
          detail: e.agent_name, severity: e.severity, created_at: e.created_at,
          source: 'evidence_logs',
        });
      });

      // Sort by date desc
      unifiedEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Compute combined metrics
      const criticalCount = unifiedEvents.filter(e => e.severity === 'high' || e.severity === 'critical').length;

      // Process agents offline
      const offlineThreshold = subHours(new Date(), AGENT_STATUS_THRESHOLDS.OFFLINE_ALERT_HOURS).toISOString();
      const allAgents = (agentsRes.data as unknown as Array<{ last_heartbeat: string | null; status: string }>) || [];
      const offlineAgents = allAgents.filter(a => a.status === 'active' && a.last_heartbeat && a.last_heartbeat < offlineThreshold).length;

      // Process failed logins by IP
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

      // Chart data from unified events
      const chartMap: Record<string, { hour: string; eventos: number; bloqueados: number }> = {};
      unifiedEvents.forEach(event => {
        const h = `${String(new Date(event.created_at).getHours()).padStart(2, '0')}:00`;
        if (!chartMap[h]) chartMap[h] = { hour: h, eventos: 0, bloqueados: 0 };
        chartMap[h].eventos++;
        if (event.source === 'blocked_attempts') chartMap[h].bloqueados++;
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
        },
        unifiedEvents,
        blockedIPs: (blockedIpsRes.data || []) as Array<{ id: string; ip_address: string; reason: string; blocked_until: string }>,
        failedLoginStats,
        activeAlerts,
        chartData: Object.values(chartMap).sort((a, b) => a.hour.localeCompare(b.hour)).slice(-12),
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 120000,
  });

  const handleUnblockIP = async (id: string, ip: string) => {
    try {
      // V-1087 FIX: Add tenant_id filter
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
      toast.success('Scan de segurança iniciado');
      refetch();
    } catch { toast.error('Erro ao iniciar scan'); }
  };

  const m = data?.metrics;
  const hasActivity = m && (m.rateLimitBreaches > 0 || m.failedLogins > 0 || m.criticalEvents > 0 || m.blockedIps > 0 || m.blockedAttempts > 0 || m.activeAlerts > 0);
  const hasCritical = m && m.criticalEvents > 0;

  if (isLoading) {
    return (
      <AdminPageLayout title="Proteção em Tempo Real" description="Monitoramento de segurança do ambiente">
        <div className="space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-24 w-full" />
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
        {/* Controls */}
        <div className="flex justify-between items-center">
          <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)}>
            <TabsList>
              <TabsTrigger value="1h">1h</TabsTrigger>
              <TabsTrigger value="6h">6h</TabsTrigger>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="7d">7 dias</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={handleRunScan} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Verificar Agora
          </Button>
        </div>

        {/* === STATUS BANNER === */}
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={cn(
            "border",
            hasCritical ? "border-red-500/20 bg-red-500/5" :
            hasActivity ? "border-amber-500/20 bg-amber-500/5" :
            "border-green-500/20 bg-green-500/5"
          )}>
            <CardContent className="py-4 flex items-center gap-3">
              {hasCritical ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-500">
                      {m.criticalEvents} evento{m.criticalEvents > 1 ? 's' : ''} crítico{m.criticalEvents > 1 ? 's' : ''} detectado{m.criticalEvents > 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">Revise os eventos abaixo para detalhes</p>
                  </div>
                </>
              ) : hasActivity ? (
                <>
                  <Shield className="h-5 w-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-500">Atividade detectada no período</p>
                    <p className="text-xs text-muted-foreground">
                      {m.failedLogins > 0 && `${m.failedLogins} tentativa${m.failedLogins > 1 ? 's' : ''} de login. `}
                      {m.blockedIps > 0 && `${m.blockedIps} IP${m.blockedIps > 1 ? 's' : ''} bloqueado${m.blockedIps > 1 ? 's' : ''}. `}
                      {m.rateLimitBreaches > 0 && `${m.rateLimitBreaches} limite${m.rateLimitBreaches > 1 ? 's' : ''} excedido${m.rateLimitBreaches > 1 ? 's' : ''}.`}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-5 w-5 text-green-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-500">Nenhuma ameaça detectada</p>
                    <p className="text-xs text-muted-foreground">Seu ambiente está seguro no período selecionado</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* === KEY METRICS (only show if there's data) === */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard
            label="Alertas Importantes"
            value={(m?.criticalEvents || 0) + (m?.activeAlerts || 0)}
            icon={<AlertTriangle className="h-4 w-4" />}
            color={(m?.criticalEvents || m?.activeAlerts) ? 'red' : 'muted'}
          />
          <MetricCard
            label="Acessos Bloqueados"
            value={m?.blockedAttempts || 0}
            icon={<Ban className="h-4 w-4" />}
            color={m?.blockedAttempts ? 'amber' : 'muted'}
          />
          <MetricCard
            label="Tentativas de Login"
            value={m?.failedLogins || 0}
            icon={<Lock className="h-4 w-4" />}
            color={m?.failedLogins ? 'amber' : 'muted'}
          />
          <MetricCard
            label="IPs Bloqueados"
            value={m?.blockedIps || 0}
            icon={<Ban className="h-4 w-4" />}
            color={m?.blockedIps ? 'amber' : 'muted'}
          />
          <MetricCard
            label="Computadores Offline"
            value={m?.agentsOffline || 0}
            icon={<MonitorOff className="h-4 w-4" />}
            color={m?.agentsOffline ? 'red' : 'muted'}
          />
        </div>

        {/* === CHART (only if events exist) === */}
        {data?.chartData && data.chartData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Atividade nas últimas horas</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data.chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="hour" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Legend />
                  <Area type="monotone" dataKey="eventos" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" name="Eventos detectados" />
                  <Area type="monotone" dataKey="bloqueados" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive) / 0.2)" name="Bloqueados" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* === EVENTS + BLOCKED IPS === */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Events */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Eventos Recentes</CardTitle>
              <CardDescription className="text-xs">Últimas detecções de segurança</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.unifiedEvents && data.unifiedEvents.length > 0 ? (
                <div className="max-h-[350px] overflow-y-auto space-y-2">
                  {data.unifiedEvents.slice(0, 15).map((event) => {
                    const severityColor = {
                      critical: 'bg-red-500',
                      high: 'bg-amber-500',
                      error: 'bg-amber-500',
                      warning: 'bg-yellow-500',
                      medium: 'bg-yellow-500',
                    }[event.severity] || 'bg-muted-foreground/30';
                    const sourceIcon = {
                      blocked_attempts: <Ban className="h-3 w-3 text-red-400" />,
                      evidence_logs: <Activity className="h-3 w-3 text-blue-400" />,
                      security_logs: <Shield className="h-3 w-3 text-amber-400" />,
                    }[event.source] || <Shield className="h-3 w-3" />;
                    return (
                      <div key={event.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/20">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={cn("w-2 h-2 rounded-full shrink-0", severityColor)} />
                          {sourceIcon}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{event.label}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{event.detail}</p>
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0 ml-2">
                          {formatBrazilDateTime(event.created_at, 'short')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyCard icon={<ShieldCheck className="h-8 w-8 text-green-500/50" />} text="Nenhum evento no período" />
              )}
            </CardContent>
          </Card>

          {/* Blocked IPs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">IPs Bloqueados</CardTitle>
              <CardDescription className="text-xs">Origens bloqueadas automaticamente</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.blockedIPs && data.blockedIPs.length > 0 ? (
                <div className="max-h-[350px] overflow-y-auto space-y-2">
                  {data.blockedIPs.map((ip) => (
                    <div key={ip.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/20">
                      <div className="min-w-0">
                        <p className="text-sm font-mono">{ip.ip_address}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{ip.reason}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <Badge variant="outline" className="text-[10px]">
                          <Clock className="h-3 w-3 mr-1" />
                          {formatBrazilDateTime(ip.blocked_until, 'time')}
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleUnblockIP(ip.id, ip.ip_address)}>
                          <Unlock className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyCard icon={<Shield className="h-8 w-8 text-muted-foreground/30" />} text="Nenhum IP bloqueado no momento" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* === FAILED LOGINS (only if data exists) === */}
        {data?.failedLoginStats && data.failedLoginStats.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">IPs com Mais Tentativas de Login</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.failedLoginStats.map((stat) => (
                  <div key={stat.ip_address} className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/20">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono">{stat.ip_address}</span>
                      <Badge variant={stat.count >= 10 ? 'destructive' : stat.count >= 5 ? 'secondary' : 'outline'} className="text-[10px]">
                        {stat.count} tentativa{stat.count > 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {formatBrazilDateTime(stat.last_attempt, 'short')}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminPageLayout>
  );
}

/* ─── Helpers ──────────────────────────── */

function MetricCard({ label, value, icon, color }: {
  label: string; value: number; icon: React.ReactNode;
  color: 'red' | 'amber' | 'muted';
}) {
  const styles = {
    red: 'border-red-500/20 bg-red-500/5',
    amber: 'border-amber-500/20 bg-amber-500/5',
    muted: 'bg-muted/30 border-border/40',
  }[color];
  const textColor = { red: 'text-red-500', amber: 'text-amber-500', muted: 'text-foreground' }[color];
  const iconColor = { red: 'text-red-500', amber: 'text-amber-500', muted: 'text-muted-foreground' }[color];

  return (
    <Card className={cn("border", styles)}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
          <span className={iconColor}>{icon}</span>
        </div>
        <p className={cn("text-2xl font-bold", textColor)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyCard({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      {icon}
      <p className="text-sm text-muted-foreground mt-2">{text}</p>
    </div>
  );
}
