import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAgentSnapshots, getAgentStatusCounts } from '@/hooks/useAgentSnapshots';
import { useTodayRiskDelta, getDeltaInfo, formatCurrency } from '@/hooks/useRiskDelta';
import { 
  ShieldCheck, ShieldAlert, ShieldX, Shield,
  Monitor, MonitorOff, AlertTriangle, CheckCircle2,
  Clock, ArrowRight, Activity, Zap, RefreshCw,
  DollarSign, TrendingDown, TrendingUp, Minus, XCircle,
  CalendarDays, BarChart3, FileText, Target
} from 'lucide-react';
import { format, ptBR } from '@/lib/date-utils';
import { subDays } from 'date-fns';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';

export default function ExecutiveDashboard() {
  const { activeTenant, loading: tenantLoading } = useActiveTenant();
  const tenantId = activeTenant?.id;

  const { data: snapshots, isLoading: snapshotsLoading } = useAgentSnapshots();
  const agentCounts = getAgentStatusCounts(snapshots);
  const { data: riskDelta } = useTodayRiskDelta();

  const { data: summaryData, isLoading, refetch } = useQuery({
    queryKey: ['executive-summary', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const now = new Date();
      const today = new Date(now); today.setHours(0,0,0,0);
      const todayISO = today.toISOString();
      const sevenDaysAgo = subDays(now, 7).toISOString();

      const sb = supabase as any;

      const [alertsRes, jobsRes, blockedRes] = await Promise.all([
        sb.from('system_alerts').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
        sb.from('jobs').select('status').eq('tenant_id', tenantId).gte('created_at', todayISO),
        sb.from('blocked_access_attempts').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('blocked_at', sevenDaysAgo),
      ]);

      const pendingAlerts: number = alertsRes.count || 0;
      const recentJobs: Array<{ status: string }> = jobsRes.data || [];
      const blockedThreats: number = blockedRes.count || 0;

      const totalAgents = agentCounts.total;
      const onlineAgents = agentCounts.online;
      const offlineAgents = agentCounts.offline + agentCounts.warning + agentCounts.never_connected;

      const totalJobs = recentJobs.length;
      const failedJobs = recentJobs.filter((j) => j.status === 'failed').length;
      const successRate = totalJobs > 0 ? Math.round(((totalJobs - failedJobs) / totalJobs) * 100) : 100;

      const agentHealthScore = totalAgents > 0 ? (onlineAgents / totalAgents) * 100 : 100;
      const alertPenalty = Math.min(pendingAlerts * 5, 30);
      const overallScore = Math.max(0, Math.round(agentHealthScore - alertPenalty));

      return {
        totalAgents, onlineAgents, offlineAgents,
        pendingAlerts, blockedThreats, successRate,
        overallScore, totalJobs, failedJobs,
        lastUpdate: new Date()
      };
    },
    enabled: !tenantLoading && !!tenantId && !snapshotsLoading,
    refetchInterval: 300000,
    staleTime: 60000,
  });

  const getHealthStatus = (score: number) => {
    if (score >= 90) return { status: 'excellent' as const, message: 'Ambiente protegido', color: 'text-green-500', bgClass: 'border-green-500/20 bg-green-500/5' };
    if (score >= 70) return { status: 'good' as const, message: 'Proteção ativa', color: 'text-emerald-500', bgClass: 'border-emerald-500/20 bg-emerald-500/5' };
    if (score >= 50) return { status: 'warning' as const, message: 'Atenção necessária', color: 'text-amber-500', bgClass: 'border-amber-500/20 bg-amber-500/5' };
    return { status: 'critical' as const, message: 'Ação imediata', color: 'text-red-500', bgClass: 'border-red-500/20 bg-red-500/5' };
  };

  const healthStatus = summaryData ? getHealthStatus(summaryData.overallScore) : null;
  const deltaInfo = getDeltaInfo(riskDelta?.delta ?? null);
  const DeltaIcon = deltaInfo.icon === 'down' ? TrendingDown : deltaInfo.icon === 'up' ? TrendingUp : Minus;
  const costAvoided = riskDelta?.estimated_cost_avoided ?? 0;

  // Recommended actions
  const actions = (() => {
    if (!summaryData) return [];
    const list = [];
    if (summaryData.offlineAgents > 0) list.push({ priority: 'high', title: `${summaryData.offlineAgents} computador${summaryData.offlineAgents > 1 ? 'es' : ''} offline`, link: '/admin/agent-health' });
    if (summaryData.pendingAlerts > 0) list.push({ priority: 'medium', title: `${summaryData.pendingAlerts} alerta${summaryData.pendingAlerts > 1 ? 's' : ''} pendente${summaryData.pendingAlerts > 1 ? 's' : ''}`, link: '/admin/action-center' });
    if (summaryData.failedJobs > 0) list.push({ priority: 'medium', title: `${summaryData.failedJobs} job${summaryData.failedJobs > 1 ? 's' : ''} com falha hoje`, link: '/admin/jobs' });
    return list;
  })();

  if (isLoading || snapshotsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visão Geral</h1>
          <p className="text-sm text-muted-foreground">
            Resumo executivo da proteção do seu ambiente
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* === HERO: Protection Score + Key Metrics === */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <Card className={cn("border", healthStatus?.bgClass)}>
          <CardContent className="pt-5 pb-5 space-y-4">
            {/* Score row */}
            <div className="flex items-center gap-4">
              <div className={cn("flex items-center justify-center h-12 w-12 rounded-xl", healthStatus?.bgClass)}>
                {healthStatus?.status === 'excellent' && <ShieldCheck className={cn("h-7 w-7", healthStatus.color)} />}
                {healthStatus?.status === 'good' && <Shield className={cn("h-7 w-7", healthStatus.color)} />}
                {healthStatus?.status === 'warning' && <ShieldAlert className={cn("h-7 w-7", healthStatus.color)} />}
                {healthStatus?.status === 'critical' && <ShieldX className={cn("h-7 w-7", healthStatus.color)} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn("text-lg font-bold", healthStatus?.color)}>{healthStatus?.message}</span>
                  <Badge variant="outline" className="text-[10px] font-medium">
                    {summaryData?.overallScore}%
                  </Badge>
                  {agentCounts.online > 0 && (
                    <Badge variant="outline" className="gap-1 text-[10px] border-green-500/30 text-green-500">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                      </span>
                      Monitorando
                    </Badge>
                  )}
                </div>
                <Progress value={summaryData?.overallScore || 0} className="h-2" />
              </div>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <MetricTile
                icon={<Monitor className="h-3.5 w-3.5" />}
                label="Online"
                value={`${agentCounts.online}`}
                sub={`de ${agentCounts.total}`}
                color="green"
                pulse={agentCounts.online > 0}
              />
              <MetricTile
                icon={<MonitorOff className="h-3.5 w-3.5" />}
                label="Offline"
                value={`${agentCounts.offline + agentCounts.warning + agentCounts.never_connected}`}
                sub="desconectados"
                color={agentCounts.offline > 0 ? 'red' : 'muted'}
              />
              <MetricTile
                icon={<DeltaIcon className="h-3.5 w-3.5" />}
                label="Risco"
                value={deltaInfo.label}
                sub={deltaInfo.description}
                color={deltaInfo.color === 'green' ? 'green' : deltaInfo.color === 'red' ? 'red' : 'muted'}
              />
              <MetricTile
                icon={<ShieldCheck className="h-3.5 w-3.5" />}
                label="Ameaças Bloqueadas"
                value={`${summaryData?.blockedThreats || 0}`}
                sub="últimos 7 dias"
                color={summaryData?.blockedThreats ? 'green' : 'muted'}
              />
              <MetricTile
                icon={<DollarSign className="h-3.5 w-3.5" />}
                label="Custo Evitado"
                value={formatCurrency(costAvoided)}
                sub={costAvoided > 0 ? 'incidentes prevenidos' : 'sem incidentes'}
                color={costAvoided > 0 ? 'emerald' : 'muted'}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* === TODAY: Jobs + Events === */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.08 }}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">Hoje</CardTitle>
                <span className="text-[11px] text-muted-foreground">
                  {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {summaryData?.totalJobs || 0} jobs executados
                </span>
                {summaryData?.successRate !== undefined && (
                  <Badge variant="outline" className={cn(
                    "text-[10px]",
                    summaryData.successRate >= 80 ? "text-green-500 border-green-500/30" : 
                    summaryData.successRate >= 50 ? "text-amber-500 border-amber-500/30" : 
                    "text-red-500 border-red-500/30"
                  )}>
                    {summaryData.successRate}% sucesso
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {actions.length > 0 ? (
              <div className="space-y-2">
                {actions.map((action, idx) => (
                  <Link
                    key={idx}
                    to={action.link}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-colors hover:bg-muted/50",
                      action.priority === 'high' && "border-red-500/20 bg-red-500/5",
                      action.priority === 'medium' && "border-amber-500/20 bg-amber-500/5",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      {action.priority === 'high' ? (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                      <span className="text-sm font-medium">{action.title}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-500">Tudo em ordem</p>
                  <p className="text-xs text-muted-foreground">Nenhuma ação necessária no momento</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* === Quick Navigation === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NavButton to="/admin/dashboard" icon={<Activity className="h-5 w-5" />} label="Dashboard" />
        <NavButton to="/admin/reports" icon={<BarChart3 className="h-5 w-5" />} label="Relatórios" />
        <NavButton to="/admin/compliance-automation" icon={<FileText className="h-5 w-5" />} label="Compliance" />
        <NavButton to="/admin/playbooks" icon={<Zap className="h-5 w-5" />} label="Automações" />
      </div>
    </div>
  );
}

/* ─── Metric Tile ──────────────────────────── */

function MetricTile({ icon, label, value, sub, color, pulse }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: 'green' | 'red' | 'emerald' | 'muted';
  pulse?: boolean;
}) {
  const valueColor = {
    green: 'text-green-500', red: 'text-red-500',
    emerald: 'text-emerald-500', muted: 'text-foreground',
  }[color];

  const bgAccent = {
    green: 'bg-green-500/5 border-green-500/15',
    red: 'bg-red-500/5 border-red-500/15',
    emerald: 'bg-emerald-500/5 border-emerald-500/15',
    muted: 'bg-muted/30 border-border/40',
  }[color];

  return (
    <div className={cn("relative p-2.5 rounded-lg border", bgAccent)}>
      {pulse && (
        <span className="absolute top-2 right-2 flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
        </span>
      )}
      <div className="flex items-center gap-1 mb-1">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">{label}</span>
      </div>
      <p className={cn("text-lg font-bold leading-none", valueColor)}>{value}</p>
      <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{sub}</p>
    </div>
  );
}

/* ─── Nav Button ──────────────────────────── */

function NavButton({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Button asChild variant="outline" className="h-auto py-3.5 flex-col gap-1.5">
      <Link to={to}>
        {icon}
        <span className="text-xs">{label}</span>
      </Link>
    </Button>
  );
}
