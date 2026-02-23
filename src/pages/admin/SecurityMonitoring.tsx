import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  AlertTriangle, 
  Ban, 
  Activity, 
  RefreshCw, 
  Clock,
  Eye,
  Lock,
  Unlock,
  TrendingUp,
  TrendingDown,
  CheckCircle
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from 'recharts';
import { toast } from 'sonner';
import { subHours, subMinutes } from 'date-fns';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { AGENT_STATUS_THRESHOLDS } from '@/lib/agent-status-constants';
import { UI_LABELS, getAttackTypeLabel, getSeverityInfo } from '@/lib/ui-dictionary';
import { HelpTooltip } from '@/components/ui/tech-tooltip';
import { motion } from 'framer-motion';
import { useTenant } from '@/hooks/useTenant';

interface SecurityMetrics {
  rate_limit_breaches: number;
  replay_attempts: number;
  failed_logins: number;
  blocked_ips: number;
  critical_events: number;
  agents_offline: number;
}

interface SecurityEvent {
  id: string;
  attack_type: string;
  severity: string;
  ip_address: string;
  endpoint: string;
  details: Record<string, unknown>;
  created_at: string;
  blocked: boolean;
}

interface BlockedIP {
  id: string;
  ip_address: string;
  reason: string;
  blocked_until: string;
  created_at: string;
}

interface FailedLoginStat {
  ip_address: string;
  count: number;
  last_attempt: string;
}

