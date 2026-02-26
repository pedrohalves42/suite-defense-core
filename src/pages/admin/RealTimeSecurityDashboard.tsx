/**
 * Real-Time Security Dashboard
 * Simplified language for non-technical users
 */

import { useState, useEffect, useMemo } from 'react';
import { isAgentOnline } from '@/lib/agent-status-constants';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Shield, ShieldCheck, ShieldX,
  Activity, Radio, AlertTriangle,
  Clock, Zap, Server, Lock,
  RefreshCw, MonitorCheck, Ban, Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { RiskScoreCard } from '@/components/admin/RiskScoreCard';
import { TenantBaselineProfile } from '@/components/admin/TenantBaselineProfile';
import { SecurityImpactFeed } from '@/components/admin/SecurityImpactFeed';

// === FRIENDLY LABELS ===
const EVENT_LABELS: Record<string, string> = {
  unauthorized: 'Acesso não autorizado',
  'AUTH_INVALID_SIG': 'Assinatura inválida',
  'AUTH_INVALID_SIGNATURE': 'Assinatura inválida',
  'AUTH_EXPIRED_TOKEN': 'Sessão expirada',
  'AUTH_MISSING_TOKEN': 'Credencial ausente',
  playbook_triggered: 'Proteção automática ativada',
  playbook_executed: 'Proteção automática executada',
  action_blocked: 'Ação bloqueada pelo sistema',
  threat_detected: 'Ameaça detectada',
  agent_isolated: 'Computador isolado por segurança',
  brute_force: 'Tentativa de força bruta',
  sql_injection: 'Tentativa de invasão',
  xss: 'Código malicioso detectado',
  rate_limit: 'Excesso de tentativas',
};

function friendlyTitle(raw: string): string {
  // Check exact match first
  if (EVENT_LABELS[raw]) return EVENT_LABELS[raw];
  // Check if any key is contained
  for (const [key, label] of Object.entries(EVENT_LABELS)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return label;
  }
  // Fallback: capitalize and clean up
  return raw
    .replace(/_/g, ' ')
    .replace(/^./, c => c.toUpperCase())
    .replace(/AUTH[_ ]?/gi, '')
    .replace(/INVA?L?I?D?/gi, 'Inválido')
    || 'Evento de segurança';
}

function friendlyMessage(raw: string): string {
  if (!raw || raw === '{}' || raw === 'null') return '';
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const parts: string[] = [];
    if (obj.agent_name) parts.push(`Computador: ${obj.agent_name}`);
    if (obj.error_code) {
      const code = EVENT_LABELS[obj.error_code] || obj.error_code.replace(/_/g, ' ');
      parts.push(code);
    }
    if (obj.ip_address) parts.push(`IP: ${obj.ip_address}`);
    if (obj.endpoint) parts.push(`Endereço: ${obj.endpoint}`);
    if (parts.length > 0) return parts.join(' · ');
    // If can't extract, just show truncated
    const str = JSON.stringify(obj);
    return str.length > 80 ? str.slice(0, 80) + '…' : str;
  } catch {
    return raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
  }
}

interface SecurityEvent {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: string;
}

