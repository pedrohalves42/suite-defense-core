/**
 * Real-Time Security Dashboard — Redesigned for non-technical users
 * Clean, visual, with explanations everywhere
 */

import { useState, useEffect } from 'react';
import { isAgentOnline } from '@/lib/agent-status-constants';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Shield, ShieldCheck, ShieldAlert,
  Radio, AlertTriangle, HelpCircle,
  Clock, Zap, Monitor, Lock,
  RefreshCw, Ban, CheckCircle2, XCircle,
  Info, Wifi, WifiOff, Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { RiskScoreCard } from '@/components/admin/RiskScoreCard';
import { TenantBaselineProfile } from '@/components/admin/TenantBaselineProfile';
import { SecurityImpactFeed } from '@/components/admin/SecurityImpactFeed';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

// ─── Friendly labels for raw event types ───
const EVENT_LABELS: Record<string, { title: string; explanation: string; icon: string }> = {
  unauthorized:        { title: 'Site bloqueado no computador', explanation: 'Um computador tentou acessar um site proibido pela política de bloqueio e foi impedido', icon: '🚫' },
  AUTH_INVALID_SIG:    { title: 'Credencial inválida', explanation: 'Uma tentativa de login com dados incorretos foi barrada', icon: '🔑' },
  AUTH_INVALID_SIGNATURE: { title: 'Credencial inválida', explanation: 'Uma tentativa de login com dados incorretos foi barrada', icon: '🔑' },
  AUTH_EXPIRED_TOKEN:  { title: 'Sessão expirada', explanation: 'Uma sessão antiga tentou ser usada e foi bloqueada', icon: '⏰' },
  AUTH_MISSING_TOKEN:  { title: 'Login obrigatório', explanation: 'Alguém tentou acessar sem fazer login primeiro', icon: '🔒' },
  playbook_triggered:  { title: 'Proteção ativada automaticamente', explanation: 'O sistema detectou um risco e agiu sozinho para proteger', icon: '🛡️' },
  playbook_executed:   { title: 'Proteção concluída', explanation: 'Uma ação de proteção automática foi finalizada com sucesso', icon: '✅' },
  action_blocked:      { title: 'Ação perigosa bloqueada', explanation: 'Uma ação suspeita foi impedida pelo sistema', icon: '🚫' },
  threat_detected:     { title: 'Ameaça encontrada', explanation: 'O sistema identificou algo potencialmente perigoso', icon: '⚠️' },
  agent_isolated:      { title: 'Computador isolado', explanation: 'Um computador foi separado da rede por segurança', icon: '🔌' },
  brute_force:         { title: 'Ataque de senhas bloqueado', explanation: 'Alguém tentou adivinhar senhas repetidamente e foi bloqueado', icon: '🔨' },
  sql_injection:       { title: 'Tentativa de invasão bloqueada', explanation: 'Uma técnica de hacking foi detectada e impedida', icon: '🛑' },
  xss:                 { title: 'Código malicioso bloqueado', explanation: 'Tentativa de injetar código perigoso foi impedida', icon: '🦠' },
  rate_limit:          { title: 'Excesso de tentativas', explanation: 'Muitas requisições foram feitas em pouco tempo', icon: '⏱️' },
  control_characters:  { title: 'Dados suspeitos bloqueados', explanation: 'Dados com formato irregular foram rejeitados', icon: '🔍' },
  payload_tampering:   { title: 'Adulteração detectada', explanation: 'Os dados enviados foram alterados no caminho e bloqueados', icon: '🔧' },
  quota_exceeded:      { title: 'Limite atingido', explanation: 'O limite de uso foi alcançado temporariamente', icon: '📊' },
  path_traversal:      { title: 'Acesso a pasta proibida', explanation: 'Tentativa de acessar arquivos restritos foi bloqueada', icon: '📁' },
  invalid_input:       { title: 'Dados inválidos rejeitados', explanation: 'Informações com formato incorreto foram recusadas', icon: '❌' },
};

function getEventInfo(raw: string): {
  const adaptiveInterval = useAdaptivePolling(300_000); title: string; explanation: string; icon: string } {
  if (EVENT_LABELS[raw]) return EVENT_LABELS[raw];
  for (const [key, info] of Object.entries(EVENT_LABELS)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return info;
  }
  return {
    title: raw.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()),
    explanation: 'Evento registrado pelo sistema de segurança',
    icon: 'ℹ️',
  };
}

function extractFriendlyDetails(raw: any): { computer?: string; ip?: string; extra?: string } {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object') return {};
    return {
      computer: obj.agent_name || undefined,
      ip: obj.ip_address || undefined,
      extra: obj.endpoint ? `em ${obj.endpoint}` : undefined,
    };
  } catch {
    return {};
  }
}

