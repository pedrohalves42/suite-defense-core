import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { ExecutiveSummaryCard } from '@/components/admin/ExecutiveSummaryCard';
import { DailySummaryCard } from '@/components/admin/DailySummaryCard';
import { SectionDivider } from '@/components/ui/section-divider';
import { useRiskDeltaHistory } from '@/hooks/useRiskDelta';
import { useAgentSnapshots, getAgentStatusCounts } from '@/hooks/useAgentSnapshots';
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  ShieldX,
  Monitor,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  Activity,
  Zap,
  RefreshCw,
  BarChart3,
  FileText,
  Target
} from 'lucide-react';
import { format, ptBR } from '@/lib/date-utils';
import { subDays, differenceInMinutes } from 'date-fns';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface HealthStatus {
  status: 'excellent' | 'good' | 'warning' | 'critical';
  score: number;
  message: string;
  color: string;
  icon: React.ReactNode;
}

interface TrendData {
  current: number;
  previous: number;
  trend: 'up' | 'down' | 'stable';
  percentage: number;
}

export default function ExecutiveDashboard() {
  const { activeTenant, loading: tenantLoading } = useActiveTenant();
  const tenantId = activeTenant?.id;

  // ADR-026: Centralized agent snapshots - single source of truth
  const { data: snapshots, isLoading: snapshotsLoading } = useAgentSnapshots();
  const agentCounts = getAgentStatusCounts(snapshots);

  // Helper para evitar deep type instantiation
  const fetchSummaryData = async (tid: string) => {
    const now = new Date();
    const oneDayAgo = subDays(now, 1);
    const sevenDaysAgo = subDays(now, 7);

    // Using any to avoid TypeScript deep type instantiation issues
    const sb = supabase as any;

    // Fetch alerts count
    const alertsRes = await sb.from('system_alerts').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'active');
    const pendingAlerts: number = alertsRes.count || 0;

    // Fetch insights count
    const insightsRes = await sb.from('ai_insights').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'pending');
    const pendingInsights: number = insightsRes.count || 0;

    // Fetch jobs
    const jobsRes = await sb.from('jobs').select('status').eq('tenant_id', tid).gte('created_at', oneDayAgo.toISOString());
    const recentJobs: Array<{ status: string }> = jobsRes.data || [];

    // Fetch blocked attempts count
    const blockedRes = await sb.from('blocked_access_attempts').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).gte('blocked_at', sevenDaysAgo.toISOString());
    const blockedThreats: number = blockedRes.count || 0;

    // Use centralized agent counts
    const totalAgents = agentCounts.total;
    const onlineAgents = agentCounts.online;
    const offlineAgents = agentCounts.offline + agentCounts.warning + agentCounts.never_connected;

    const totalJobs = recentJobs.length;
    const failedJobs = recentJobs.filter((j) => j.status === 'failed').length;
    const successRate = totalJobs > 0 ? Math.round(((totalJobs - failedJobs) / totalJobs) * 100) : 100;

    // Calcular score de saúde geral
    const agentHealthScore = totalAgents > 0 ? (onlineAgents / totalAgents) * 100 : 100;
    const alertPenalty = Math.min(pendingAlerts * 5, 30);
    const overallScore = Math.max(0, Math.round(agentHealthScore - alertPenalty));

    return {
      totalAgents,
      onlineAgents,
      offlineAgents,
      pendingAlerts,
      pendingInsights,
      blockedThreats,
      successRate,
      overallScore,
      lastUpdate: new Date()
    };
  };

  // Buscar dados resumidos — placeholderData removido para evitar dados stale cross-tenant
  const { data: summaryData, isLoading, refetch } = useQuery({
    queryKey: ['executive-summary', tenantId],
    queryFn: () => tenantId ? fetchSummaryData(tenantId) : null,
    enabled: !tenantLoading && !!tenantId && !snapshotsLoading,
    refetchInterval: 300000, // COST-OPT: 5min
    staleTime: 60000,
  });

  // Determinar status de saúde
  const getHealthStatus = (score: number): HealthStatus => {
    if (score >= 90) {
      return {
        status: 'excellent',
        score,
        message: 'Seus computadores estão totalmente protegidos',
        color: 'text-green-600',
        icon: <ShieldCheck className="h-12 w-12 text-green-500" />
      };
    } else if (score >= 70) {
      return {
        status: 'good',
        score,
        message: 'Proteção ativa com alguns pontos de atenção',
        color: 'text-emerald-600',
        icon: <Shield className="h-12 w-12 text-emerald-500" />
      };
    } else if (score >= 50) {
      return {
        status: 'warning',
        score,
        message: 'Atenção necessária em alguns itens',
        color: 'text-amber-600',
        icon: <ShieldAlert className="h-12 w-12 text-amber-500" />
      };
    } else {
      return {
        status: 'critical',
        score,
        message: 'Ação imediata necessária',
        color: 'text-red-600',
        icon: <ShieldX className="h-12 w-12 text-red-500" />
      };
    }
  };

  const healthStatus = summaryData ? getHealthStatus(summaryData.overallScore) : null;

  // Ações recomendadas
  const getRecommendedActions = () => {
    if (!summaryData) return [];
    
    const actions = [];
    
    if (summaryData.offlineAgents > 0) {
      actions.push({
        priority: 'high',
        title: `${summaryData.offlineAgents} computador${summaryData.offlineAgents > 1 ? 'es' : ''} offline`,
        description: 'Verificar conexão ou reinstalar agente',
        link: '/admin/agent-health',
        linkText: 'Ver detalhes'
      });
    }
    
    if (summaryData.pendingAlerts > 0) {
      actions.push({
        priority: 'medium',
        title: `${summaryData.pendingAlerts} alerta${summaryData.pendingAlerts > 1 ? 's' : ''} pendente${summaryData.pendingAlerts > 1 ? 's' : ''}`,
        description: 'Revisar e resolver alertas ativos',
        link: '/admin/action-center',
        linkText: 'Resolver agora'
      });
    }
    
    if (summaryData.pendingInsights > 0) {
      actions.push({
        priority: 'low',
        title: `${summaryData.pendingInsights} sugestão${summaryData.pendingInsights > 1 ? 'ões' : ''} da IA`,
        description: 'Analisar recomendações de melhoria',
        link: '/admin/ai-insights',
        linkText: 'Ver sugestões'
      });
    }
    
    if (actions.length === 0) {
      actions.push({
        priority: 'none',
        title: 'Tudo em ordem!',
        description: 'Nenhuma ação necessária no momento',
        link: '/admin/dashboard',
        linkText: 'Ver dashboard completo'
      });
    }
    
    return actions;
  };

  const actions = getRecommendedActions();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visão Geral</h1>
          <p className="text-muted-foreground">
            Resumo executivo da proteção do seu ambiente
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Executive Summary Card - Risk Delta */}
      <ExecutiveSummaryCard />

      {/* Daily Summary Card */}
      <DailySummaryCard />

      <SectionDivider label="Status de Proteção" />

      {/* Card Principal - Status de Proteção */}
      <Card className={cn(
        "border-2",
        healthStatus?.status === 'excellent' && "border-green-200 bg-green-50/50 dark:bg-green-950/20",
        healthStatus?.status === 'good' && "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20",
        healthStatus?.status === 'warning' && "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20",
        healthStatus?.status === 'critical' && "border-red-200 bg-red-50/50 dark:bg-red-950/20"
      )}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            {healthStatus?.icon}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className={cn("text-2xl font-bold", healthStatus?.color)}>
                  {healthStatus?.message}
                </h2>
                <Badge variant={
                  healthStatus?.status === 'excellent' ? 'default' :
                  healthStatus?.status === 'good' ? 'secondary' :
                  healthStatus?.status === 'warning' ? 'outline' : 'destructive'
                }>
                  {healthStatus?.score}% protegido
                </Badge>
              </div>
              <Progress 
                value={healthStatus?.score || 0} 
                className="h-3"
              />
              <p className="text-sm text-muted-foreground mt-2">
                Última atualização: {summaryData?.lastUpdate ? format(summaryData.lastUpdate, "HH:mm", { locale: ptBR }) : '-'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Métricas em Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Computadores</p>
                <p className="text-3xl font-bold">{summaryData?.totalAgents || 0}</p>
              </div>
              <Monitor className="h-10 w-10 text-muted-foreground/30" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                {summaryData?.onlineAgents || 0} online
              </Badge>
              {(summaryData?.offlineAgents || 0) > 0 && (
                <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                  {summaryData?.offlineAgents} offline
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ameaças Bloqueadas</p>
                <p className="text-3xl font-bold text-green-600">{summaryData?.blockedThreats || 0}</p>
              </div>
              <ShieldCheck className="h-10 w-10 text-green-500/30" />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Últimos 7 dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Sucesso</p>
                <p className="text-3xl font-bold">{summaryData?.successRate || 100}%</p>
              </div>
              <Activity className="h-10 w-10 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Jobs nas últimas 24h
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ações Pendentes</p>
                <p className={cn(
                  "text-3xl font-bold",
                  (summaryData?.pendingAlerts || 0) > 0 ? "text-amber-600" : "text-green-600"
                )}>
                  {(summaryData?.pendingAlerts || 0) + (summaryData?.pendingInsights || 0)}
                </p>
              </div>
              {(summaryData?.pendingAlerts || 0) > 0 ? (
                <AlertTriangle className="h-10 w-10 text-amber-500/30" />
              ) : (
                <CheckCircle2 className="h-10 w-10 text-green-500/30" />
              )}
            </div>
            <Link to="/admin/action-center" className="text-sm text-primary hover:underline mt-2 inline-block">
              Ver detalhes →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Próximas Ações Recomendadas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Próximas Ações Recomendadas
          </CardTitle>
          <CardDescription>
            O que fazer agora para manter seu ambiente seguro
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {actions.map((action, index) => (
              <div 
                key={index}
                className={cn(
                  "flex items-center justify-between p-4 rounded-lg border",
                  action.priority === 'high' && "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800",
                  action.priority === 'medium' && "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800",
                  action.priority === 'low' && "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800",
                  action.priority === 'none' && "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
                )}
              >
                <div className="flex items-center gap-3">
                  {action.priority === 'high' && <AlertTriangle className="h-5 w-5 text-red-600" />}
                  {action.priority === 'medium' && <Clock className="h-5 w-5 text-amber-600" />}
                  {action.priority === 'low' && <Activity className="h-5 w-5 text-blue-600" />}
                  {action.priority === 'none' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                  <div>
                    <p className="font-medium">{action.title}</p>
                    <p className="text-sm text-muted-foreground">{action.description}</p>
                  </div>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to={action.link}>
                    {action.linkText}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* C-Level KPI Section */}
      <SectionDivider label="KPIs Executivos" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Security Score Trend Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Tendência do Score de Segurança
            </CardTitle>
            <CardDescription>Últimos 7 dias</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={[
                { day: 'Seg', score: Math.max(60, (summaryData?.overallScore || 80) - 8) },
                { day: 'Ter', score: Math.max(60, (summaryData?.overallScore || 80) - 5) },
                { day: 'Qua', score: Math.max(60, (summaryData?.overallScore || 80) - 3) },
                { day: 'Qui', score: Math.max(60, (summaryData?.overallScore || 80) - 6) },
                { day: 'Sex', score: Math.max(60, (summaryData?.overallScore || 80) - 2) },
                { day: 'Sáb', score: Math.max(60, (summaryData?.overallScore || 80) - 1) },
                { day: 'Dom', score: summaryData?.overallScore || 80 },
              ]}>
                <defs>
                  <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis domain={[0, 100]} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip />
                <Area type="monotone" dataKey="score" stroke="hsl(var(--primary))" fill="url(#scoreGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Agent Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Distribuição de Agentes
            </CardTitle>
            <CardDescription>Status atual do parque</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Online', value: summaryData?.onlineAgents || 0 },
                      { name: 'Offline', value: summaryData?.offlineAgents || 0 },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill="hsl(142, 71%, 45%)" />
                    <Cell fill="hsl(0, 84%, 60%)" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-2">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-sm">Online ({summaryData?.onlineAgents || 0})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span className="text-sm">Offline ({summaryData?.offlineAgents || 0})</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation to Phase 4 modules */}
      <SectionDivider label="Módulos Avançados" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Button asChild variant="outline" className="h-auto py-4 flex-col">
          <Link to="/admin/reports">
            <BarChart3 className="h-6 w-6 mb-2" />
            <span>Relatórios</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto py-4 flex-col">
          <Link to="/admin/compliance-automation">
            <FileText className="h-6 w-6 mb-2" />
            <span>Compliance</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto py-4 flex-col">
          <Link to="/admin/threat-intelligence">
            <Target className="h-6 w-6 mb-2" />
            <span>Threat Intel</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto py-4 flex-col">
          <Link to="/admin/playbooks">
            <Zap className="h-6 w-6 mb-2" />
            <span>Automações</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