export default function SecurityMonitoring() {
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const { tenant } = useTenant();
  
  const getTimeRangeDate = useCallback(() => {
    const hours = timeRange === '1h' ? 1 : timeRange === '6h' ? 6 : timeRange === '24h' ? 24 : 168;
    return subHours(new Date(), hours);
  }, [timeRange]);

  // Fetch security metrics
  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ['security-metrics', timeRange, tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const since = getTimeRangeDate().toISOString();
      
      // Rate limit breaches
      const { data: rateLimits } = await supabase
        .from('rate_limits')
        .select('*', { count: 'exact' })
        .gte('window_start', since)
        .not('blocked_until', 'is', null);

      // Failed logins
      const { data: failedLogins, count: failedLoginCount } = await supabase
        .from('failed_login_attempts')
        .select('*', { count: 'exact' })
        .gte('created_at', since);

      // Blocked IPs
      const { data: blockedIps, count: blockedIpCount } = await supabase
        .from('ip_blocklist')
        .select('*', { count: 'exact' })
        .gte('blocked_until', new Date().toISOString());

      // Critical security events
      const { data: securityEvents, count: criticalCount } = await supabase
        .from('security_logs')
        .select('*', { count: 'exact' })
        .gte('created_at', since)
        .in('severity', ['high', 'critical']);

      // Offline agents - usa threshold de alerta (1h) para segurança
      // ADR-026: Use agents_safe view to protect hmac_secret
      const offlineAlertThreshold = subHours(new Date(), AGENT_STATUS_THRESHOLDS.OFFLINE_ALERT_HOURS).toISOString();
      const { count: offlineAgents } = await supabase
        .from('agents_safe')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant.id)
        .lt('last_heartbeat', offlineAlertThreshold)
        .eq('status', 'active');

      return {
        rate_limit_breaches: rateLimits?.length || 0,
        replay_attempts: 0, // Would need HMAC signature analysis
        failed_logins: failedLoginCount || 0,
        blocked_ips: blockedIpCount || 0,
        critical_events: criticalCount || 0,
        agents_offline: offlineAgents || 0,
      } as SecurityMetrics;
    },
    enabled: !!tenant?.id,
    refetchInterval: 120000, // COST-OPT: 30s → 2min
  });

  // Fetch recent security events
  const { data: recentEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ['security-events', timeRange],
    queryFn: async () => {
      const since = getTimeRangeDate().toISOString();
      const { data, error } = await supabase
        .from('security_logs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as SecurityEvent[];
    },
    refetchInterval: 120000, // COST-OPT: 30s → 2min
  });

  // Fetch blocked IPs
  const { data: blockedIPs, isLoading: blockedLoading, refetch: refetchBlocked } = useQuery({
    queryKey: ['blocked-ips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ip_blocklist')
        .select('*')
        .gte('blocked_until', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as BlockedIP[];
    },
    refetchInterval: 120000, // COST-OPT: 30s → 2min
  });

  // Fetch failed login stats by IP
  const { data: failedLoginStats } = useQuery({
    queryKey: ['failed-login-stats', timeRange],
    queryFn: async () => {
      const since = getTimeRangeDate().toISOString();
      const { data, error } = await supabase
        .from('failed_login_attempts')
        .select('ip_address, created_at')
        .gte('created_at', since);
      
      if (error) throw error;
      
      // Group by IP
      const ipCounts: Record<string, { count: number; last_attempt: string }> = {};
      data?.forEach((attempt) => {
        if (!ipCounts[attempt.ip_address]) {
          ipCounts[attempt.ip_address] = { count: 0, last_attempt: attempt.created_at };
        }
        ipCounts[attempt.ip_address].count++;
        if (attempt.created_at > ipCounts[attempt.ip_address].last_attempt) {
          ipCounts[attempt.ip_address].last_attempt = attempt.created_at;
        }
      });
      
      return Object.entries(ipCounts)
        .map(([ip, stats]) => ({ ip_address: ip, ...stats }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10) as FailedLoginStat[];
    },
  });

  // Event timeline chart data
  const chartData = recentEvents?.reduce((acc: Record<string, { hour: string; events: number; blocked: number }>, event: SecurityEvent) => {
    const eventDate = new Date(event.created_at);
    const hour = `${String(eventDate.getHours()).padStart(2, '0')}:00`;
    if (!acc[hour]) {
      acc[hour] = { hour, events: 0, blocked: 0 };
    }
    acc[hour].events++;
    if (event.blocked) acc[hour].blocked++;
    return acc;
  }, {});

  const timelineData = Object.values(chartData || {}).slice(-12);

  const handleUnblockIP = async (id: string, ip: string) => {
    try {
      const { error } = await supabase
        .from('ip_blocklist')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      toast.success(`IP ${ip} desbloqueado com sucesso`);
      refetchBlocked();
    } catch (error) {
      toast.error('Erro ao desbloquear IP');
    }
  };

  const handleRunSecurityScan = async () => {
    try {
      const { error } = await supabase.functions.invoke('security-alert-dispatcher');
      if (error) throw error;
      toast.success('Scan de segurança iniciado');
      refetchMetrics();
    } catch (error) {
      toast.error('Erro ao iniciar scan');
    }
  };

  const getSeverityBadge = (severity: string) => {
    const info = getSeverityInfo(severity);
    return (
      <Badge className={info.badgeClass}>
        {info.emoji} {severity === 'critical' ? 'Urgente' : severity === 'high' ? 'Importante' : severity === 'warning' ? 'Atenção' : 'Info'}
      </Badge>
    );
  };

  // Contextual message based on metrics
  const getContextMessage = () => {
    if (!metrics) return null;
    
    if (metrics.rate_limit_breaches > 5 || metrics.failed_logins > 10) {
      return {
        type: 'warning',
        message: UI_LABELS.context_help.rate_limits_high
      };
    }
    
    if (metrics.critical_events === 0 && metrics.blocked_ips === 0) {
      return {
        type: 'success',
        message: UI_LABELS.context_help.all_secure
      };
    }
    
    return null;
  };

  const contextMessage = getContextMessage();

  return (
    <AdminPageLayout
      title={UI_LABELS.pages.security_monitoring.title}
      description={UI_LABELS.pages.security_monitoring.description}
    >
      <div className="space-y-6">
        {/* Controls */}
        <div className="flex justify-between items-center">
          <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)}>
            <TabsList>
              <TabsTrigger value="1h">1 hora</TabsTrigger>
              <TabsTrigger value="6h">6 horas</TabsTrigger>
              <TabsTrigger value="24h">24 horas</TabsTrigger>
              <TabsTrigger value="7d">7 dias</TabsTrigger>
            </TabsList>
          </Tabs>
          
          <Button onClick={handleRunSecurityScan} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            {UI_LABELS.actions.run_scan}
          </Button>
        </div>

        {/* Contextual Status Message */}
        {contextMessage && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className={contextMessage.type === 'success' 
              ? 'bg-green-500/10 border-green-500/20' 
              : 'bg-yellow-500/10 border-yellow-500/20'
            }>
              <CardContent className="py-4 flex items-center gap-3">
                {contextMessage.type === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                )}
                <span className={contextMessage.type === 'success' 
                  ? 'text-green-700 dark:text-green-400' 
                  : 'text-yellow-700 dark:text-yellow-400'
                }>
                  {contextMessage.message}
                </span>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Metric Cards - Humanized */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                {UI_LABELS.rate_limit.label}
                <HelpTooltip term="rate_limit" />
              </CardTitle>
              <Ban className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.rate_limit_breaches || 0}</div>
              <p className="text-xs text-muted-foreground">{UI_LABELS.rate_limit.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                {UI_LABELS.failed_logins.label}
                <HelpTooltip term="failed_login" />
              </CardTitle>
              <Lock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.failed_logins || 0}</div>
              <p className="text-xs text-muted-foreground">{UI_LABELS.failed_logins.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                {UI_LABELS.blocked_ips.label}
                <HelpTooltip term="ip_blocklist" />
              </CardTitle>
              <Shield className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.blocked_ips || 0}</div>
              <p className="text-xs text-muted-foreground">{UI_LABELS.blocked_ips.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                {UI_LABELS.critical_events.label}
                <HelpTooltip term="alerta" />
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{metrics?.critical_events || 0}</div>
              <p className="text-xs text-muted-foreground">{UI_LABELS.critical_events.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                {UI_LABELS.replay_attempts.label}
                <HelpTooltip term="replay" />
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.replay_attempts || 0}</div>
              <p className="text-xs text-muted-foreground">{UI_LABELS.replay_attempts.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                {UI_LABELS.agents_offline.label}
                <HelpTooltip term="heartbeat" />
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.agents_offline || 0}</div>
              <p className="text-xs text-muted-foreground">{UI_LABELS.agents_offline.description}</p>
            </CardContent>
          </Card>
        </div>

        {/* Event Timeline Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{UI_LABELS.charts.events_timeline}</CardTitle>
            <CardDescription>Eventos de segurança detectados e bloqueados automaticamente</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="hour" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))' 
                  }}
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="events" 
                  stackId="1" 
                  stroke="hsl(var(--primary))" 
                  fill="hsl(var(--primary) / 0.3)" 
                  name={UI_LABELS.charts.events_count}
                />
                <Area 
                  type="monotone" 
                  dataKey="blocked" 
                  stackId="2" 
                  stroke="hsl(var(--destructive))" 
                  fill="hsl(var(--destructive) / 0.3)" 
                  name={UI_LABELS.charts.blocked_count}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Security Events */}
          <Card>
            <CardHeader>
              <CardTitle>O que aconteceu recentemente</CardTitle>
              <CardDescription>Eventos de segurança detectados pelo sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>O que foi</TableHead>
                      <TableHead>Importância</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Quando</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventsLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center">Carregando...</TableCell>
                      </TableRow>
                    ) : recentEvents?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          <div className="flex flex-col items-center gap-2">
                            <Shield className="h-10 w-10 text-success/50" />
                            <p className="font-medium text-success">{UI_LABELS.empty_states.no_threats.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {UI_LABELS.empty_states.no_threats.description}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      recentEvents?.slice(0, 10).map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="text-sm">
                            {getAttackTypeLabel(event.attack_type)}
                          </TableCell>
                          <TableCell>{getSeverityBadge(event.severity)}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {event.ip_address?.slice(0, 15)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatBrazilDateTime(event.created_at, 'time')}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Blocked IPs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {UI_LABELS.blocked_ips.label}
                <HelpTooltip term="ip_blocklist" />
              </CardTitle>
              <CardDescription>Origens bloqueadas por comportamento suspeito</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Origem</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Expira</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center">Carregando...</TableCell>
                      </TableRow>
                    ) : blockedIPs?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                          <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          {UI_LABELS.empty_states.no_blocked_ips.description}
                        </TableCell>
                      </TableRow>
                    ) : (
                      blockedIPs?.map((ip) => (
                        <TableRow key={ip.id}>
                          <TableCell className="font-mono text-xs">{ip.ip_address}</TableCell>
                          <TableCell className="text-xs truncate max-w-[150px]">{ip.reason}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline">
                              <Clock className="h-3 w-3 mr-1" />
                              {formatBrazilDateTime(ip.blocked_until, 'time')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnblockIP(ip.id, ip.ip_address)}
                            >
                              <Unlock className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Failed Login Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Top IPs com Logins Falhos</CardTitle>
            <CardDescription>IPs com maior número de tentativas de login malsucedidas</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Última Tentativa</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedLoginStats?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Nenhuma tentativa de login falha no período
                    </TableCell>
                  </TableRow>
                ) : (
                  failedLoginStats?.map((stat) => (
                    <TableRow key={stat.ip_address}>
                      <TableCell className="font-mono">{stat.ip_address}</TableCell>
                      <TableCell>
                        <Badge variant={stat.count >= 10 ? 'destructive' : stat.count >= 5 ? 'secondary' : 'outline'}>
                          {stat.count}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatBrazilDateTime(stat.last_attempt, 'short')}
                      </TableCell>
                      <TableCell>
                        {stat.count >= 10 ? (
                          <Badge variant="destructive">Alto Risco</Badge>
                        ) : stat.count >= 5 ? (
                          <Badge className="bg-yellow-500">Suspeito</Badge>
                        ) : (
                          <Badge variant="outline">Normal</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminPageLayout>
  );
}
