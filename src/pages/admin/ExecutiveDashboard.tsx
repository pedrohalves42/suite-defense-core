import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  ArrowRight, Activity, Zap, RefreshCw,
  DollarSign, TrendingDown, TrendingUp, Minus, XCircle,
  CalendarDays, BarChart3, FileText, 
  Wrench, Lock, Bug, Eye, Server, Cpu, HardDrive, Clock,
  Award, PieChart, Siren, BanknoteIcon
} from 'lucide-react';
import { format, ptBR } from '@/lib/date-utils';
import { subDays } from 'date-fns';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// === Cost model for financial impact calculation ===
// Valores conservadores para PMEs brasileiras (2025-2026)
// Fontes: CERT.br, Kaspersky BR SMB Report, mercado local de suporte TI
const COST_MODEL = {
  security_event_critical: 2800, // R$ incidente crítico prevenido (resposta emergencial + downtime médio 4h)
  security_event_high: 1200, // R$ incidente alto risco (investigação + remediação ~2h técnico sênior)
  security_event_medium: 350, // R$ incidente médio (triagem + correção)
  auto_repair: 85, // R$ por auto-reparo (evita chamado técnico remoto ~R$85/atendimento)
  auto_recovery: 420, // R$ por recuperação automática (evita visita presencial ~R$180 + 1-2h downtime)
  policy_drift: 150, // R$ por correção de política (retrabalho de conformidade)
  blocked_access: 650, // R$ por acesso não autorizado bloqueado (custo médio de investigação)
  firewall_enforcement: 120, // R$ por regra de firewall aplicada
  agent_offline_per_hour: 75, // R$ por hora de endpoint sem monitoramento
};