export default function RealTimeSecurityDashboard() {
  const { tenant } = useTenant();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [isLive, setIsLive] = useState(true);

  // Fetch playbook executions
  const { data: playbookStats, refetch: refetchPlaybooks } = useQuery({
    queryKey: ['realtime-playbook-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { total: 0, autoExecuted: 0, pending: 0 };
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('playbook_executions')
        .select('id, status, auto_executed, dry_run')
        .eq('tenant_id', tenant.id)
        .gte('triggered_at', today.toISOString());
      if (error) throw error;
      return {
        total: data?.length || 0,
        autoExecuted: data?.filter(e => e.auto_executed && !e.dry_run).length || 0,
        pending: data?.filter(e => e.status === 'pending').length || 0,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 120000,
  });

  // Fetch blocked attempts
  const { data: blockedStats, refetch: refetchBlocked } = useQuery({
    queryKey: ['realtime-blocked-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { today: 0 };
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from('blocked_access_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gte('created_at', today.toISOString());
      if (error) throw error;
      return { today: count || 0 };
    },
    enabled: !!tenant?.id,
    refetchInterval: 120000,
  });

  // Fetch approval requests
  const { data: approvalStats, refetch: refetchApprovals } = useQuery({
    queryKey: ['realtime-approval-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { pending: 0, approved: 0, rejected: 0, expired: 0 };
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('approval_requests')
        .select('id, status')
        .eq('tenant_id', tenant.id)
        .gte('created_at', today.toISOString());
      if (error) throw error;
      return {
        pending: data?.filter(a => a.status === 'pending').length || 0,
        approved: data?.filter(a => a.status === 'approved').length || 0,
        rejected: data?.filter(a => a.status === 'rejected').length || 0,
        expired: data?.filter(a => a.status === 'expired').length || 0,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 120000,
  });

  // Fetch agent protection status
  const { data: agentStats, refetch: refetchAgents } = useQuery({
    queryKey: ['realtime-agent-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { total: 0, protected: 0, isolated: 0, offline: 0 };
      const { data: rpcData, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      if (error) throw error;
      const data = (rpcData as any[] || []).map((a: any) => ({
        id: a.id, status: a.status, last_heartbeat: a.last_heartbeat, is_isolated: a.is_isolated,
      }));
      const total = data.length;
      const protected_ = data.filter(a => a.status === 'active' && isAgentOnline(a.last_heartbeat)).length;
      const isolated = data.filter(a => a.is_isolated).length;
      const offline = total - protected_ - isolated;
      return { total, protected: protected_, isolated, offline };
    },
    enabled: !!tenant?.id,
    refetchInterval: 120000,
  });

  // Fetch recent security logs
  const { data: recentLogs } = useQuery({
    queryKey: ['realtime-security-logs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('security_logs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
    refetchInterval: 120000,
  });

  // Transform logs to friendly events
  useEffect(() => {
    if (recentLogs) {
      const transformed: SecurityEvent[] = recentLogs.map(log => ({
        id: log.id,
        type: log.blocked ? 'action_blocked' : log.attack_type || 'info',
        severity: (log.severity as 'info' | 'warning' | 'critical') || 'info',
        title: friendlyTitle(log.attack_type || ''),
        message: friendlyMessage(typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '')),
        timestamp: log.created_at,
      }));
      setEvents(transformed.slice(0, 20));
    }
  }, [recentLogs]);

  // Real-time subscriptions
  useEffect(() => {
    if (!tenant?.id || !isLive) return;
    const channel = supabase
      .channel('realtime-security-dashboard')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'security_logs',
        filter: `tenant_id=eq.${tenant.id}`,
      }, (payload) => {
        const log = payload.new as any;
        const newEvent: SecurityEvent = {
          id: log.id,
          type: log.blocked ? 'action_blocked' : log.attack_type || 'info',
          severity: log.severity || 'info',
          title: friendlyTitle(log.attack_type || ''),
          message: friendlyMessage(typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '')),
          timestamp: log.created_at,
        };
        setEvents(prev => [newEvent, ...prev].slice(0, 20));
        refetchPlaybooks();
        refetchBlocked();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_requests', filter: `tenant_id=eq.${tenant.id}` }, () => refetchApprovals())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playbook_executions', filter: `tenant_id=eq.${tenant.id}` }, () => refetchPlaybooks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, isLive, refetchPlaybooks, refetchBlocked, refetchApprovals]);

  const refreshAll = () => {
    refetchPlaybooks();
    refetchBlocked();
    refetchApprovals();
    refetchAgents();
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'critical': return { icon: <AlertTriangle className="h-4 w-4 text-destructive" />, border: 'border-l-destructive bg-destructive/5' };
      case 'warning': return { icon: <Shield className="h-4 w-4 text-warning" />, border: 'border-l-warning bg-warning/5' };
      default: return { icon: <Activity className="h-4 w-4 text-primary" />, border: 'border-l-primary bg-primary/5' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Segurança em Tempo Real
          </h1>
          <p className="text-muted-foreground text-xs">Veja o que está acontecendo agora nos seus computadores</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isLive ? "default" : "secondary"} className={cn(isLive && "animate-pulse")}>
            <Radio className={cn("h-3 w-3 mr-1", isLive && "text-green-400")} />
            {isLive ? 'AO VIVO' : 'PAUSADO'}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setIsLive(!isLive)}>
            {isLive ? 'Pausar' : 'Retomar'}
          </Button>
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Risk Score — already has friendly language */}
      <RiskScoreCard />

      {/* Metrics — friendly labels */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Proteções Automáticas', value: playbookStats?.total || 0, icon: Zap, color: 'text-primary' },
          { label: 'Acessos Bloqueados', value: blockedStats?.today || 0, icon: Ban, color: 'text-destructive' },
          { label: 'Aguardando Aprovação', value: approvalStats?.pending || 0, icon: Clock, color: 'text-warning' },
          { label: 'Computadores Seguros', value: agentStats?.protected || 0, icon: MonitorCheck, color: 'text-success' },
        ].map((m, idx) => (
          <motion.div key={m.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <m.icon className={cn("h-8 w-8", m.color)} />
                  <span className="text-2xl font-bold">{m.value}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{m.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Feed — friendly */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              O que aconteceu recentemente
              {isLive && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
              )}
            </CardTitle>
            <CardDescription className="text-xs">Eventos das últimas 24 horas</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <AnimatePresence mode="popLayout">
                {events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ShieldCheck className="h-12 w-12 text-success mb-4" />
                    <p className="text-sm font-medium">Tudo tranquilo! 🎉</p>
                    <p className="text-xs text-muted-foreground">Nenhuma atividade suspeita detectada</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {events.map((event, idx) => {
                      const style = getSeverityStyle(event.severity);
                      return (
                        <motion.div
                          key={event.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ delay: idx * 0.02 }}
                          className={cn("p-3 rounded-lg border-l-4 transition-colors", style.border)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              {style.icon}
                              <div>
                                <p className="text-sm font-medium">{event.title}</p>
                                {event.message && (
                                  <p className="text-xs text-muted-foreground truncate max-w-[300px]">{event.message}</p>
                                )}
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true, locale: ptBR })}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Protection Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                Seus Computadores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-success" />
                    <span className="text-sm">Protegidos</span>
                  </div>
                  <span className="font-bold text-success">{agentStats?.protected || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-warning" />
                    <span className="text-sm">Em quarentena</span>
                  </div>
                  <span className="font-bold text-warning">{agentStats?.isolated || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-muted" />
                    <span className="text-sm">Desligados</span>
                  </div>
                  <span className="font-bold text-muted-foreground">{agentStats?.offline || 0}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Cobertura de proteção</span>
                  <span className="font-medium text-success">
                    {agentStats?.total ? Math.round((agentStats.protected / agentStats.total) * 100) : 0}%
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-success transition-all"
                    style={{ width: `${agentStats?.total ? (agentStats.protected / agentStats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Approvals — friendly */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Aprovações de Hoje
              </CardTitle>
              <CardDescription className="text-xs">Ações que precisaram de autorização</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 rounded-lg bg-warning/10 text-center">
                  <p className="text-lg font-bold text-warning">{approvalStats?.pending || 0}</p>
                  <p className="text-[11px] text-muted-foreground">Esperando</p>
                </div>
                <div className="p-2 rounded-lg bg-success/10 text-center">
                  <p className="text-lg font-bold text-success">{approvalStats?.approved || 0}</p>
                  <p className="text-[11px] text-muted-foreground">Aprovadas</p>
                </div>
                <div className="p-2 rounded-lg bg-destructive/10 text-center">
                  <p className="text-lg font-bold text-destructive">{approvalStats?.rejected || 0}</p>
                  <p className="text-[11px] text-muted-foreground">Negadas</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <p className="text-lg font-bold text-muted-foreground">{approvalStats?.expired || 0}</p>
                  <p className="text-[11px] text-muted-foreground">Expiradas</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Automatic Actions — replacing SOAR jargon */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                Proteção Automática
              </CardTitle>
              <CardDescription className="text-xs">Ações executadas automaticamente hoje</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <p className="text-lg font-bold">{playbookStats?.total || 0}</p>
                  <p className="text-[11px] text-muted-foreground">Total</p>
                </div>
                <div className="p-2 rounded-lg bg-warning/10 text-center">
                  <p className="text-lg font-bold text-warning">{playbookStats?.pending || 0}</p>
                  <p className="text-[11px] text-muted-foreground">Em andamento</p>
                </div>
                <div className="p-2 rounded-lg bg-success/10 text-center">
                  <p className="text-lg font-bold text-success">{playbookStats?.autoExecuted || 0}</p>
                  <p className="text-[11px] text-muted-foreground">Concluídas</p>
                </div>
              </div>
              {(playbookStats?.total || 0) === 0 && (
                <div className="flex flex-col items-center py-4 text-center">
                  <Zap className="h-6 w-6 text-muted-foreground/30 mb-1" />
                  <p className="text-xs text-muted-foreground">Nenhuma ação automática hoje</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom section — friendly labels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SecurityImpactFeed />
        <TenantBaselineProfile />
      </div>
    </div>
  );
}
