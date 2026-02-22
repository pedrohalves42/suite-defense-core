/**
 * Real-Time Security Dashboard
 * Live security metrics, feed, and protection status
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Shield, ShieldAlert, ShieldCheck, ShieldX,
  Activity, Radio, AlertTriangle, CheckCircle,
  XCircle, Clock, Zap, Server, Lock, Unlock,
  Eye, TrendingUp, TrendingDown, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { RiskScoreCard } from '@/components/admin/RiskScoreCard';
import { SoarExecutionsCard } from '@/components/admin/SoarExecutionsCard';
import { AIInsightsTrendChart } from '@/components/admin/AIInsightsTrendChart';
import { SecurityImpactFeed } from '@/components/admin/SecurityImpactFeed';
import { TenantBaselineProfile } from '@/components/admin/TenantBaselineProfile';

interface SecurityEvent {
  id: string;
  type: 'playbook_executed' | 'action_blocked' | 'approval_created' | 'approval_expired' | 'threat_detected' | 'agent_isolated';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface MetricCard {
  label: string;
  value: number;
  change?: number;
  icon: React.ElementType;
  color: string;
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
        .gte('created_at', today.toISOString());
      
      if (error) throw error;
      
      const total = data?.length || 0;
      const autoExecuted = data?.filter(e => e.auto_executed && !e.dry_run).length || 0;
      const pending = data?.filter(e => e.status === 'pending').length || 0;
      
      return { total, autoExecuted, pending };
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000,
  });

  // Fetch blocked attempts
  const { data: blockedStats, refetch: refetchBlocked } = useQuery({
    queryKey: ['realtime-blocked-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { total: 0, today: 0 };
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count, error } = await supabase
        .from('blocked_access_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gte('created_at', today.toISOString());
      
      if (error) throw error;
      
      return { total: count || 0, today: count || 0 };
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000,
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
      
      const pending = data?.filter(a => a.status === 'pending').length || 0;
      const approved = data?.filter(a => a.status === 'approved').length || 0;
      const rejected = data?.filter(a => a.status === 'rejected').length || 0;
      const expired = data?.filter(a => a.status === 'expired').length || 0;
      
      return { pending, approved, rejected, expired };
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000,
  });

  // Fetch agent protection status
  const { data: agentStats, refetch: refetchAgents } = useQuery({
    queryKey: ['realtime-agent-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { total: 0, protected: 0, isolated: 0, offline: 0 };
      
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      // ADR-026: Use agents_safe view to protect hmac_secret
      const { data, error } = await supabase
        .from('agents_safe')
        .select('id, status, last_heartbeat, is_isolated')
        .eq('tenant_id', tenant.id)
        .is('archived_at', null);
      
      if (error) throw error;
      
      const total = data?.length || 0;
      const protected_ = data?.filter(a => 
        a.status === 'active' && 
        a.last_heartbeat && 
        new Date(a.last_heartbeat) > fiveMinutesAgo
      ).length || 0;
      const isolated = data?.filter(a => a.is_isolated).length || 0;
      const offline = total - protected_ - isolated;
      
      return { total, protected: protected_, isolated, offline };
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000,
  });

  // Fetch recent security logs for live feed
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
    refetchInterval: 10000,
  });

  // Transform logs to events
  useEffect(() => {
    if (recentLogs) {
      const transformedEvents: SecurityEvent[] = recentLogs.map(log => ({
        id: log.id,
        type: log.attack_type?.includes('playbook') ? 'playbook_executed' : 
              log.blocked ? 'action_blocked' : 'threat_detected',
        severity: log.severity as 'info' | 'warning' | 'critical',
        title: log.attack_type || 'Evento de Segurança',
        message: typeof log.details === 'object' ? JSON.stringify(log.details).slice(0, 100) : String(log.details || ''),
        timestamp: log.created_at,
        metadata: log.details as Record<string, unknown>,
      }));
      setEvents(transformedEvents.slice(0, 20));
    }
  }, [recentLogs]);

  // Real-time subscriptions
  useEffect(() => {
    if (!tenant?.id || !isLive) return;

    const channel = supabase
      .channel('realtime-security-dashboard')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'security_logs',
        filter: `tenant_id=eq.${tenant.id}`,
      }, (payload) => {
        const log = payload.new as any;
        const newEvent: SecurityEvent = {
          id: log.id,
          type: log.attack_type?.includes('playbook') ? 'playbook_executed' : 
                log.blocked ? 'action_blocked' : 'threat_detected',
          severity: log.severity,
          title: log.attack_type || 'Novo Evento',
          message: typeof log.details === 'object' ? JSON.stringify(log.details).slice(0, 100) : String(log.details || ''),
          timestamp: log.created_at,
          metadata: log.details,
        };
        setEvents(prev => [newEvent, ...prev].slice(0, 20));
        refetchPlaybooks();
        refetchBlocked();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'approval_requests',
        filter: `tenant_id=eq.${tenant.id}`,
      }, () => {
        refetchApprovals();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'playbook_executions',
        filter: `tenant_id=eq.${tenant.id}`,
      }, () => {
        refetchPlaybooks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, isLive, refetchPlaybooks, refetchBlocked, refetchApprovals]);

  const metrics: MetricCard[] = useMemo(() => [
    {
      label: 'Playbooks Hoje',
      value: playbookStats?.total || 0,
      icon: Zap,
      color: 'text-blue-500',
    },
    {
      label: 'Ações Bloqueadas',
      value: blockedStats?.today || 0,
      icon: ShieldX,
      color: 'text-red-500',
    },
    {
      label: 'Aprovações Pendentes',
      value: approvalStats?.pending || 0,
      icon: Clock,
      color: 'text-yellow-500',
    },
    {
      label: 'Computadores Protegidos',
      value: agentStats?.protected || 0,
      icon: ShieldCheck,
      color: 'text-green-500',
    },
  ], [playbookStats, blockedStats, approvalStats, agentStats]);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning': return <ShieldAlert className="h-4 w-4 text-yellow-500" />;
      default: return <Activity className="h-4 w-4 text-blue-500" />;
    }
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'playbook_executed': return 'border-l-green-500 bg-green-500/5';
      case 'action_blocked': return 'border-l-red-500 bg-red-500/5';
      case 'approval_created': return 'border-l-yellow-500 bg-yellow-500/5';
      case 'approval_expired': return 'border-l-muted bg-muted/30';
      case 'threat_detected': return 'border-l-orange-500 bg-orange-500/5';
      case 'agent_isolated': return 'border-l-purple-500 bg-purple-500/5';
      default: return 'border-l-border bg-card';
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
          <p className="text-muted-foreground text-xs">Monitoramento live de ações e proteção</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge 
            variant={isLive ? "default" : "secondary"} 
            className={cn(isLive && "animate-pulse")}
          >
            <Radio className={cn("h-3 w-3 mr-1", isLive && "text-green-400")} />
            {isLive ? 'AO VIVO' : 'PAUSADO'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsLive(!isLive)}
          >
            {isLive ? 'Pausar' : 'Retomar'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchPlaybooks();
              refetchBlocked();
              refetchApprovals();
              refetchAgents();
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Risk Score */}
      <RiskScoreCard />

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, idx) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <metric.icon className={cn("h-8 w-8", metric.color)} />
                  <span className="text-2xl font-bold">{metric.value}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{metric.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Feed */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Feed de Segurança
              {isLive && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Eventos em tempo real dos últimos 24h
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <AnimatePresence mode="popLayout">
                {events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ShieldCheck className="h-12 w-12 text-green-500 mb-4" />
                    <p className="text-sm font-medium">Tudo tranquilo</p>
                    <p className="text-xs text-muted-foreground">
                      Nenhum evento de segurança recente
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {events.map((event, idx) => (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: idx * 0.02 }}
                        className={cn(
                          "p-3 rounded-lg border-l-4 transition-colors",
                          getEventTypeColor(event.type)
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            {getSeverityIcon(event.severity)}
                            <div>
                              <p className="text-sm font-medium">{event.title}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                                {event.message}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(event.timestamp), { 
                              addSuffix: true, 
                              locale: ptBR 
                            })}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Protection Status */}
        <div className="space-y-4">
          {/* Agent Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                Status de Proteção
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-green-500"></div>
                    <span className="text-sm">Protegidos</span>
                  </div>
                  <span className="font-bold text-green-600">{agentStats?.protected || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-purple-500"></div>
                    <span className="text-sm">Isolados</span>
                  </div>
                  <span className="font-bold text-purple-600">{agentStats?.isolated || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-muted"></div>
                    <span className="text-sm">Offline</span>
                  </div>
                  <span className="font-bold text-muted-foreground">{agentStats?.offline || 0}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Cobertura</span>
                  <span className="font-medium text-green-600">
                    {agentStats?.total ? Math.round((agentStats.protected / agentStats.total) * 100) : 0}%
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all" 
                    style={{ 
                      width: `${agentStats?.total ? (agentStats.protected / agentStats.total) * 100 : 0}%` 
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Approvals Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Aprovações Hoje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10 text-center">
                  <p className="text-lg font-bold text-yellow-600">{approvalStats?.pending || 0}</p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
                <div className="p-2 rounded-lg bg-green-500/10 text-center">
                  <p className="text-lg font-bold text-green-600">{approvalStats?.approved || 0}</p>
                  <p className="text-xs text-muted-foreground">Aprovadas</p>
                </div>
                <div className="p-2 rounded-lg bg-red-500/10 text-center">
                  <p className="text-lg font-bold text-red-600">{approvalStats?.rejected || 0}</p>
                  <p className="text-xs text-muted-foreground">Rejeitadas</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <p className="text-lg font-bold text-muted-foreground">{approvalStats?.expired || 0}</p>
                  <p className="text-xs text-muted-foreground">Expiradas</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SOAR Executions */}
          <SoarExecutionsCard />
        </div>
      </div>

      {/* Security Impact Feed + Tenant Baseline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SecurityImpactFeed />
        <TenantBaselineProfile />
      </div>

      {/* AI Insights Trend Chart */}
      <AIInsightsTrendChart />
    </div>
  );
}
