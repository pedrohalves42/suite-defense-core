import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ShieldCheck, ShieldAlert, ShieldX, Shield,
  AlertTriangle, CheckCircle2, ArrowRight, XCircle,
  Activity, Zap, RefreshCw, CalendarDays, BarChart3, FileText,
  Building2, Laptop, ShieldBan, Hammer, FileCheck,
  TrendingDown, TrendingUp, Minus,
} from 'lucide-react';
import { format, ptBR } from '@/lib/date-utils';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

import { MetricTile } from './components/MetricTile';
import { NavButton } from './components/NavButton';
import { ActionsCard } from './components/ActionsCard';
import { FinancialCard } from './components/FinancialCard';
import { ComplianceAutomationRow } from './components/ComplianceAutomationRow';
import { getHealthStatus } from './utils';
import { useExecutiveDashboard } from './useExecutiveDashboard';

export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const {
    isLoading, refetch, totalAgents, onlineAgents, offlineAgents,
    overallScore, summaryData, deltaInfo, formatCurrency,
  } = useExecutiveDashboard();

  const healthStatus = summaryData ? getHealthStatus(overallScore) : null;
  const DeltaIcon = deltaInfo.icon === 'down' ? TrendingDown : deltaInfo.icon === 'up' ? TrendingUp : Minus;

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
            <p className="text-sm text-muted-foreground">O que o CyberShield está fazendo pela sua organização</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground hidden md:inline">
              Atualizado: {summaryData?.lastUpdate ? format(summaryData.lastUpdate, "HH:mm") : '--:--'}
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />Atualizar
            </Button>
          </div>
        </div>

        {/* HERO: Protection Status */}
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
                    <Badge variant="outline" className="text-[10px] font-medium">{overallScore}%</Badge>
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
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <MetricTile icon={<Laptop className="h-3.5 w-3.5" />} label="Computadores" value={`${onlineAgents}/${totalAgents}`} sub="protegidos" color="green" pulse={onlineAgents > 0} onClick={() => navigate('/admin/agent-center')} />
                <MetricTile icon={<ShieldBan className="h-3.5 w-3.5" />} label="Ameaças Bloqueadas" value={`${summaryData?.blockedThreats || 0}`} sub="últimos 7 dias" color={summaryData?.blockedThreats ? 'green' : 'muted'} onClick={() => navigate('/admin/threat-center')} />
                <MetricTile icon={<DeltaIcon className="h-3.5 w-3.5" />} label="Nível de Risco" value={deltaInfo.label} sub={deltaInfo.description} color={deltaInfo.color === 'green' ? 'green' : deltaInfo.color === 'red' ? 'red' : 'muted'} onClick={() => navigate('/admin/vulnerability-center')} />
                <MetricTile icon={<Hammer className="h-3.5 w-3.5" />} label="Correções Automáticas" value={`${summaryData?.automatedActions || 0}`} sub="últimos 30 dias" color={summaryData?.automatedActions ? 'emerald' : 'muted'} onClick={() => navigate('/admin/intelligence-hub?tab=automation')} />
                <MetricTile icon={<FileCheck className="h-3.5 w-3.5" />} label="Conformidade" value={summaryData?.compliance?.grade || 'Pendente'} sub={summaryData?.compliance ? `Score: ${summaryData.compliance.overall_score}/100` : 'Clique para avaliar'} color={summaryData?.compliance?.overall_score >= 80 ? 'green' : summaryData?.compliance?.overall_score >= 60 ? 'amber' : 'muted'} onClick={() => navigate('/admin/compliance-hub')} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ROW 2: Actions + Financial */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.06 }}>
            <ActionsCard summaryData={summaryData} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }}>
            <FinancialCard summaryData={summaryData} />
          </motion.div>
        </div>

        {/* ROW 3: Compliance + Automation */}
        <ComplianceAutomationRow summaryData={summaryData} overallScore={overallScore} />

        {/* ROW 4: Actions */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.22 }}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">O que precisa da sua atenção</CardTitle>
                <span className="text-[11px] text-muted-foreground">
                  {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {actions.length > 0 ? (
                <div className="space-y-2">
                  {actions.map((action, idx) => (
                    <Link key={idx} to={action.link}
                      className={cn("flex items-center justify-between p-3 rounded-xl border transition-colors hover:bg-muted/50",
                        action.priority === 'high' && "border-destructive/20 bg-destructive/5",
                        action.priority === 'medium' && "border-warning/20 bg-warning/5",
                      )}>
                      <div className="flex items-center gap-2.5">
                        {action.priority === 'high' ? <XCircle className="h-4 w-4 text-destructive shrink-0" /> : <AlertTriangle className="h-4 w-4 text-warning shrink-0" />}
                        <span className="text-sm font-medium">{action.title}</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-success/20 bg-success/5">
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-success">Tudo sob controle</p>
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
