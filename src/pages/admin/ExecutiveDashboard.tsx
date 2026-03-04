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

// === Modelo de custo conservador para PMEs brasileiras (2025-2026) ===
// Fontes: CERT.br, mercado local de suporte TI para pequenas empresas
// Valores calibrados para operações de 1-50 máquinas
const COST_MODEL = {
  security_event_critical: 500,   // Incidente crítico contido (ex: ransomware bloqueado)
  security_event_high: 200,       // Ameaça alta neutralizada
  security_event_medium: 60,      // Alerta médio tratado automaticamente
  auto_repair: 45,                // Chamado técnico remoto evitado
  auto_recovery: 150,             // Restauração de serviço sem visita
  policy_drift: 60,               // Correção de conformidade automática
  blocked_access: 120,            // Tentativa de acesso indevido bloqueada
  firewall_enforcement: 40,       // Regra de firewall aplicada
  agent_offline_per_hour: 25,     // Custo por hora de máquina desprotegida
};

export default function ExecutiveDashboard() {
  const { activeTenant, loading: tenantLoading } = useActiveTenant();
  const tenantId = activeTenant?.id;

  const { data: snapshots, isLoading: snapshotsLoading } = useAgentSnapshots();
  const agentCounts = getAgentStatusCounts(snapshots);
  const { data: riskDelta } = useTodayRiskDelta();

  const { data: summaryData, isLoading, refetch } = useQuery({
    queryKey: ['executive-summary-v3', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const now = new Date();
      const today = new Date(now); today.setHours(0,0,0,0);
      const todayISO = today.toISOString();
      const sevenDaysAgo = subDays(now, 7).toISOString();
      const thirtyDaysAgo = subDays(now, 30).toISOString();

      const sb = supabase as any;

      const [alertsRes, jobsTodayRes, jobs30dRes, blockedRes, evidence7dRes, evidence30dRes, complianceRes] = await Promise.all([
        sb.from('system_alerts').select('severity, status', { count: 'exact' }).eq('tenant_id', tenantId),
        sb.from('jobs').select('status, type').eq('tenant_id', tenantId).gte('created_at', todayISO),
        sb.from('jobs').select('status, type').eq('tenant_id', tenantId).gte('created_at', thirtyDaysAgo),
        sb.from('blocked_access_attempts').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('attempted_at', sevenDaysAgo),
        sb.from('agent_evidence_logs').select('event_type, severity').eq('tenant_id', tenantId).gte('created_at', sevenDaysAgo),
        sb.from('agent_evidence_logs').select('event_type, severity').eq('tenant_id', tenantId).gte('created_at', thirtyDaysAgo),
        sb.from('compliance_snapshots').select('overall_score, grade, category_scores, calculated_at').eq('tenant_id', tenantId).order('calculated_at', { ascending: false }).limit(1),
      ]);

      const alerts: Array<{ severity: string; status: string }> = alertsRes.data || [];
      const unresolvedStatuses = ['active', 'open', 'pending'];
      const activeAlerts = alerts.filter(a => unresolvedStatuses.includes(a.status)).length;
      const criticalAlerts = alerts.filter(a => a.severity === 'critical' && unresolvedStatuses.includes(a.status)).length;

      const jobsToday: Array<{ status: string; job_type: string }> = jobsTodayRes.data || [];
      const jobs30d: Array<{ status: string; job_type: string }> = jobs30dRes.data || [];
      const blockedThreats: number = blockedRes.count || 0;

      const evidence7d: Array<{ event_type: string; severity: string }> = evidence7dRes.data || [];
      const evidence30d: Array<{ event_type: string; severity: string }> = evidence30dRes.data || [];
      const compliance = complianceRes.data?.[0] || null;

      // NOTA: NÃO usar agentCounts aqui dentro do queryFn!
      // agentCounts vem de useAgentSnapshots (closure stale durante troca de tenant)
      // Os valores de totalAgents/onlineAgents são calculados no render usando agentCounts fresco.

      // === O que o sistema FEZ pela empresa (30 dias) ===
      // IMPORTANTE: Filtra apenas ações REAIS (severity >= warning).
      // Eventos com severity 'info'/'debug' são detecções de rotina repetidas
      // (ex: mesmo software não-autorizado detectado a cada hora) e NÃO representam
      // ações concretas que evitariam um chamado técnico.
      const actions30d = {
        auto_repairs: evidence30d.filter(e => e.event_type === 'auto_repair' && e.severity !== 'info' && e.severity !== 'debug').length,
        auto_detections: evidence30d.filter(e => e.event_type === 'auto_repair' && (e.severity === 'info' || e.severity === 'debug')).length,
        auto_recoveries: evidence30d.filter(e => e.event_type === 'auto_recovery' && e.severity !== 'info' && e.severity !== 'debug').length,
        critical_prevented: evidence30d.filter(e => e.event_type === 'security_event' && e.severity === 'critical').length,
        high_prevented: evidence30d.filter(e => e.event_type === 'security_event' && (e.severity === 'error' || e.severity === 'high')).length,
        medium_prevented: evidence30d.filter(e => e.event_type === 'security_event' && e.severity === 'warning').length,
        policy_corrections: evidence30d.filter(e => e.event_type === 'policy_drift').length,
        blocked_access: blockedThreats,
        total_events: evidence30d.filter(e => e.severity !== 'info' && e.severity !== 'debug').length,
      };

      // Ações automáticas que evitaram trabalho manual (apenas ações reais)
      const automatedActions = actions30d.auto_repairs + actions30d.auto_recoveries + actions30d.policy_corrections;
      // Incidentes que foram contidos sem intervenção humana
      const incidentsContained = actions30d.critical_prevented + actions30d.high_prevented + actions30d.medium_prevented;
      
      // Horas de TI economizadas (estimativa conservadora)
      // auto_repair real (warning+): 0.5h, recovery: 1h, policy: 0.25h, critical: 2h
      const hoursOfITSaved = 
        (actions30d.auto_repairs * 0.5) + 
        (actions30d.auto_recoveries * 1) + 
        (actions30d.policy_corrections * 0.25) +
        (actions30d.critical_prevented * 2);

      // Jobs completados automaticamente pelo sistema (não pelo humano)
      const automatedJobsCompleted = jobs30d.filter(j => j.status === 'completed').length;
      const totalJobs30d = jobs30d.length;

      // === Impacto financeiro ===
      const financialImpact = {
        autoRepairs: actions30d.auto_repairs * COST_MODEL.auto_repair,
        autoRecoveries: actions30d.auto_recoveries * COST_MODEL.auto_recovery,
        criticalPrevented: actions30d.critical_prevented * COST_MODEL.security_event_critical,
        highPrevented: actions30d.high_prevented * COST_MODEL.security_event_high,
        policyCorrections: actions30d.policy_corrections * COST_MODEL.policy_drift,
        blockedAccess: blockedThreats * COST_MODEL.blocked_access,
      };
      const totalCostAvoided = Object.values(financialImpact).reduce((a, b) => a + b, 0);

      // 7-day activity for sparkline
      const events7d = {
        critical: evidence7d.filter(e => e.severity === 'critical').length,
        high: evidence7d.filter(e => e.severity === 'error' || e.severity === 'high').length,
        warning: evidence7d.filter(e => e.severity === 'warning').length,
        info: evidence7d.filter(e => e.severity === 'info' || e.severity === 'debug').length,
      };

      // Protection coverage e overall score são calculados no render (fora do queryFn)

      // Jobs today
      const successRateToday = jobsToday.length > 0 ? Math.round((jobsToday.filter(j => j.status === 'completed').length / jobsToday.length) * 100) : 100;

      return {
        activeAlerts, criticalAlerts, blockedThreats,
        actions30d, automatedActions, incidentsContained, hoursOfITSaved,
        automatedJobsCompleted, totalJobs30d,
        financialImpact, totalCostAvoided,
        events7d, compliance,
        successRateToday,
        totalJobsToday: jobsToday.length,
        completedJobsToday: jobsToday.filter(j => j.status === 'completed').length,
        failedJobsToday: jobsToday.filter(j => j.status === 'failed').length,
        lastUpdate: new Date()
      };
    },
    enabled: !tenantLoading && !!tenantId && !snapshotsLoading,
    refetchInterval: 60000,
    staleTime: 15000,
  });

  // Compute agent-dependent values at RENDER TIME using fresh agentCounts
  // (not inside queryFn where agentCounts would be a stale closure)
  const totalAgents = agentCounts.total;
  const onlineAgents = agentCounts.online;
  const offlineAgents = agentCounts.offline + agentCounts.warning + agentCounts.never_connected;
  const protectionCoverage = totalAgents > 0 ? Math.round((onlineAgents / totalAgents) * 100) : 0;
  const agentHealthScore = totalAgents > 0 ? (onlineAgents / totalAgents) * 100 : 100;
  const alertPenalty = Math.min((summaryData?.activeAlerts || 0) * 5, 30);
  const overallScore = Math.max(0, Math.round(agentHealthScore - alertPenalty));

  const getHealthStatus = (score: number) => {
    if (score >= 90) return { status: 'excellent' as const, message: 'Sua empresa está protegida', color: 'text-green-500', bgClass: 'border-green-500/20 bg-green-500/5' };
    if (score >= 70) return { status: 'good' as const, message: 'Proteção ativa na sua empresa', color: 'text-emerald-500', bgClass: 'border-emerald-500/20 bg-emerald-500/5' };
    if (score >= 50) return { status: 'warning' as const, message: 'Sua empresa precisa de atenção', color: 'text-amber-500', bgClass: 'border-amber-500/20 bg-amber-500/5' };
    return { status: 'critical' as const, message: 'Risco elevado para sua empresa', color: 'text-red-500', bgClass: 'border-red-500/20 bg-red-500/5' };
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
                      {overallScore}%
                    </Badge>
                    {agentCounts.online > 0 && (
                      <Badge variant="outline" className="gap-1 text-[10px] border-green-500/30 text-green-500">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
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
                <MetricTile icon={<Laptop className="h-3.5 w-3.5" />} label="Computadores" value={`${agentCounts.online}/${agentCounts.total}`} sub="protegidos" color="green" pulse={agentCounts.online > 0} />
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
            <Card className="h-full border-blue-500/15 bg-blue-500/[0.02]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-blue-500" />
                  O que fizemos pela sua empresa (30 dias)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Big numbers - business impact */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-2xl font-bold text-blue-500">{summaryData?.automatedActions || 0}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Problemas corrigidos<br/>automaticamente</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-2xl font-bold text-red-500">{summaryData?.incidentsContained || 0}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Incidentes de segurança<br/>contidos</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-2xl font-bold text-amber-500">{summaryData?.hoursOfITSaved ? Math.round(summaryData.hoursOfITSaved) : 0}h</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Horas de TI<br/>economizadas</p>
                  </div>
                </div>

                {/* Detailed breakdown - friendly language */}
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Detalhamento</p>
                  <ActionRow icon={<Wrench className="h-3 w-3 text-blue-400" />} label="Problemas corrigidos automaticamente" count={summaryData?.actions30d.auto_repairs || 0} description="Falhas detectadas e resolvidas sem intervenção" />
                  <ActionRow icon={<RefreshCw className="h-3 w-3 text-emerald-400" />} label="Serviços restaurados" count={summaryData?.actions30d.auto_recoveries || 0} description="Recuperação automática sem downtime" />
                  <ActionRow icon={<Flame className="h-3 w-3 text-red-400" />} label="Ameaças críticas neutralizadas" count={summaryData?.actions30d.critical_prevented || 0} description="Incidentes graves bloqueados pelo sistema" />
                  <ActionRow icon={<Bug className="h-3 w-3 text-orange-400" />} label="Riscos de segurança contidos" count={summaryData?.actions30d.high_prevented || 0} description="Vulnerabilidades identificadas e tratadas" />
                  <ActionRow icon={<Lock className="h-3 w-3 text-amber-400" />} label="Políticas de segurança realinhadas" count={summaryData?.actions30d.policy_corrections || 0} description="Desvios de conformidade corrigidos" />
                  <ActionRow icon={<ShieldBan className="h-3 w-3 text-purple-400" />} label="Acessos não autorizados bloqueados" count={summaryData?.blockedThreats || 0} description="Tentativas barradas nos últimos 7 dias" />
                  {(summaryData?.actions30d.auto_detections || 0) > 0 && (
                    <div className="pt-1.5 mt-1.5 border-t border-border/30">
                      <ActionRow icon={<Eye className="h-3 w-3 text-muted-foreground" />} label="Verificações de rotina realizadas" count={summaryData?.actions30d.auto_detections || 0} description="Monitoramento contínuo (não contabilizado como ação)" />
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
                        <li>• Acesso indevido bloqueado: R$ 120</li>
                      </ul>
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
                      <ImpactRow label="Chamados técnicos evitados" count={summaryData.actions30d.auto_repairs} value={summaryData.financialImpact.autoRepairs} icon={<Wrench className="h-3 w-3" />} />
                      <ImpactRow label="Downtime evitado" count={summaryData.actions30d.auto_recoveries} value={summaryData.financialImpact.autoRecoveries} icon={<RefreshCw className="h-3 w-3" />} />
                      <ImpactRow label="Crises de segurança evitadas" count={summaryData.actions30d.critical_prevented} value={summaryData.financialImpact.criticalPrevented} icon={<Siren className="h-3 w-3" />} />
                      <ImpactRow label="Investigações evitadas" count={summaryData.actions30d.high_prevented} value={summaryData.financialImpact.highPrevented} icon={<Bug className="h-3 w-3" />} />
                      <ImpactRow label="Retrabalho de compliance evitado" count={summaryData.actions30d.policy_corrections} value={summaryData.financialImpact.policyCorrections} icon={<Lock className="h-3 w-3" />} />
                      <ImpactRow label="Prejuízo de acessos indevidos" count={summaryData.blockedThreats} value={summaryData.financialImpact.blockedAccess} icon={<ShieldBan className="h-3 w-3" />} />
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

function ActionRow({ icon, label, count, description }: { icon: React.ReactNode; label: string; count: number; description: string }) {
  return (
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
}

function ImpactRow({ label, count, value, icon }: { label: string; count: number; value: number; icon: React.ReactNode }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
        <Badge variant="secondary" className="text-[10px] h-4 px-1">{count}x</Badge>
      </div>
      <span className="text-xs font-semibold text-emerald-500">{formatCurrency(value)}</span>
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