// ─── Helper tooltip ───
function HelpTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help inline ml-1" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px] text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Metric card with explanation ───
function MetricTile({ icon: Icon, label, value, color, help }: {
  icon: React.ElementType; label: string; value: number; color: string; help: string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2.5 rounded-xl", color === 'text-primary' && 'bg-primary/10', color === 'text-destructive' && 'bg-destructive/10', color === 'text-warning' && 'bg-warning/10', color === 'text-success' && 'bg-success/10')}>
            <Icon className={cn("h-5 w-5", color)} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold leading-none">{value}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center">
              {label}
              <HelpTip text={help} />
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface SecurityEvent {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  explanation: string;
  icon: string;
  computer?: string;
  ip?: string;
  extra?: string;
  timestamp: string;
}

export default function RealTimeSecurityDashboard() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [isLive, setIsLive] = useState(true);

  // ─── Data queries ───
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
    enabled: !!tenant?.id, refetchInterval: adaptiveInterval,
    staleTime: 120_000,
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
    enabled: !!tenant?.id, refetchInterval: adaptiveInterval,
    staleTime: 120_000,
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
    enabled: !!tenant?.id, refetchInterval: adaptiveInterval,
    staleTime: 120_000,
  });

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
        id: a.id,
        last_heartbeat: a.last_heartbeat,
        is_isolated: !!a.is_isolated,
      }));

      const total = data.length;
      const isolated = data.filter(a => a.is_isolated).length;
      const protectedCount = data.filter(a => !a.is_isolated && isAgentOnline(a.last_heartbeat)).length;
      const offline = data.filter(a => !a.is_isolated && !isAgentOnline(a.last_heartbeat)).length;

      return { total, protected: protectedCount, isolated, offline };
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: adaptiveInterval,
    staleTime: 120_000,
  });

  const { data: recentLogs } = useQuery({
    queryKey: ['realtime-security-logs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await supabase.from('security_logs').select('id, attack_type, severity, details, created_at')
        .eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
    enabled: !!tenant?.id, refetchInterval: adaptiveInterval,
    staleTime: 120_000,
  });

  // Transform logs
  useEffect(() => {
    if (!recentLogs) return;
    const transformed: SecurityEvent[] = recentLogs.map(log => {
      const info = getEventInfo(log.attack_type || '');
      const details = extractFriendlyDetails(log.details);
      return {
        id: log.id,
        type: log.attack_type || 'info',
        severity: (log.severity as any) || 'info',
        title: info.title,
        explanation: info.explanation,
        icon: info.icon,
        computer: details.computer,
        ip: details.ip,
        extra: details.extra,
        timestamp: log.created_at,
      };
    });
    setEvents(transformed.slice(0, 20));
  }, [recentLogs]);

  // Realtime
  useEffect(() => {
    if (!tenant?.id || !isLive) return;
    const channel = supabase
      .channel('realtime-security-dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'security_logs', filter: `tenant_id=eq.${tenant.id}` }, (payload) => {
        const log = payload.new as any;
        const info = getEventInfo(log.attack_type || '');
        const details = extractFriendlyDetails(log.details);
        setEvents(prev => [{
          id: log.id, type: log.attack_type || 'info', severity: log.severity || 'info',
          title: info.title, explanation: info.explanation, icon: info.icon,
          computer: details.computer, ip: details.ip, extra: details.extra,
          timestamp: log.created_at,
        }, ...prev].slice(0, 20));
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

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Segurança em Tempo Real
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Acompanhe tudo que está acontecendo nos seus computadores agora
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isLive ? "default" : "secondary"} className={cn("gap-1", isLive && "animate-pulse")}>
            <Radio className="h-3 w-3" />
            {isLive ? 'AO VIVO' : 'PAUSADO'}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setIsLive(!isLive)}>
            {isLive ? 'Pausar' : 'Retomar'}
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ─── Risk Score ─── */}
      <RiskScoreCard />

      {/* ─── Quick metrics ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricTile
          icon={Zap} label="Proteções Hoje" value={playbookStats?.total || 0} color="text-primary"
          help="Quantidade de vezes que o sistema agiu automaticamente para proteger seus computadores hoje"
        />
        <MetricTile
          icon={Ban} label="Ataques Bloqueados" value={blockedStats?.today || 0} color="text-destructive"
          help="Tentativas de acesso não autorizado que foram impedidas pelo sistema hoje"
        />
        <MetricTile
          icon={Clock} label="Aguardando Você" value={approvalStats?.pending || 0} color="text-warning"
          help="Ações que precisam da sua aprovação para serem executadas"
        />
        <MetricTile
          icon={Monitor} label="Computadores OK" value={agentStats?.protected || 0} color="text-success"
          help="Computadores que estão ligados, conectados e protegidos neste momento"
        />
      </div>

      {/* ─── Main layout ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ─── Event feed ─── */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
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
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Cada linha é algo que o sistema detectou e tratou
                  <HelpTip text="Sempre que algo suspeito acontece, o sistema registra aqui. Vermelho = urgente, Amarelo = atenção, Azul = informativo." />
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[420px] pr-2">
              <AnimatePresence mode="popLayout">
                {events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <ShieldCheck className="h-14 w-14 text-success/60 mb-4" />
                    <p className="text-sm font-semibold">Tudo tranquilo! 🎉</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                      Nenhuma atividade suspeita foi detectada. Seus computadores estão seguros.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {events.map((event, idx) => (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: idx * 0.02 }}
                      >
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={cn(
                                "p-3 rounded-lg border-l-4 cursor-default transition-colors",
                                event.severity === 'critical' && "border-l-destructive bg-destructive/5",
                                event.severity === 'warning' && "border-l-warning bg-warning/5",
                                !['critical', 'warning'].includes(event.severity) && "border-l-primary/50 bg-primary/5",
                              )}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-start gap-2.5 min-w-0">
                                    <span className="text-base leading-none mt-0.5">{event.icon}</span>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium leading-tight">{event.title}</p>
                                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                        {event.computer && (
                                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                            <Monitor className="h-3 w-3" /> {event.computer}
                                          </span>
                                        )}
                                        {event.ip && (
                                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                            <Wifi className="h-3 w-3" /> {event.ip}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                                    {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true, locale: ptBR })}
                                  </span>
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[300px] text-xs p-3">
                              <p className="font-medium mb-1">💡 O que significa?</p>
                              <p>{event.explanation}</p>
                              {event.extra && <p className="mt-1 text-muted-foreground">{event.extra}</p>}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* ─── Right sidebar ─── */}
        <div className="space-y-4">

          {/* Computers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                Seus Computadores
                <HelpTip text="Mostra quantos computadores estão conectados e protegidos neste momento" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Protegidos', sublabel: 'Ligados e monitorados', value: agentStats?.protected || 0, color: 'bg-success', textColor: 'text-success', icon: Wifi },
                { label: 'Em quarentena', sublabel: 'Isolados por segurança', value: agentStats?.isolated || 0, color: 'bg-warning', textColor: 'text-warning', icon: ShieldAlert },
                { label: 'Desligados', sublabel: 'Sem comunicação', value: agentStats?.offline || 0, color: 'bg-muted-foreground/40', textColor: 'text-muted-foreground', icon: WifiOff },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={cn("h-2.5 w-2.5 rounded-full", item.color)} />
                    <div>
                      <span className="text-sm">{item.label}</span>
                      <p className="text-[10px] text-muted-foreground leading-tight">{item.sublabel}</p>
                    </div>
                  </div>
                  <span className={cn("font-bold text-lg", item.textColor)}>{item.value}</span>
                </div>
              ))}
              <div className="pt-3 border-t space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Cobertura de proteção</span>
                  <span className={cn("font-semibold", coveragePercent >= 80 ? "text-success" : coveragePercent >= 50 ? "text-warning" : "text-destructive")}>
                    {coveragePercent}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full transition-all rounded-full", coveragePercent >= 80 ? "bg-success" : coveragePercent >= 50 ? "bg-warning" : "bg-destructive")}
                    style={{ width: `${coveragePercent}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {coveragePercent === 100 ? 'Todos os computadores estão protegidos ✓' :
                   coveragePercent >= 80 ? 'Boa cobertura, mas alguns estão desligados' :
                   'Atenção: vários computadores estão sem proteção'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Approvals */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Aprovações de Hoje
                <HelpTip text="Algumas ações de segurança precisam que você aprove antes de serem executadas. Veja aqui o status delas." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Esperando você', value: approvalStats?.pending || 0, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
                  { label: 'Aprovadas', value: approvalStats?.approved || 0, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
                  { label: 'Negadas', value: approvalStats?.rejected || 0, icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
                  { label: 'Expiradas', value: approvalStats?.expired || 0, icon: AlertTriangle, color: 'text-muted-foreground', bg: 'bg-muted/50' },
                ].map(item => (
                  <div key={item.label} className={cn("p-2.5 rounded-lg text-center", item.bg)}>
                    <item.icon className={cn("h-4 w-4 mx-auto mb-1", item.color)} />
                    <p className={cn("text-lg font-bold", item.color)}>{item.value}</p>
                    <p className="text-[10px] text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Automatic protection */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                Proteção Automática
                <HelpTip text="O sistema pode agir sozinho quando detecta problemas. Aqui você vê quantas vezes isso aconteceu hoje." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <p className="text-lg font-bold">{playbookStats?.total || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                </div>
                <div className="p-2 rounded-lg bg-warning/10 text-center">
                  <p className="text-lg font-bold text-warning">{playbookStats?.pending || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Em andamento</p>
                </div>
                <div className="p-2 rounded-lg bg-success/10 text-center">
                  <p className="text-lg font-bold text-success">{playbookStats?.autoExecuted || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Concluídas</p>
                </div>
              </div>
              {(playbookStats?.total || 0) === 0 && (
                <p className="text-[11px] text-muted-foreground text-center mt-3 py-2">
                  Nenhuma ação automática hoje — tudo sob controle ✓
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── Bottom section ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SecurityImpactFeed />
        <TenantBaselineProfile />
      </div>
    </div>
  );
}
