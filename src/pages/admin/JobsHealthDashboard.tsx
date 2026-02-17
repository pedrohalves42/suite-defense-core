import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Activity, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  RefreshCw, 
  TrendingUp,
  Timer,
  Inbox,
  XCircle,
  PauseCircle,
  ArrowUpCircle,
  PieChart,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useJobsHealth } from '@/hooks/useJobsHealth';
import { JobMetricsByTypeTable } from '@/components/admin/jobs/JobMetricsByTypeTable';
import { JobsTrendChart } from '@/components/admin/jobs/JobsTrendChart';
import { StuckJobsAlert } from '@/components/admin/jobs/StuckJobsAlert';
import { JobAnomaliesCard } from '@/components/admin/jobs/JobAnomaliesCard';
import { JobSLOStatusCard } from '@/components/admin/jobs/JobSLOStatusCard';
import { calculateRealSuccessRate } from '@/components/admin/JobStatusSimplified';
import { SectionDivider } from '@/components/ui/section-divider';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

function KPICard({ 
  title, 
  value, 
  icon: Icon, 
  color, 
  subtitle,
  isLoading 
}: { 
  title: string; 
  value: string | number; 
  icon: any;
  color: 'success' | 'warning' | 'error' | 'info' | 'muted';
  subtitle?: string;
  isLoading?: boolean;
}) {
  const colorClasses = {
    success: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
    warning: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30',
    error: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
    info: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
    muted: 'text-muted-foreground bg-muted',
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className={cn("p-3 rounded-lg", colorClasses[color])}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function JobsHealthDashboard() {
  const { summary, metrics, trends, stuckJobs, pausedAgents, outdatedAgents, failureBreakdown, isLoading, refetch } = useJobsHealth();

  const getSuccessRateColor = (rate: number): 'success' | 'warning' | 'error' => {
    if (rate >= 90) return 'success';
    if (rate >= 70) return 'warning';
    return 'error';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-8 w-8" />
            Saúde dos Jobs
          </h2>
          <p className="text-muted-foreground">
            Visão consolidada da execução de tarefas nas últimas 24 horas
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => refetch()}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Stuck Jobs Alert */}
      <StuckJobsAlert stuckJobs={stuckJobs} onRefresh={refetch} />

      {/* SLO & Health Status */}
      <SectionDivider label="Estado do Sistema" />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <JobAnomaliesCard />
        <JobSLOStatusCard />
      </div>

      <SectionDivider label="Métricas de Performance" />

      {/* KPI Cards */}
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <KPICard
          title="Taxa de Sucesso"
          value={`${summary.overallSuccessRate}%`}
          icon={TrendingUp}
          color={getSuccessRateColor(summary.overallSuccessRate)}
          subtitle="Últimas 24h"
          isLoading={isLoading}
        />
        <KPICard
          title="Jobs Concluídos"
          value={summary.completedJobs}
          icon={CheckCircle}
          color="success"
          subtitle={`de ${summary.totalJobs} total`}
          isLoading={isLoading}
        />
        <KPICard
          title="Em Execução"
          value={summary.executingJobs}
          icon={Clock}
          color="info"
          subtitle="Jobs entregues"
          isLoading={isLoading}
        />
        <KPICard
          title="Travados"
          value={summary.stuckJobs}
          icon={AlertTriangle}
          color={summary.stuckJobs > 0 ? 'error' : 'muted'}
          subtitle="> 1 hora sem resposta"
          isLoading={isLoading}
        />
      </motion.div>

      {/* Secondary KPIs */}
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <KPICard
          title="Tempo Médio de Execução"
          value={`${summary.avgExecutionSeconds}s`}
          icon={Timer}
          color="info"
          isLoading={isLoading}
        />
        <KPICard
          title="Jobs na Fila"
          value={summary.queuedJobs}
          icon={Inbox}
          color="muted"
          isLoading={isLoading}
        />
        <KPICard
          title="Jobs com Falha"
          value={summary.failedJobs}
          icon={XCircle}
          color={summary.failedJobs > 0 ? 'warning' : 'muted'}
          isLoading={isLoading}
        />
      </motion.div>

      {/* Operational Visibility - Fase 5 */}
      <SectionDivider label="Visibilidade Operacional" />
      
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        {/* Paused Agents */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PauseCircle className="h-5 w-5 text-yellow-500" />
              Agentes Pausados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{pausedAgents.length}</p>
            {pausedAgents.length > 0 && (
              <div className="mt-2 space-y-1">
                {pausedAgents.slice(0, 3).map(a => (
                  <TooltipProvider key={a.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-xs text-muted-foreground truncate cursor-help">
                          {a.agent_name} <Badge variant="outline" className="ml-1 text-[10px]">{a.status}</Badge>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{a.scheduling_paused_reason || 'Sem motivo especificado'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
                {pausedAgents.length > 3 && (
                  <p className="text-xs text-muted-foreground">+{pausedAgents.length - 3} mais</p>
                )}
              </div>
            )}
            {pausedAgents.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">Todos os agentes recebendo jobs</p>
            )}
          </CardContent>
        </Card>

        {/* Outdated Versions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-orange-500" />
              Versões Desatualizadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{outdatedAgents.length}</p>
            {outdatedAgents.length > 0 && (
              <div className="mt-2 space-y-1">
                {outdatedAgents.slice(0, 3).map(a => (
                  <div key={a.id} className="text-xs text-muted-foreground truncate">
                    {a.agent_name} <Badge variant="secondary" className="ml-1 text-[10px]">{a.agent_version}</Badge>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Versão atual: <span className="font-medium">{outdatedAgents.length > 0 ? outdatedAgents[0].agent_version : ''}</span> → mais recente não instalada</p>
              </div>
            )}
            {outdatedAgents.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">Todos os agentes ativos na versão mais recente</p>
            )}
          </CardContent>
        </Card>

        {/* Failure Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-5 w-5 text-red-500" />
              Causas de Falha (7d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {failureBreakdown.length > 0 ? (
              <div className="space-y-2">
                {failureBreakdown.slice(0, 5).map(fb => {
                  const total = failureBreakdown.reduce((s, f) => s + f.count, 0);
                  const pct = total > 0 ? Math.round((fb.count / total) * 100) : 0;
                  const barColor = fb.category === 'agent_offline' ? 'bg-yellow-500' 
                    : fb.category === 'ttl_exceeded' ? 'bg-orange-500'
                    : fb.category === 'zombie_stalled' ? 'bg-purple-500'
                    : fb.category === 'unknown_handler' ? 'bg-blue-500'
                    : 'bg-red-500';
                  return (
                    <div key={fb.category}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{fb.label}</span>
                        <span className="font-medium">{fb.count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma falha no período</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts and Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Tendência (24h)
              </CardTitle>
              <CardDescription>
                Volume de jobs por hora
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JobsTrendChart trends={trends} isLoading={isLoading} />
            </CardContent>
          </Card>
        </motion.div>

        {/* Status Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Resumo de Status</CardTitle>
              <CardDescription>Distribuição de jobs por estado</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { label: 'Concluídos', value: summary.completedJobs, color: 'bg-green-500', percent: summary.totalJobs > 0 ? (summary.completedJobs / summary.totalJobs) * 100 : 0 },
                  { label: 'Em Execução', value: summary.executingJobs, color: 'bg-blue-500', percent: summary.totalJobs > 0 ? (summary.executingJobs / summary.totalJobs) * 100 : 0 },
                  { label: 'Na Fila', value: summary.queuedJobs, color: 'bg-gray-400', percent: summary.totalJobs > 0 ? (summary.queuedJobs / summary.totalJobs) * 100 : 0 },
                  { label: 'Falhas', value: summary.failedJobs, color: 'bg-red-500', percent: summary.totalJobs > 0 ? (summary.failedJobs / summary.totalJobs) * 100 : 0 },
                ].map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium">{item.value}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full transition-all", item.color)}
                        style={{ width: `${Math.max(item.percent, 0)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Metrics by Type Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Métricas por Tipo de Job
            </CardTitle>
            <CardDescription>
              Detalhamento de performance por categoria de tarefa
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JobMetricsByTypeTable metrics={metrics} isLoading={isLoading} />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
