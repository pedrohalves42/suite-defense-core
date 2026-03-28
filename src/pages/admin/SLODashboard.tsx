import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { formatBrazilDateTime } from "@/lib/date-utils";
import { HelpTooltip } from "@/components/ui/tech-tooltip";
import { BlastRadiusPoliciesCard } from "@/components/slo/BlastRadiusPoliciesCard";
import { ForensicSnapshotsCard } from "@/components/slo/ForensicSnapshotsCard";
import { useCalculatedSLOs } from "@/hooks/useSLOData";
import { SectionDivider } from "@/components/ui/section-divider";
import { logger } from '@/lib/logger';
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Server,
  Zap,
  Heart,
  TrendingUp,
  Shield,
  RefreshCw,
  Info,
  Camera
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

  // Use calculated SLOs hook for real-time metrics
  const { data: calculatedSLOs, isLoading: sloLoading } = useCalculatedSLOs();

  useEffect(() => {
    if (tenantId) {
      loadMetrics();
      const interval = setInterval(loadMetrics, 300_000); // COST-OPT: 60s → 5min
      return () => clearInterval(interval);
    }
  }, [tenantId]);

  async function loadMetrics() {
    if (!tenantId) return;
    
    setLoading(true);
    try {
      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data: agentsRaw } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenantId,
        p_include_archived: false,
      });
      const agents = (agentsRaw as unknown as Array<{ id: string; status: string; last_heartbeat: string | null }>) || [];

      const now = new Date();
      const cutoff = new Date(now.getTime() - 30 * 60 * 1000); // 30min - matches AGENT_STATUS_THRESHOLDS
      
      const agentData = agents || [];
      const online = agentData.filter(a => 
        a.last_heartbeat && new Date(a.last_heartbeat) > cutoff
      ).length;
      const offline = agentData.filter(a => 
        a.last_heartbeat && new Date(a.last_heartbeat) <= cutoff
      ).length;
      const pending = agentData.filter(a => !a.last_heartbeat).length;
      
      setAgentStats({
        total: agentData.length,
        online,
        offline,
        pending,
        healthyRate: agentData.length > 0 ? (online / agentData.length) * 100 : 100
      });

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

      const heartbeatSLO = 99.9;
      const jobSLO = 99.5;
      const uptimeSLO = 99.0;

      const currentHeartbeat = agentData.length > 0 ? (online / agentData.length) * 100 : 100;
      const currentJobSuccess = jobSuccessRate;
      const currentUptime = agentData.length > 0 ? ((online + pending) / agentData.length) * 100 : 100;

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
      logger.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  }

  function getOverallStatus(): 'healthy' | 'warning' | 'critical' {
    if (!metrics) return 'healthy';
    const statuses = [metrics.heartbeat.status, metrics.jobExecution.status, metrics.agentUptime.status];
    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('warning')) return 'warning';
    return 'healthy';
  }

  function getStatusMessage(status: 'healthy' | 'warning' | 'critical'): { icon: React.ReactNode; text: string; description: string; color: string } {
    switch (status) {
      case 'healthy':
        return {
          icon: <CheckCircle className="h-8 w-8 text-green-500" />,
          text: "Tudo funcionando",
          description: "Seus computadores estão operando normalmente",
          color: "bg-green-500/10 border-green-500/20"
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="h-8 w-8 text-yellow-500" />,
          text: "Fique de olho",
          description: "Alguns indicadores precisam de atenção",
          color: "bg-yellow-500/10 border-yellow-500/20"
        };
      case 'critical':
        return {
          icon: <XCircle className="h-8 w-8 text-red-500" />,
          text: "Precisa de ação",
          description: "Existem problemas que precisam ser resolvidos",
          color: "bg-red-500/10 border-red-500/20"
        };
    }
  }

  function getStatusBadge(status: 'healthy' | 'warning' | 'critical') {
    switch (status) {
      case 'healthy': return <Badge className="bg-green-500/20 text-green-600 border-green-500/30">OK</Badge>;
      case 'warning': return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">Atenção</Badge>;
      case 'critical': return <Badge className="bg-red-500/20 text-red-600 border-red-500/30">Problema</Badge>;
    }
  }

  function getProgressColor(value: number) {
    if (value > 80) return 'bg-red-500';
    if (value > 50) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  function getErrorBudgetMessage(used: number): string {
    if (used <= 20) return "Ótimo! Margem de segurança ampla";
    if (used <= 50) return "Bom, ainda há margem confortável";
    if (used <= 80) return "Atenção, margem diminuindo";
    return "Crítico! Limite quase atingido";
  }

  if (loading && !metrics) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Saúde do Sistema</h1>
            <p className="text-muted-foreground">Carregando informações...</p>
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

  const overallStatus = getOverallStatus();
  const statusInfo = getStatusMessage(overallStatus);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Heart className="h-8 w-8 text-primary" />
            Saúde do Sistema
          </h1>
          <p className="text-muted-foreground">
            Acompanhe se seus computadores estão funcionando corretamente
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4" />
          Atualiza automaticamente
        </div>
      </div>

      {/* Status Geral */}
      <Card className={`border-2 ${statusInfo.color}`}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            {statusInfo.icon}
            <div className="flex-1">
              <h2 className="text-xl font-semibold">{statusInfo.text}</h2>
              <p className="text-muted-foreground">{statusInfo.description}</p>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>Última verificação</p>
              <p className="font-medium">{formatBrazilDateTime(lastUpdated)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Métricas Simplificados */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Sinal de Vida */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-500" />
                Sinal de Vida
                <HelpTooltip term="sinal de vida" />
              </span>
              {metrics && getStatusBadge(metrics.heartbeat.status)}
            </CardTitle>
            <CardDescription>
              Computadores respondendo normalmente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-green-500">
                {metrics?.heartbeat.current.toFixed(0)}%
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Meta: {metrics?.heartbeat.target}%
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1">
                  Margem de falha usada
                  <HelpTooltip term="margem de falha" />
                </span>
                <span>{metrics?.heartbeat.errorBudgetUsed.toFixed(0)}%</span>
              </div>
              <Progress 
                value={metrics?.heartbeat.errorBudgetUsed || 0} 
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                {getErrorBudgetMessage(metrics?.heartbeat.errorBudgetUsed || 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Verificações */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                Verificações
                <HelpTooltip term="verificação" />
              </span>
              {metrics && getStatusBadge(metrics.jobExecution.status)}
            </CardTitle>
            <CardDescription>
              Comandos executados com sucesso
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-green-500">
                {metrics?.jobExecution.current.toFixed(0)}%
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Meta: {metrics?.jobExecution.target}%
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1">
                  Margem de falha usada
                  <HelpTooltip term="margem de falha" />
                </span>
                <span>{metrics?.jobExecution.errorBudgetUsed.toFixed(0)}%</span>
              </div>
              <Progress 
                value={metrics?.jobExecution.errorBudgetUsed || 0} 
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                {getErrorBudgetMessage(metrics?.jobExecution.errorBudgetUsed || 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tempo Online */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Server className="h-5 w-5 text-green-500" />
                Tempo Online
                <HelpTooltip term="tempo online" />
              </span>
              {metrics && getStatusBadge(metrics.agentUptime.status)}
            </CardTitle>
            <CardDescription>
              Computadores conectados ao sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-green-500">
                {metrics?.agentUptime.current.toFixed(0)}%
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Meta: {metrics?.agentUptime.target}%
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1">
                  Margem de falha usada
                  <HelpTooltip term="margem de falha" />
                </span>
                <span>{metrics?.agentUptime.errorBudgetUsed.toFixed(0)}%</span>
              </div>
              <Progress 
                value={metrics?.agentUptime.errorBudgetUsed || 0} 
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                {getErrorBudgetMessage(metrics?.agentUptime.errorBudgetUsed || 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SLOs Calculados em Tempo Real */}
      <SectionDivider label="Métricas em Tempo Real" />
      
      {calculatedSLOs && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className={calculatedSLOs.heartbeat_success.is_breached ? "border-red-500/50" : "border-green-500/50"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Heartbeat
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {calculatedSLOs.heartbeat_success.value.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Meta: {calculatedSLOs.heartbeat_success.target}% • {calculatedSLOs.heartbeat_success.sample_size} agentes
              </p>
            </CardContent>
          </Card>

          <Card className={calculatedSLOs.job_success.is_breached ? "border-red-500/50" : "border-green-500/50"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {calculatedSLOs.job_success.value.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Meta: {calculatedSLOs.job_success.target}% • {calculatedSLOs.job_success.sample_size} jobs
              </p>
            </CardContent>
          </Card>

          <Card className={calculatedSLOs.agent_uptime.is_breached ? "border-red-500/50" : "border-green-500/50"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Server className="h-4 w-4" />
                Uptime
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {calculatedSLOs.agent_uptime.value.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Meta: {calculatedSLOs.agent_uptime.target}% • {calculatedSLOs.agent_uptime.sample_size} agentes
              </p>
            </CardContent>
          </Card>

          <Card className={calculatedSLOs.enrollment_success.is_breached ? "border-red-500/50" : "border-green-500/50"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Enrollment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {calculatedSLOs.enrollment_success.value.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Meta: {calculatedSLOs.enrollment_success.target}% • {calculatedSLOs.enrollment_success.sample_size} chaves
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Estatísticas Detalhadas */}
      <SectionDivider label="Estatísticas Detalhadas" />
      
      <div className="grid gap-4 md:grid-cols-2">
        {/* Computadores */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5" />
              Seus Computadores
            </CardTitle>
            <CardDescription>Status atual de todos os computadores monitorados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold">{agentStats?.total || 0}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10">
                <div className="text-2xl font-bold text-green-500">{agentStats?.online || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Conectados
                </div>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10">
                <div className="text-2xl font-bold text-red-500">{agentStats?.offline || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <XCircle className="h-3 w-3" />
                  Desconectados
                </div>
              </div>
              <div className="p-3 rounded-lg bg-yellow-500/10">
                <div className="text-2xl font-bold text-yellow-500">{agentStats?.pending || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  Aguardando
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tarefas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5" />
              Tarefas (Últimas 24h)
            </CardTitle>
            <CardDescription>Comandos enviados para seus computadores</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold">{jobStats?.total || 0}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10">
                <div className="text-2xl font-bold text-green-500">{jobStats?.completed || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Sucesso
                </div>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10">
                <div className="text-2xl font-bold text-red-500">{jobStats?.failed || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <XCircle className="h-3 w-3" />
                  Falha
                </div>
              </div>
              <div className="p-3 rounded-lg bg-yellow-500/10">
                <div className="text-2xl font-bold text-yellow-500">{jobStats?.pending || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  Pendentes
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Blast Radius & Forensic Snapshots */}
      <div className="grid gap-4 md:grid-cols-2">
        <BlastRadiusPoliciesCard />
        <ForensicSnapshotsCard />
      </div>

      {/* Seção de Ajuda */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-5 w-5 text-blue-500" />
            Entenda as métricas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                Sinal de Vida
              </p>
              <p className="text-muted-foreground">
                Indica se os computadores estão respondendo. O sistema verifica a cada 60 segundos. 
                Meta de 99.9% significa que toleramos no máximo 43 minutos de problema por mês.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-medium flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                Tarefas
              </p>
              <p className="text-muted-foreground">
                Comandos como coleta de dados, verificação de segurança e atualizações. 
                Meta de 99.5% permite até 3.6 horas de falhas por mês.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-medium flex items-center gap-2">
                <Server className="h-4 w-4 text-green-500" />
                Tempo Online
              </p>
              <p className="text-muted-foreground">
                Porcentagem de computadores conectados e funcionando. 
                Meta de 99% permite até 7.2 horas offline por mês.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}