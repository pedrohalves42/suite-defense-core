import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useTodayRiskDelta, getDeltaInfo, formatCurrency } from '@/hooks/useRiskDelta';
import { useUnifiedMetrics, COST_MODEL } from '@/hooks/useUnifiedMetrics';
import { 
  ShieldCheck, ShieldAlert, ShieldX, Shield,
  Monitor, MonitorOff, AlertTriangle, CheckCircle2,
  ArrowRight, Activity, Zap, RefreshCw,
  TrendingDown, TrendingUp, Minus, XCircle,
  CalendarDays, BarChart3, FileText, 
  Wrench, Lock, Bug, Eye, Siren, BanknoteIcon,
  Building2, Users, Laptop, Clock, HandCoins, ShieldBan,
  Flame, HeartPulse, FileCheck, Hammer
} from 'lucide-react';
import { format, ptBR } from '@/lib/date-utils';
import { subDays } from 'date-fns';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function ExecutiveDashboard() {
  const { metrics, isLoading: unifiedLoading, refetch: refetchUnified, tenant } = useUnifiedMetrics();
  const tenantId = tenant?.id;
  const { data: riskDelta } = useTodayRiskDelta();

  // Executive-specific data: jobs and compliance (not shared)
  const { data: execData, isLoading: execLoading, refetch: refetchExec } = useQuery({
    queryKey: ['executive-extra', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const now = new Date();
      const today = new Date(now); today.setHours(0,0,0,0);
      const todayISO = today.toISOString();
      const thirtyDaysAgo = subDays(now, 30).toISOString();
      const sb = supabase as any;

      const [jobsTodayRes, jobs30dRes, complianceRes] = await Promise.all([
        sb.from('jobs').select('status, type').eq('tenant_id', tenantId).gte('created_at', todayISO),
        sb.from('jobs').select('status, type').eq('tenant_id', tenantId).gte('created_at', thirtyDaysAgo),
        sb.from('compliance_snapshots').select('overall_score, grade, category_scores, calculated_at').eq('tenant_id', tenantId).order('calculated_at', { ascending: false }).limit(1),
      ]);

      const jobsToday: Array<{ status: string; type: string }> = jobsTodayRes.data || [];
      const jobs30d: Array<{ status: string; type: string }> = jobs30dRes.data || [];
      const compliance = complianceRes.data?.[0] || null;

      const automatedJobsCompleted = jobs30d.filter(j => j.status === 'completed').length;
      const totalJobs30d = jobs30d.length;
      const successRateToday = jobsToday.length > 0 ? Math.round((jobsToday.filter(j => j.status === 'completed').length / jobsToday.length) * 100) : 100;

      return {
        compliance,
        automatedJobsCompleted,
        totalJobs30d,
        successRateToday,
        totalJobsToday: jobsToday.length,
        completedJobsToday: jobsToday.filter(j => j.status === 'completed').length,
        failedJobsToday: jobsToday.filter(j => j.status === 'failed').length,
        lastUpdate: new Date(),
      };
    },
    enabled: !!tenantId,
    refetchInterval: 60000,
    staleTime: 15000,
  });

  const isLoading = unifiedLoading || execLoading;
  const refetch = () => { refetchUnified(); refetchExec(); };

  // Derive from unified metrics
  const totalAgents = metrics?.agents.total || 0;
  const onlineAgents = metrics?.agents.online || 0;
  const offlineAgents = (metrics?.agents.offline || 0) + (metrics?.agents.warning || 0) + (metrics?.agents.neverConnected || 0);
  const protectionCoverage = metrics?.agents.protectionPercent || 0;
  const agentHealthScore = totalAgents > 0 ? (onlineAgents / totalAgents) * 100 : 100;
  const alertPenalty = Math.min((metrics?.alerts.active || 0) * 5, 30);
  const overallScore = Math.max(0, Math.round(agentHealthScore - alertPenalty));

  // Build summaryData-compatible object from unified + exec data
  const summaryData = metrics && execData ? {
    activeAlerts: metrics.alerts.active,
    criticalAlerts: metrics.alerts.critical,
    blockedThreats: metrics.blocked.last7d,
    actions30d: {
      auto_repairs: metrics.evidence.autoRepairs,
      auto_detections: 0,
      auto_recoveries: metrics.evidence.autoRecoveries,
      critical_prevented: metrics.evidence.last30d.filter(e => e.event_type === 'security_event' && e.severity === 'critical').length,
      high_prevented: metrics.evidence.last30d.filter(e => e.event_type === 'security_event' && (e.severity === 'high' || e.severity === 'error')).length,
      medium_prevented: metrics.evidence.last30d.filter(e => e.event_type === 'security_event' && e.severity === 'warning').length,
      policy_corrections: metrics.evidence.policyDrifts,
      blocked_access: metrics.blocked.last7d,
      total_events: metrics.evidence.last30d.filter(e => e.severity !== 'info' && e.severity !== 'debug').length,
    },
    automatedActions: metrics.evidence.autoRepairs + metrics.evidence.autoRecoveries + metrics.evidence.policyDrifts,
    incidentsContained: metrics.evidence.incidentsContained,
    hoursOfITSaved: metrics.financial.hoursOfITSaved,
    automatedJobsCompleted: execData.automatedJobsCompleted,
    totalJobs30d: execData.totalJobs30d,
    financialImpact: metrics.financial.breakdown,
    totalCostAvoided: metrics.financial.totalCostAvoided,
    events7d: {
      critical: metrics.evidence.last7d.filter(e => e.severity === 'critical').length,
      high: metrics.evidence.last7d.filter(e => e.severity === 'error' || e.severity === 'high').length,
      warning: metrics.evidence.last7d.filter(e => e.severity === 'warning').length,
      info: metrics.evidence.last7d.filter(e => e.severity === 'info' || e.severity === 'debug').length,
    },
    compliance: execData.compliance,
    successRateToday: execData.successRateToday,
    totalJobsToday: execData.totalJobsToday,
    completedJobsToday: execData.completedJobsToday,
    failedJobsToday: execData.failedJobsToday,
    lastUpdate: execData.lastUpdate,
  } : null;

  const getHealthStatus = (score: number) => {
    if (score >= 90) return { status: 'excellent' as const, message: 'Sua empresa está protegida', color: 'text-success', bgClass: 'border-success/20 bg-gradient-to-br from-success/8 to-success/3' };
    if (score >= 70) return { status: 'good' as const, message: 'Proteção ativa na sua empresa', color: 'text-success', bgClass: 'border-success/15 bg-gradient-to-br from-success/6 to-transparent' };
    if (score >= 50) return { status: 'warning' as const, message: 'Sua empresa precisa de atenção', color: 'text-warning', bgClass: 'border-warning/20 bg-gradient-to-br from-warning/8 to-warning/3' };
    return { status: 'critical' as const, message: 'Risco elevado para sua empresa', color: 'text-destructive', bgClass: 'border-destructive/20 bg-gradient-to-br from-destructive/8 to-destructive/3' };
  };

  const healthStatus = summaryData ? getHealthStatus(overallScore) : null;
  const deltaInfo = getDeltaInfo(riskDelta?.delta ?? null);
  const DeltaIcon = deltaInfo.icon === 'down' ? TrendingDown : deltaInfo.icon === 'up' ? TrendingUp : Minus;

  // Recommended actions
  const actions = (() => {
    if (!summaryData) return [];
    const list: Array<{ priority: string; title: string; link: string }> = [];
    if (offlineAgents > 0) list.push({ priority: 'high', title: `${offlineAgents} computador${offlineAgents > 1 ? 'es' : ''} sem proteção`, link: '/admin/agent-health' });
    if (summaryData.criticalAlerts > 0) list.push({ priority: 'high', title: `${summaryData.criticalAlerts} alerta${summaryData.criticalAlerts > 1 ? 's' : ''} crítico${summaryData.criticalAlerts > 1 ? 's' : ''} pendente${summaryData.criticalAlerts > 1 ? 's' : ''}`, link: '/admin/alert-resolution' });
    if (summaryData.activeAlerts > 0) list.push({ priority: 'medium', title: `${summaryData.activeAlerts} situaç${summaryData.activeAlerts > 1 ? 'ões' : 'ão'} aguardando revisão`, link: '/admin/alert-resolution' });
    if (summaryData.failedJobsToday > 0) list.push({ priority: 'medium', title: `${summaryData.failedJobsToday} tarefa${summaryData.failedJobsToday > 1 ? 's' : ''} não concluída${summaryData.failedJobsToday > 1 ? 's' : ''} hoje`, link: '/admin/jobs-health' });
    return list;
  })();

  if (isLoading) {
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
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              Proteção da Empresa
            </h1>
            <p className="text-sm text-muted-foreground">
              O que o CyberShield está fazendo pela sua organização
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

        {/* === HERO: Protection Status === */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card className={cn("border backdrop-blur-sm", healthStatus?.bgClass)}>
            <CardContent className="pt-5 pb-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className={cn("flex items-center justify-center h-14 w-14 rounded-2xl shadow-lg", healthStatus?.bgClass)}>
                  {healthStatus?.status === 'excellent' && <ShieldCheck className={cn("h-8 w-8", healthStatus.color)} />}
                  {healthStatus?.status === 'good' && <Shield className={cn("h-8 w-8", healthStatus.color)} />}
                  {healthStatus?.status === 'warning' && <ShieldAlert className={cn("h-8 w-8", healthStatus.color)} />}
                  {healthStatus?.status === 'critical' && <ShieldX className={cn("h-8 w-8", healthStatus.color)} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={cn("text-lg font-bold", healthStatus?.color)}>{healthStatus?.message}</span>
                    <Badge variant="outline" className="text-[10px] font-medium">
                      {overallScore}%
                    </Badge>
                    {onlineAgents > 0 && (
                      <Badge variant="outline" className="gap-1 text-[10px] border-success/30 text-success">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                        </span>
                        Monitorando 24/7
                      </Badge>
                    )}
                  </div>
                  <Progress value={overallScore || 0} className="h-2" />
                </div>
              </div>

              {/* Key metrics - focused on BUSINESS impact */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <MetricTile icon={<Laptop className="h-3.5 w-3.5" />} label="Computadores" value={`${onlineAgents}/${totalAgents}`} sub="protegidos" color="green" pulse={onlineAgents > 0} />
                <MetricTile icon={<ShieldBan className="h-3.5 w-3.5" />} label="Ameaças Bloqueadas" value={`${summaryData?.blockedThreats || 0}`} sub="últimos 7 dias" color={summaryData?.blockedThreats ? 'green' : 'muted'} />
                <MetricTile icon={<DeltaIcon className="h-3.5 w-3.5" />} label="Nível de Risco" value={deltaInfo.label} sub={deltaInfo.description} color={deltaInfo.color === 'green' ? 'green' : deltaInfo.color === 'red' ? 'red' : 'muted'} />
                <MetricTile icon={<Hammer className="h-3.5 w-3.5" />} label="Correções Automáticas" value={`${summaryData?.automatedActions || 0}`} sub="últimos 30 dias" color={summaryData?.automatedActions ? 'emerald' : 'muted'} />
                <MetricTile icon={<FileCheck className="h-3.5 w-3.5" />} label="Conformidade" value={summaryData?.compliance?.grade || 'N/A'} sub={`Score: ${summaryData?.compliance?.overall_score || 0}/100`} color={summaryData?.compliance?.overall_score >= 80 ? 'green' : summaryData?.compliance?.overall_score >= 60 ? 'amber' : 'red'} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* === ROW 2: What CyberShield DID for you + Financial Savings === */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* What CyberShield did - Business focused */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.06 }}>
            <Card className="h-full border-info/15 bg-gradient-to-br from-info/[0.06] to-transparent backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-info" />
                  O que fizemos pela sua empresa (30 dias)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Big numbers - business impact */}
                <div className="grid grid-cols-3 gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-center p-3 rounded-xl bg-info/10 border border-info/20 cursor-help shadow-sm">
                        <p className="text-2xl font-bold text-info">{summaryData?.automatedActions || 0}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Problemas corrigidos<br/>automaticamente</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      <p className="font-semibold mb-1">Como é calculado:</p>
                      <p>Soma de reparos automáticos ({summaryData?.actions30d.auto_repairs || 0}), restaurações de serviço ({summaryData?.actions30d.auto_recoveries || 0}) e correções de conformidade ({summaryData?.actions30d.policy_corrections || 0}) registrados nos últimos 30 dias.</p>
                      <p className="mt-1 text-muted-foreground">Fonte: registros de evidência dos agentes (severity ≥ warning)</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-center p-3 rounded-xl bg-destructive/10 border border-destructive/20 cursor-help shadow-sm">
                        <p className="text-2xl font-bold text-destructive">{summaryData?.incidentsContained || 0}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Incidentes de segurança<br/>contidos</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      <p className="font-semibold mb-1">Como é calculado:</p>
                      <p>Eventos de segurança detectados e neutralizados: críticos ({summaryData?.actions30d.critical_prevented || 0}), altos ({summaryData?.actions30d.high_prevented || 0}) e médios ({summaryData?.actions30d.medium_prevented || 0}).</p>
                      <p className="mt-1 text-muted-foreground">Fonte: logs de evidência com event_type = 'security_event'</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-center p-3 rounded-xl bg-warning/10 border border-warning/20 cursor-help shadow-sm">
                        <p className="text-2xl font-bold text-warning">{summaryData?.hoursOfITSaved ? Math.round(summaryData.hoursOfITSaved) : 0}h</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Horas de TI<br/>economizadas</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      <p className="font-semibold mb-1">Como é calculado:</p>
                      <ul className="space-y-0.5">
                        <li>• Reparo automático: 0,5h × {summaryData?.actions30d.auto_repairs || 0}</li>
                        <li>• Restauração de serviço: 1h × {summaryData?.actions30d.auto_recoveries || 0}</li>
                        <li>• Correção de conformidade: 0,25h × {summaryData?.actions30d.policy_corrections || 0}</li>
                        <li>• Incidente crítico: 2h × {summaryData?.actions30d.critical_prevented || 0}</li>
                      </ul>
                      <p className="mt-1 text-muted-foreground">Estimativa conservadora baseada em tempo médio de resolução manual</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Detailed breakdown - friendly language */}
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Detalhamento</p>
                  <ActionRow icon={<Wrench className="h-3 w-3 text-info" />} label="Problemas corrigidos automaticamente" count={summaryData?.actions30d.auto_repairs || 0} description="Falhas detectadas e resolvidas sem intervenção" tooltip="Eventos do tipo 'auto_repair' com severity ≥ warning nos últimos 30 dias" />
                  <ActionRow icon={<RefreshCw className="h-3 w-3 text-success" />} label="Serviços restaurados" count={summaryData?.actions30d.auto_recoveries || 0} description="Recuperação automática sem downtime" tooltip="Eventos 'auto_recovery' com severity ≥ warning nos últimos 30 dias" />
                  <ActionRow icon={<Flame className="h-3 w-3 text-destructive" />} label="Ameaças críticas neutralizadas" count={summaryData?.actions30d.critical_prevented || 0} description="Incidentes graves bloqueados pelo sistema" tooltip="Eventos 'security_event' com severity 'critical' nos últimos 30 dias" />
                  <ActionRow icon={<Bug className="h-3 w-3 text-warning" />} label="Riscos de segurança contidos" count={summaryData?.actions30d.high_prevented || 0} description="Vulnerabilidades identificadas e tratadas" tooltip="Eventos 'security_event' com severity 'high' nos últimos 30 dias" />
                  <ActionRow icon={<Lock className="h-3 w-3 text-accent" />} label="Políticas de segurança realinhadas" count={summaryData?.actions30d.policy_corrections || 0} description="Desvios de conformidade corrigidos" tooltip="Eventos 'policy_drift' registrados nos últimos 30 dias" />
                  <ActionRow icon={<ShieldBan className="h-3 w-3 text-info" />} label="Acessos não autorizados bloqueados" count={summaryData?.blockedThreats || 0} description="Tentativas barradas nos últimos 7 dias" tooltip="Total de registros na tabela 'blocked_access_attempts' dos últimos 7 dias" />
                  {(summaryData?.actions30d.auto_detections || 0) > 0 && (
                    <div className="pt-1.5 mt-1.5 border-t border-border/30">
                      <ActionRow icon={<Eye className="h-3 w-3 text-muted-foreground" />} label="Verificações de rotina realizadas" count={summaryData?.actions30d.auto_detections || 0} description="Monitoramento contínuo (não contabilizado como ação)" tooltip="Detecções com severity 'info'/'debug' — são checagens periódicas, não ações corretivas" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Financial Impact */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }}>
            <Card className="h-full border-emerald-500/15 bg-emerald-500/[0.02]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <HandCoins className="h-4 w-4 text-emerald-500" />
                    Economia para a Empresa (30 dias)
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
                        <li>• Baseado em CERT.br + mercado local de TI</li>
                        <li>• Chamado técnico remoto evitado: R$ 45</li>
                        <li>• Restauração de serviço sem visita: R$ 150</li>
                        <li>• Incidente crítico contido: R$ 500</li>
                        <li>• Correção de conformidade automática: R$ 60</li>
                        <li>• Site perigoso bloqueado: R$ 5</li>
                      </ul>
                      <p className="mt-1 text-muted-foreground">Incidentes são deduplicados: conta-se 1x por agente/tipo</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-3xl font-bold text-emerald-500">
                  {formatCurrency(summaryData?.totalCostAvoided || 0)}
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  em custos que sua empresa <strong>não precisou gastar</strong>
                </p>
                <div className="space-y-1.5">
                  {summaryData?.financialImpact && (
                    <>
                      <ImpactRow label="Chamados técnicos evitados" count={summaryData.actions30d.auto_repairs} value={summaryData.financialImpact.autoRepairs} icon={<Wrench className="h-3 w-3" />} unitCost="R$ 45/chamado" />
                      <ImpactRow label="Downtime evitado" count={summaryData.actions30d.auto_recoveries} value={summaryData.financialImpact.autoRecoveries} icon={<RefreshCw className="h-3 w-3" />} unitCost="R$ 150/restauração" />
                      <ImpactRow label="Crises de segurança evitadas" count={summaryData.actions30d.critical_prevented} value={summaryData.financialImpact.criticalPrevented} icon={<Siren className="h-3 w-3" />} unitCost="R$ 500/incidente crítico" />
                      <ImpactRow label="Investigações evitadas" count={summaryData.actions30d.high_prevented} value={summaryData.financialImpact.highPrevented} icon={<Bug className="h-3 w-3" />} unitCost="R$ 200/ameaça alta" />
                      <ImpactRow label="Retrabalho de compliance evitado" count={summaryData.actions30d.policy_corrections} value={summaryData.financialImpact.policyCorrections} icon={<Lock className="h-3 w-3" />} unitCost="R$ 60/correção" />
                      <ImpactRow label="Sites perigosos bloqueados" count={summaryData.blockedThreats} value={summaryData.financialImpact.blockedAccess} icon={<ShieldBan className="h-3 w-3" />} unitCost="R$ 5/bloqueio" />
                    </>
                  )}
                </div>

                {/* ROI Summary */}
                {summaryData?.hoursOfITSaved && summaryData.hoursOfITSaved > 0 ? (
                  <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-2 text-xs">
                      <Clock className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span className="text-muted-foreground">
                        Sua equipe de TI economizou <strong className="text-emerald-500">{Math.round(summaryData.hoursOfITSaved)}h</strong> de trabalho manual este mês
                      </span>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* === ROW 3: Compliance + Automation Performance === */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Compliance - Business language */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.14 }}>
            <Card className="h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Conformidade Regulatória
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

          {/* Automation effectiveness - what the system is doing */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.18 }}>
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Eficiência da Proteção Automática
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Today */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Hoje</p>
                  <div className="grid grid-cols-3 gap-2">
                    <MiniStat label="Verificações" value={summaryData?.totalJobsToday || 0} color="text-foreground" />
                    <MiniStat label="Concluídas" value={summaryData?.completedJobsToday || 0} color="text-green-500" />
                    <MiniStat label="Com problema" value={summaryData?.failedJobsToday || 0} color="text-red-500" />
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

                {/* 30 days */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Últimos 30 dias</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-center p-2.5 rounded-lg bg-muted/30 border border-border/40">
                      <p className="text-lg font-bold text-foreground">{summaryData?.automatedJobsCompleted || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Tarefas executadas<br/>com sucesso</p>
                    </div>
                    <div className="text-center p-2.5 rounded-lg bg-muted/30 border border-border/40">
                      <p className="text-lg font-bold text-foreground">{summaryData?.totalJobs30d || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Total de<br/>verificações</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground">Confiabilidade do sistema</span>
                      {(() => {
                        const rate = summaryData?.totalJobs30d ? Math.round((summaryData.automatedJobsCompleted / summaryData.totalJobs30d) * 100) : 0;
                        return <span className={cn("text-xs font-bold", rate >= 80 ? "text-green-500" : rate >= 50 ? "text-amber-500" : "text-red-500")}>{rate}%</span>;
                      })()}
                    </div>
                    <Progress value={summaryData?.totalJobs30d ? Math.round((summaryData.automatedJobsCompleted / summaryData.totalJobs30d) * 100) : 0} className="h-1.5" />
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
                  <CardTitle className="text-sm font-semibold">O que precisa da sua atenção</CardTitle>
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
                    <p className="text-sm font-medium text-green-500">Tudo sob controle</p>
                    <p className="text-xs text-muted-foreground">O CyberShield está cuidando da segurança da sua empresa automaticamente</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Navigation */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <NavButton to="/admin/dashboard" icon={<Activity className="h-5 w-5" />} label="Monitoramento" />
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

function ActionRow({ icon, label, count, description, tooltip }: { icon: React.ReactNode; label: string; count: number; description: string; tooltip?: string }) {
  const content = (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/30 last:border-0">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium truncate">{label}</span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-2 shrink-0">{count}x</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">{description}</p>
      </div>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">{content}</div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function ImpactRow({ label, count, value, icon, unitCost }: { label: string; count: number; value: number; icon: React.ReactNode; unitCost?: string }) {
  if (value === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0 cursor-help">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {icon}
            <span className="text-xs">{label}</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1">{count}x</Badge>
          </div>
          <span className="text-xs font-semibold text-emerald-500">{formatCurrency(value)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        <p className="font-semibold mb-0.5">Cálculo: {count} × {unitCost || '—'}</p>
        <p className="text-muted-foreground">= {formatCurrency(value)} em custos evitados</p>
      </TooltipContent>
    </Tooltip>
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
