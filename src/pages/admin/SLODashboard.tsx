import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { formatBrazilDateTime } from "@/lib/date-utils";
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Server,
  Zap,
  Target,
  TrendingUp,
  Shield
} from "lucide-react";

interface SLOMetrics {
  heartbeat: {
    target: number;
    current: number;
    errorBudgetUsed: number;
    status: 'healthy' | 'warning' | 'critical';
  };
  jobExecution: {
    target: number;
    current: number;
    errorBudgetUsed: number;
    status: 'healthy' | 'warning' | 'critical';
  };
  agentUptime: {
    target: number;
    current: number;
    errorBudgetUsed: number;
    status: 'healthy' | 'warning' | 'critical';
  };
}

interface JobStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  successRate: number;
}

interface AgentStats {
  total: number;
  online: number;
  offline: number;
  pending: number;
  healthyRate: number;
}

export default function SLODashboard() {
  const { tenant, loading: tenantLoading } = useTenant();
  const tenantId = tenant?.id;
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<SLOMetrics | null>(null);
  const [jobStats, setJobStats] = useState<JobStats | null>(null);
  const [agentStats, setAgentStats] = useState<AgentStats | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    if (tenantId) {
      loadMetrics();
      const interval = setInterval(loadMetrics, 60000); // Refresh every minute
      return () => clearInterval(interval);
    }
  }, [tenantId]);

  async function loadMetrics() {
    if (!tenantId) return;
    
    setLoading(true);
    try {
      // Fetch agent stats
      const { data: agents } = await supabase
        .from('agents')
        .select('id, status, last_heartbeat')
        .eq('tenant_id', tenantId);

      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      
      const agentData = agents || [];
      const online = agentData.filter(a => 
        a.last_heartbeat && new Date(a.last_heartbeat) > fiveMinutesAgo
      ).length;
      const offline = agentData.filter(a => 
        a.last_heartbeat && new Date(a.last_heartbeat) <= fiveMinutesAgo
      ).length;
      const pending = agentData.filter(a => !a.last_heartbeat).length;
      
      setAgentStats({
        total: agentData.length,
        online,
        offline,
        pending,
        healthyRate: agentData.length > 0 ? (online / agentData.length) * 100 : 100
      });

      // Fetch job stats (last 24 hours)
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, status')
        .eq('tenant_id', tenantId)
        .gte('created_at', oneDayAgo);

      const jobData = jobs || [];
      const completed = jobData.filter(j => j.status === 'completed').length;
      const failed = jobData.filter(j => j.status === 'failed').length;
      const pendingJobs = jobData.filter(j => ['queued', 'delivered'].includes(j.status)).length;
      
      const jobSuccessRate = jobData.length > 0 
        ? (completed / (completed + failed)) * 100 
        : 100;

      setJobStats({
        total: jobData.length,
        completed,
        failed,
        pending: pendingJobs,
        successRate: isNaN(jobSuccessRate) ? 100 : jobSuccessRate
      });

      // Calculate SLO metrics
      const heartbeatSLO = 99.9;
      const jobSLO = 99.5;
      const uptimeSLO = 99.0;

      const currentHeartbeat = agentData.length > 0 ? (online / agentData.length) * 100 : 100;
      const currentJobSuccess = jobSuccessRate;
      const currentUptime = agentData.length > 0 ? ((online + pending) / agentData.length) * 100 : 100;

      // Calculate error budget (how much of allowed failures we've used)
      const heartbeatErrorBudget = Math.min(100, Math.max(0, 
        ((100 - currentHeartbeat) / (100 - heartbeatSLO)) * 100
      ));
      const jobErrorBudget = Math.min(100, Math.max(0,
        ((100 - currentJobSuccess) / (100 - jobSLO)) * 100
      ));
      const uptimeErrorBudget = Math.min(100, Math.max(0,
        ((100 - currentUptime) / (100 - uptimeSLO)) * 100
      ));

      setMetrics({
        heartbeat: {
          target: heartbeatSLO,
          current: currentHeartbeat,
          errorBudgetUsed: isNaN(heartbeatErrorBudget) ? 0 : heartbeatErrorBudget,
          status: heartbeatErrorBudget > 80 ? 'critical' : heartbeatErrorBudget > 50 ? 'warning' : 'healthy'
        },
        jobExecution: {
          target: jobSLO,
          current: currentJobSuccess,
          errorBudgetUsed: isNaN(jobErrorBudget) ? 0 : jobErrorBudget,
          status: jobErrorBudget > 80 ? 'critical' : jobErrorBudget > 50 ? 'warning' : 'healthy'
        },
        agentUptime: {
          target: uptimeSLO,
          current: currentUptime,
          errorBudgetUsed: isNaN(uptimeErrorBudget) ? 0 : uptimeErrorBudget,
          status: uptimeErrorBudget > 80 ? 'critical' : uptimeErrorBudget > 50 ? 'warning' : 'healthy'
        }
      });

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error loading SLO metrics:', error);
    } finally {
      setLoading(false);
    }
  }

  function getStatusColor(status: 'healthy' | 'warning' | 'critical') {
    switch (status) {
      case 'healthy': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'critical': return 'text-red-500';
    }
  }

  function getStatusBadge(status: 'healthy' | 'warning' | 'critical') {
    switch (status) {
      case 'healthy': return <Badge variant="default" className="bg-green-500">Saudável</Badge>;
      case 'warning': return <Badge variant="secondary" className="bg-yellow-500 text-black">Atenção</Badge>;
      case 'critical': return <Badge variant="destructive">Crítico</Badge>;
    }
  }

  function getProgressColor(value: number) {
    if (value > 80) return 'bg-red-500';
    if (value > 50) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  if (loading && !metrics) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard SLO</h1>
            <p className="text-muted-foreground">Carregando métricas...</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Target className="h-8 w-8 text-primary" />
            Dashboard SLO
          </h1>
          <p className="text-muted-foreground">
            Service Level Objectives - Última atualização: {formatBrazilDateTime(lastUpdated)}
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Auto-refresh: 1min
        </Badge>
      </div>

      {/* SLO Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Heartbeat SLO */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-500" />
                Heartbeat
              </span>
              {metrics && getStatusBadge(metrics.heartbeat.status)}
            </CardTitle>
            <CardDescription>
              Target: {metrics?.heartbeat.target}% | Atual: {metrics?.heartbeat.current.toFixed(1)}%
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-4xl font-bold text-center">
              <span className={getStatusColor(metrics?.heartbeat.status || 'healthy')}>
                {metrics?.heartbeat.current.toFixed(1)}%
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Error Budget Usado</span>
                <span>{metrics?.heartbeat.errorBudgetUsed.toFixed(1)}%</span>
              </div>
              <Progress 
                value={metrics?.heartbeat.errorBudgetUsed || 0} 
                className={`h-2 ${getProgressColor(metrics?.heartbeat.errorBudgetUsed || 0)}`}
              />
            </div>
          </CardContent>
        </Card>

        {/* Job Execution SLO */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                Execução de Jobs
              </span>
              {metrics && getStatusBadge(metrics.jobExecution.status)}
            </CardTitle>
            <CardDescription>
              Target: {metrics?.jobExecution.target}% | Atual: {metrics?.jobExecution.current.toFixed(1)}%
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-4xl font-bold text-center">
              <span className={getStatusColor(metrics?.jobExecution.status || 'healthy')}>
                {metrics?.jobExecution.current.toFixed(1)}%
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Error Budget Usado</span>
                <span>{metrics?.jobExecution.errorBudgetUsed.toFixed(1)}%</span>
              </div>
              <Progress 
                value={metrics?.jobExecution.errorBudgetUsed || 0} 
                className={`h-2 ${getProgressColor(metrics?.jobExecution.errorBudgetUsed || 0)}`}
              />
            </div>
          </CardContent>
        </Card>

        {/* Agent Uptime SLO */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Server className="h-5 w-5 text-green-500" />
                Uptime de Agentes
              </span>
              {metrics && getStatusBadge(metrics.agentUptime.status)}
            </CardTitle>
            <CardDescription>
              Target: {metrics?.agentUptime.target}% | Atual: {metrics?.agentUptime.current.toFixed(1)}%
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-4xl font-bold text-center">
              <span className={getStatusColor(metrics?.agentUptime.status || 'healthy')}>
                {metrics?.agentUptime.current.toFixed(1)}%
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Error Budget Usado</span>
                <span>{metrics?.agentUptime.errorBudgetUsed.toFixed(1)}%</span>
              </div>
              <Progress 
                value={metrics?.agentUptime.errorBudgetUsed || 0} 
                className={`h-2 ${getProgressColor(metrics?.agentUptime.errorBudgetUsed || 0)}`}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Agent Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Status dos Agentes
            </CardTitle>
            <CardDescription>Distribuição atual dos agentes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{agentStats?.total || 0}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-500">{agentStats?.online || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Online
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-500">{agentStats?.offline || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <XCircle className="h-3 w-3" />
                  Offline
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-500">{agentStats?.pending || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Pendente
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Job Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Jobs (Últimas 24h)
            </CardTitle>
            <CardDescription>Performance de execução de jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{jobStats?.total || 0}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-500">{jobStats?.completed || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Sucesso
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-500">{jobStats?.failed || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <XCircle className="h-3 w-3" />
                  Falha
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-500">{jobStats?.pending || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  Pendente
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SLO Definitions */}
      <Card>
        <CardHeader>
          <CardTitle>Definições de SLO</CardTitle>
          <CardDescription>Objetivos de nível de serviço configurados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Métrica</th>
                  <th className="text-left py-2">Target</th>
                  <th className="text-left py-2">Error Budget (30d)</th>
                  <th className="text-left py-2">Descrição</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    Heartbeat
                  </td>
                  <td className="py-2">99.9%</td>
                  <td className="py-2">~43 min/mês</td>
                  <td className="py-2 text-muted-foreground">Agentes devem enviar heartbeat a cada 60s</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    Execução de Jobs
                  </td>
                  <td className="py-2">99.5%</td>
                  <td className="py-2">~3.6 horas/mês</td>
                  <td className="py-2 text-muted-foreground">Jobs devem completar com sucesso</td>
                </tr>
                <tr>
                  <td className="py-2 flex items-center gap-2">
                    <Server className="h-4 w-4 text-green-500" />
                    Uptime de Agentes
                  </td>
                  <td className="py-2">99.0%</td>
                  <td className="py-2">~7.2 horas/mês</td>
                  <td className="py-2 text-muted-foreground">Agentes devem estar online ou em provisão</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