export default function ExecutiveDashboard() {
  const { activeTenant, loading: tenantLoading } = useActiveTenant();
  const tenantId = activeTenant?.id;

  const { data: snapshots, isLoading: snapshotsLoading } = useAgentSnapshots();
  const agentCounts = getAgentStatusCounts(snapshots);
  const { data: riskDelta } = useTodayRiskDelta();

  // Main summary data
  const { data: summaryData, isLoading, refetch } = useQuery({
    queryKey: ['executive-summary-v2', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const now = new Date();
      const today = new Date(now); today.setHours(0,0,0,0);
      const todayISO = today.toISOString();
      const sevenDaysAgo = subDays(now, 7).toISOString();
      const thirtyDaysAgo = subDays(now, 30).toISOString();

      const sb = supabase as any;

      const [alertsRes, jobsTodayRes, jobs30dRes, blockedRes, evidenceRes, complianceRes, evidenceAllRes] = await Promise.all([
        sb.from('system_alerts').select('severity, status', { count: 'exact' }).eq('tenant_id', tenantId),
        sb.from('jobs').select('status').eq('tenant_id', tenantId).gte('created_at', todayISO),
        sb.from('jobs').select('status').eq('tenant_id', tenantId).gte('created_at', thirtyDaysAgo),
        sb.from('blocked_access_attempts').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('attempted_at', sevenDaysAgo),
        sb.from('agent_evidence_logs').select('event_type, severity').eq('tenant_id', tenantId).gte('created_at', sevenDaysAgo),
        sb.from('compliance_snapshots').select('overall_score, grade, category_scores, calculated_at').eq('tenant_id', tenantId).order('calculated_at', { ascending: false }).limit(1),
        sb.from('agent_evidence_logs').select('event_type, severity').eq('tenant_id', tenantId).gte('created_at', thirtyDaysAgo),
      ]);

      const alerts: Array<{ severity: string; status: string }> = alertsRes.data || [];
      const activeAlerts = alerts.filter(a => a.status === 'active').length;
      const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;

      const jobsToday: Array<{ status: string }> = jobsTodayRes.data || [];
      const jobs30d: Array<{ status: string }> = jobs30dRes.data || [];
      const blockedThreats: number = blockedRes.count || 0;

      const evidence7d: Array<{ event_type: string; severity: string }> = evidenceRes.data || [];
      const evidenceAll: Array<{ event_type: string; severity: string }> = evidenceAllRes.data || [];
      const compliance = complianceRes.data?.[0] || null;

      // Agent counts
      const totalAgents = agentCounts.total;
      const onlineAgents = agentCounts.online;
      const offlineAgents = agentCounts.offline + agentCounts.warning + agentCounts.never_connected;

      // Jobs metrics
      const totalJobsToday = jobsToday.length;
      const failedJobsToday = jobsToday.filter(j => j.status === 'failed').length;
      const completedJobsToday = jobsToday.filter(j => j.status === 'completed').length;
      const successRateToday = totalJobsToday > 0 ? Math.round(((completedJobsToday) / totalJobsToday) * 100) : 100;

      const totalJobs30d = jobs30d.length;
      const failedJobs30d = jobs30d.filter(j => j.status === 'failed').length;
      const completedJobs30d = jobs30d.filter(j => j.status === 'completed').length;

      // Security events breakdown (7 days)
      const securityEvents = {
        critical: evidence7d.filter(e => e.severity === 'critical').length,
        high: evidence7d.filter(e => e.severity === 'error' || e.severity === 'high').length,
        warning: evidence7d.filter(e => e.severity === 'warning').length,
        info: evidence7d.filter(e => e.severity === 'info' || e.severity === 'debug').length,
      };

      // Event type breakdown
      const eventTypes = {
        auto_repair: evidence7d.filter(e => e.event_type === 'auto_repair').length,
        auto_recovery: evidence7d.filter(e => e.event_type === 'auto_recovery').length,
        security_event: evidence7d.filter(e => e.event_type === 'security_event').length,
        policy_drift: evidence7d.filter(e => e.event_type === 'policy_drift').length,
        state_change: evidence7d.filter(e => e.event_type === 'state_change').length,
      };

      // 30-day event types for financial calc
      const eventTypes30d = {
        auto_repair: evidenceAll.filter(e => e.event_type === 'auto_repair').length,
        auto_recovery: evidenceAll.filter(e => e.event_type === 'auto_recovery').length,
        security_critical: evidenceAll.filter(e => e.event_type === 'security_event' && e.severity === 'critical').length,
        security_high: evidenceAll.filter(e => e.event_type === 'security_event' && (e.severity === 'error' || e.severity === 'high')).length,
        policy_drift: evidenceAll.filter(e => e.event_type === 'policy_drift').length,
      };

      // === REAL Financial Impact Calculation (30 days) ===
      const financialImpact = {
        autoRepairs: eventTypes30d.auto_repair * COST_MODEL.auto_repair,
        autoRecoveries: eventTypes30d.auto_recovery * COST_MODEL.auto_recovery,
        criticalPrevented: eventTypes30d.security_critical * COST_MODEL.security_event_critical,
        highPrevented: eventTypes30d.security_high * COST_MODEL.security_event_high,
        policyCorrections: eventTypes30d.policy_drift * COST_MODEL.policy_drift,
        blockedAccess: blockedThreats * COST_MODEL.blocked_access,
      };
      const totalCostAvoided = Object.values(financialImpact).reduce((a, b) => a + b, 0);

      // Overall score
      const agentHealthScore = totalAgents > 0 ? (onlineAgents / totalAgents) * 100 : 100;
      const alertPenalty = Math.min(activeAlerts * 5, 30);
      const overallScore = Math.max(0, Math.round(agentHealthScore - alertPenalty));

      return {
        totalAgents, onlineAgents, offlineAgents,
        activeAlerts, criticalAlerts,
        blockedThreats,
        successRateToday, totalJobsToday, failedJobsToday, completedJobsToday,
        totalJobs30d, failedJobs30d, completedJobs30d,
        overallScore,
        securityEvents, eventTypes, eventTypes30d,
        compliance,
        financialImpact, totalCostAvoided,
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

  // Recommended actions
  const actions = (() => {
    if (!summaryData) return [];
    const list: Array<{ priority: string; title: string; link: string }> = [];
    if (summaryData.offlineAgents > 0) list.push({ priority: 'high', title: `${summaryData.offlineAgents} computador${summaryData.offlineAgents > 1 ? 'es' : ''} offline`, link: '/admin/agent-health' });
    if (summaryData.criticalAlerts > 0) list.push({ priority: 'high', title: `${summaryData.criticalAlerts} alerta${summaryData.criticalAlerts > 1 ? 's' : ''} crítico${summaryData.criticalAlerts > 1 ? 's' : ''}`, link: '/admin/action-center' });
    if (summaryData.activeAlerts > 0) list.push({ priority: 'medium', title: `${summaryData.activeAlerts} alerta${summaryData.activeAlerts > 1 ? 's' : ''} ativo${summaryData.activeAlerts > 1 ? 's' : ''}`, link: '/admin/action-center' });
    if (summaryData.failedJobsToday > 0) list.push({ priority: 'medium', title: `${summaryData.failedJobsToday} tarefa${summaryData.failedJobsToday > 1 ? 's' : ''} com falha hoje`, link: '/admin/jobs-health' });
    return list;
  })();

  if (isLoading || snapshotsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  const complianceCats = summaryData?.compliance?.category_scores as Array<{ category: string; score: number; details: string }> | null;

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Visão Geral</h1>
            <p className="text-sm text-muted-foreground">
              Resumo executivo da proteção do seu ambiente
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground hidden md:inline">
              Atualizado: {summaryData?.lastUpdate ? format(summaryData.lastUpdate, "HH:mm") : '--:--'}
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </div>

        {/* === HERO: Protection Score === */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <Card className={cn("border", healthStatus?.bgClass)}>
            <CardContent className="pt-5 pb-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className={cn("flex items-center justify-center h-14 w-14 rounded-xl", healthStatus?.bgClass)}>
                  {healthStatus?.status === 'excellent' && <ShieldCheck className={cn("h-8 w-8", healthStatus.color)} />}
                  {healthStatus?.status === 'good' && <Shield className={cn("h-8 w-8", healthStatus.color)} />}
                  {healthStatus?.status === 'warning' && <ShieldAlert className={cn("h-8 w-8", healthStatus.color)} />}
                  {healthStatus?.status === 'critical' && <ShieldX className={cn("h-8 w-8", healthStatus.color)} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
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

              {/* Key metrics row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <MetricTile icon={<Monitor className="h-3.5 w-3.5" />} label="Online" value={`${agentCounts.online}`} sub={`de ${agentCounts.total}`} color="green" pulse={agentCounts.online > 0} />
                <MetricTile icon={<MonitorOff className="h-3.5 w-3.5" />} label="Offline" value={`${agentCounts.offline + agentCounts.warning + agentCounts.never_connected}`} sub="desconectados" color={agentCounts.offline > 0 ? 'red' : 'muted'} />
                <MetricTile icon={<DeltaIcon className="h-3.5 w-3.5" />} label="Risco" value={deltaInfo.label} sub={deltaInfo.description} color={deltaInfo.color === 'green' ? 'green' : deltaInfo.color === 'red' ? 'red' : 'muted'} />
                <MetricTile icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Ameaças Bloqueadas" value={`${summaryData?.blockedThreats || 0}`} sub="últimos 7 dias" color={summaryData?.blockedThreats ? 'green' : 'muted'} />
                <MetricTile icon={<Award className="h-3.5 w-3.5" />} label="Compliance" value={summaryData?.compliance?.grade || 'N/A'} sub={`Score: ${summaryData?.compliance?.overall_score || 0}/100`} color={summaryData?.compliance?.overall_score >= 80 ? 'green' : summaryData?.compliance?.overall_score >= 60 ? 'amber' : 'red'} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* === ROW 2: Financial Impact + Security Events === */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Financial Impact Card */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.06 }}>
            <Card className="h-full border-emerald-500/15 bg-emerald-500/[0.02]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BanknoteIcon className="h-4 w-4 text-emerald-500" />
                    Prejuízo Evitado (30 dias)
                  </CardTitle>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                        <Eye className="h-3 w-3 mr-1" />
                        Metodologia
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      <p className="font-semibold mb-1">Cálculo conservador (PMEs BR):</p>
                      <ul className="space-y-0.5">
                        <li>• CERT.br + Kaspersky BR SMB Report</li>
                        <li>• Auto-reparo: R$ 85 (chamado remoto evitado)</li>
                        <li>• Recuperação: R$ 420 (visita + downtime)</li>
                        <li>• Evento crítico: R$ 2.800 (resposta emergencial)</li>
                        <li>• Correção de política: R$ 150 (retrabalho)</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-3xl font-bold text-emerald-500">
                  {formatCurrency(summaryData?.totalCostAvoided || 0)}
                </div>
                <div className="space-y-1.5">
                  {summaryData?.financialImpact && (
                    <>
                      <ImpactRow label="Auto-reparos" count={summaryData.eventTypes30d.auto_repair} value={summaryData.financialImpact.autoRepairs} icon={<Wrench className="h-3 w-3" />} />
                      <ImpactRow label="Recuperações automáticas" count={summaryData.eventTypes30d.auto_recovery} value={summaryData.financialImpact.autoRecoveries} icon={<RefreshCw className="h-3 w-3" />} />
                      <ImpactRow label="Eventos críticos prevenidos" count={summaryData.eventTypes30d.security_critical} value={summaryData.financialImpact.criticalPrevented} icon={<Siren className="h-3 w-3" />} />
                      <ImpactRow label="Eventos alto risco prevenidos" count={summaryData.eventTypes30d.security_high} value={summaryData.financialImpact.highPrevented} icon={<Bug className="h-3 w-3" />} />
                      <ImpactRow label="Políticas corrigidas" count={summaryData.eventTypes30d.policy_drift} value={summaryData.financialImpact.policyCorrections} icon={<Lock className="h-3 w-3" />} />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Security Events Card */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }}>
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Atividade de Segurança (7 dias)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Severity breakdown */}
                <div className="grid grid-cols-4 gap-2">
                  <SeverityBox label="Crítico" count={summaryData?.securityEvents.critical || 0} color="red" />
                  <SeverityBox label="Alto" count={summaryData?.securityEvents.high || 0} color="orange" />
                  <SeverityBox label="Médio" count={summaryData?.securityEvents.warning || 0} color="amber" />
                  <SeverityBox label="Info" count={summaryData?.securityEvents.info || 0} color="blue" />
                </div>

                {/* Event type bars */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Por tipo de evento</p>
                  <EventBar label="Auto-reparos" count={summaryData?.eventTypes.auto_repair || 0} total={Object.values(summaryData?.eventTypes || {}).reduce((a: number, b: number) => a + b, 0) || 1} color="bg-blue-500" icon={<Wrench className="h-3 w-3" />} />
                  <EventBar label="Recuperações" count={summaryData?.eventTypes.auto_recovery || 0} total={Object.values(summaryData?.eventTypes || {}).reduce((a: number, b: number) => a + b, 0) || 1} color="bg-emerald-500" icon={<RefreshCw className="h-3 w-3" />} />
                  <EventBar label="Eventos de segurança" count={summaryData?.eventTypes.security_event || 0} total={Object.values(summaryData?.eventTypes || {}).reduce((a: number, b: number) => a + b, 0) || 1} color="bg-red-500" icon={<Siren className="h-3 w-3" />} />
                  <EventBar label="Desvio de política" count={summaryData?.eventTypes.policy_drift || 0} total={Object.values(summaryData?.eventTypes || {}).reduce((a: number, b: number) => a + b, 0) || 1} color="bg-amber-500" icon={<Lock className="h-3 w-3" />} />
                  <EventBar label="Mudanças de estado" count={summaryData?.eventTypes.state_change || 0} total={Object.values(summaryData?.eventTypes || {}).reduce((a: number, b: number) => a + b, 0) || 1} color="bg-purple-500" icon={<Server className="h-3 w-3" />} />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* === ROW 3: Compliance + Jobs Performance === */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Compliance Breakdown */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.14 }}>
            <Card className="h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Conformidade por Categoria
                  </CardTitle>
                  {summaryData?.compliance && (
                    <Badge variant="outline" className={cn("text-xs",
                      summaryData.compliance.overall_score >= 80 ? "text-green-500 border-green-500/30" : 
                      summaryData.compliance.overall_score >= 60 ? "text-amber-500 border-amber-500/30" :
                      "text-red-500 border-red-500/30"
                    )}>
                      Nota: {summaryData.compliance.grade} ({summaryData.compliance.overall_score}%)
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {complianceCats ? complianceCats.map((cat, i) => (
                  <ComplianceRow key={i} category={translateCategory(cat.category)} score={cat.score} details={cat.details} />
                )) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma avaliação disponível</p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Jobs Performance */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.18 }}>
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Desempenho de Tarefas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Today stats */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Hoje</p>
                  <div className="grid grid-cols-3 gap-2">
                    <MiniStat label="Executadas" value={summaryData?.totalJobsToday || 0} color="text-foreground" />
                    <MiniStat label="Sucesso" value={summaryData?.completedJobsToday || 0} color="text-green-500" />
                    <MiniStat label="Falha" value={summaryData?.failedJobsToday || 0} color="text-red-500" />
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground">Taxa de sucesso</span>
                      <span className={cn("text-xs font-bold",
                        (summaryData?.successRateToday || 0) >= 80 ? "text-green-500" :
                        (summaryData?.successRateToday || 0) >= 50 ? "text-amber-500" : "text-red-500"
                      )}>{summaryData?.successRateToday || 0}%</span>
                    </div>
                    <Progress value={summaryData?.successRateToday || 0} className="h-1.5" />
                  </div>
                </div>

                {/* 30 day stats */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Últimos 30 dias</p>
                  <div className="grid grid-cols-3 gap-2">
                    <MiniStat label="Total" value={summaryData?.totalJobs30d || 0} color="text-foreground" />
                    <MiniStat label="Sucesso" value={summaryData?.completedJobs30d || 0} color="text-green-500" />
                    <MiniStat label="Falha" value={summaryData?.failedJobs30d || 0} color="text-red-500" />
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground">Taxa de sucesso</span>
                      {(() => {
                        const rate = summaryData?.totalJobs30d ? Math.round((summaryData.completedJobs30d / summaryData.totalJobs30d) * 100) : 0;
                        return (
                          <>
                            <span className={cn("text-xs font-bold",
                              rate >= 80 ? "text-green-500" : rate >= 50 ? "text-amber-500" : "text-red-500"
                            )}>{rate}%</span>
                          </>
                        );
                      })()}
                    </div>
                    <Progress value={summaryData?.totalJobs30d ? Math.round((summaryData.completedJobs30d / summaryData.totalJobs30d) * 100) : 0} className="h-1.5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* === ROW 4: Actions + Today === */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.22 }}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-semibold">Ações Pendentes</CardTitle>
                  <span className="text-[11px] text-muted-foreground">
                    {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </span>
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
    </TooltipProvider>
  );
}

/* ─── Sub-components ──────────────────────────── */

function MetricTile({ icon, label, value, sub, color, pulse }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  color: 'green' | 'red' | 'emerald' | 'muted' | 'amber'; pulse?: boolean;
}) {
  const valueColor = {
    green: 'text-green-500', red: 'text-red-500',
    emerald: 'text-emerald-500', muted: 'text-foreground', amber: 'text-amber-500',
  }[color];
  const bgAccent = {
    green: 'bg-green-500/5 border-green-500/15', red: 'bg-red-500/5 border-red-500/15',
    emerald: 'bg-emerald-500/5 border-emerald-500/15', muted: 'bg-muted/30 border-border/40',
    amber: 'bg-amber-500/5 border-amber-500/15',
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

function ImpactRow({ label, count, value, icon }: { label: string; count: number; value: number; icon: React.ReactNode }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
        <Badge variant="secondary" className="text-[10px] h-4 px-1">{count}x</Badge>
      </div>
      <span className="text-sm font-semibold text-emerald-500">{formatCurrency(value)}</span>
    </div>
  );
}

function SeverityBox({ label, count, color }: { label: string; count: number; color: string }) {
  const colors: Record<string, string> = {
    red: 'text-red-500 bg-red-500/10 border-red-500/20',
    orange: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    blue: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  };
  return (
    <div className={cn("text-center p-2 rounded-lg border", colors[color])}>
      <p className="text-xl font-bold">{count}</p>
      <p className="text-[10px] uppercase tracking-wider font-medium">{label}</p>
    </div>
  );
}

function EventBar({ label, count, total, color, icon }: { label: string; count: number; total: number; color: string; icon: React.ReactNode }) {
  const pct = total > 0 ? Math.max((count / total) * 100, 2) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[11px] text-muted-foreground truncate">{label}</span>
          <span className="text-[11px] font-semibold">{count}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function ComplianceRow({ category, score, details }: { category: string; score: number; details: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium truncate">{category}</span>
          <span className={cn("text-xs font-bold",
            score >= 80 ? "text-green-500" : score >= 60 ? "text-amber-500" : "text-red-500"
          )}>{score}%</span>
        </div>
        <Progress value={score} className="h-1.5" />
        <p className="text-[10px] text-muted-foreground mt-0.5">{details}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-2 rounded-lg bg-muted/30 border border-border/40">
      <p className={cn("text-lg font-bold", color)}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

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

function translateCategory(cat: string): string {
  const map: Record<string, string> = {
    vulnerability_management: 'Gestão de Vulnerabilidades',
    agent_health: 'Saúde dos Agentes',
    certificate_management: 'Certificados Digitais',
    usb_security: 'Segurança USB',
    incident_response: 'Resposta a Incidentes',
    audit_trail: 'Trilha de Auditoria',
  };
  return map[cat] || cat;
}
