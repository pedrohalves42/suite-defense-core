import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BlastRadiusPoliciesCard } from '@/components/slo/BlastRadiusPoliciesCard';
import { ForensicSnapshotsCard } from '@/components/slo/ForensicSnapshotsCard';
import { SectionDivider } from '@/components/ui/section-divider';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { Activity, CheckCircle, XCircle, AlertTriangle, Clock, Server, Zap, Heart, TrendingUp, Shield, RefreshCw, Info } from 'lucide-react';
import { useSLOMetrics } from './hooks/useSLOMetrics';
import { SLOMetricCard } from './components/SLOMetricCard';

function getOverallStatus(metrics: any): 'healthy' | 'warning' | 'critical' {
  if (!metrics) return 'healthy';
  const statuses = [metrics.heartbeat.status, metrics.jobExecution.status, metrics.agentUptime.status];
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('warning')) return 'warning';
  return 'healthy';
}

function getStatusMessage(status: 'healthy' | 'warning' | 'critical') {
  switch (status) {
    case 'healthy': return { icon: <CheckCircle className="h-8 w-8 text-green-500" />, text: "Tudo funcionando", description: "Seus computadores estão operando normalmente", color: "bg-green-500/10 border-green-500/20" };
    case 'warning': return { icon: <AlertTriangle className="h-8 w-8 text-yellow-500" />, text: "Fique de olho", description: "Alguns indicadores precisam de atenção", color: "bg-yellow-500/10 border-yellow-500/20" };
    case 'critical': return { icon: <XCircle className="h-8 w-8 text-red-500" />, text: "Precisa de ação", description: "Existem problemas que precisam ser resolvidos", color: "bg-red-500/10 border-red-500/20" };
  }
}

export default function SLODashboard() {
  const { loading, metrics, jobStats, agentStats, lastUpdated, calculatedSLOs } = useSLOMetrics();

  if (loading && !metrics) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div><h1 className="text-3xl font-bold">Saúde do Sistema</h1><p className="text-muted-foreground">Carregando informações...</p></div>
        <div className="grid gap-4 md:grid-cols-3">{[1,2,3].map(i => <Card key={i}><CardHeader><Skeleton className="h-6 w-32" /></CardHeader><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>)}</div>
      </div>
    );
  }

  const overallStatus = getOverallStatus(metrics);
  const statusInfo = getStatusMessage(overallStatus);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Heart className="h-8 w-8 text-primary" />Saúde do Sistema</h1>
          <p className="text-muted-foreground">Acompanhe se seus computadores estão funcionando corretamente</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4" />Atualiza automaticamente</div>
      </div>

      <Card className={`border-2 ${statusInfo.color}`}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            {statusInfo.icon}
            <div className="flex-1"><h2 className="text-xl font-semibold">{statusInfo.text}</h2><p className="text-muted-foreground">{statusInfo.description}</p></div>
            <div className="text-right text-sm text-muted-foreground"><p>Última verificação</p><p className="font-medium">{formatBrazilDateTime(lastUpdated)}</p></div>
          </div>
        </CardContent>
      </Card>

      {metrics && (
        <div className="grid gap-4 md:grid-cols-3">
          <SLOMetricCard icon={Activity} iconColor="text-blue-500" title="Sinal de Vida" tooltipTerm="sinal de vida" description="Computadores respondendo normalmente" current={metrics.heartbeat.current} target={metrics.heartbeat.target} errorBudgetUsed={metrics.heartbeat.errorBudgetUsed} status={metrics.heartbeat.status} />
          <SLOMetricCard icon={Zap} iconColor="text-yellow-500" title="Verificações" tooltipTerm="verificação" description="Comandos executados com sucesso" current={metrics.jobExecution.current} target={metrics.jobExecution.target} errorBudgetUsed={metrics.jobExecution.errorBudgetUsed} status={metrics.jobExecution.status} />
          <SLOMetricCard icon={Server} iconColor="text-green-500" title="Tempo Online" tooltipTerm="tempo online" description="Computadores conectados ao sistema" current={metrics.agentUptime.current} target={metrics.agentUptime.target} errorBudgetUsed={metrics.agentUptime.errorBudgetUsed} status={metrics.agentUptime.status} />
        </div>
      )}

      <SectionDivider label="Métricas em Tempo Real" />
      {calculatedSLOs && (
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'Heartbeat', icon: Activity, data: calculatedSLOs.heartbeat_success, unit: 'agentes' },
            { label: 'Jobs', icon: Zap, data: calculatedSLOs.job_success, unit: 'jobs' },
            { label: 'Uptime', icon: Server, data: calculatedSLOs.agent_uptime, unit: 'agentes' },
            { label: 'Enrollment', icon: TrendingUp, data: calculatedSLOs.enrollment_success, unit: 'chaves' },
          ].map(({ label, icon: Icon, data, unit }) => (
            <Card key={label} className={data.is_breached ? "border-red-500/50" : "border-green-500/50"}>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Icon className="h-4 w-4" />{label}</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{data.value.toFixed(1)}%</div><p className="text-xs text-muted-foreground">Meta: {data.target}% • {data.sample_size} {unit}</p></CardContent>
            </Card>
          ))}
        </div>
      )}

      <SectionDivider label="Estatísticas Detalhadas" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Shield className="h-5 w-5" />Seus Computadores</CardTitle><CardDescription>Status atual de todos os computadores monitorados</CardDescription></CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="p-3 rounded-lg bg-muted/50"><div className="text-2xl font-bold">{agentStats?.total || 0}</div><div className="text-xs text-muted-foreground">Total</div></div>
              <div className="p-3 rounded-lg bg-green-500/10"><div className="text-2xl font-bold text-green-500">{agentStats?.online || 0}</div><div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><CheckCircle className="h-3 w-3" />Conectados</div></div>
              <div className="p-3 rounded-lg bg-red-500/10"><div className="text-2xl font-bold text-red-500">{agentStats?.offline || 0}</div><div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><XCircle className="h-3 w-3" />Desconectados</div></div>
              <div className="p-3 rounded-lg bg-yellow-500/10"><div className="text-2xl font-bold text-yellow-500">{agentStats?.pending || 0}</div><div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Clock className="h-3 w-3" />Aguardando</div></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5" />Tarefas (Últimas 24h)</CardTitle><CardDescription>Comandos enviados para seus computadores</CardDescription></CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="p-3 rounded-lg bg-muted/50"><div className="text-2xl font-bold">{jobStats?.total || 0}</div><div className="text-xs text-muted-foreground">Total</div></div>
              <div className="p-3 rounded-lg bg-green-500/10"><div className="text-2xl font-bold text-green-500">{jobStats?.completed || 0}</div><div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><CheckCircle className="h-3 w-3" />Sucesso</div></div>
              <div className="p-3 rounded-lg bg-red-500/10"><div className="text-2xl font-bold text-red-500">{jobStats?.failed || 0}</div><div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><XCircle className="h-3 w-3" />Falha</div></div>
              <div className="p-3 rounded-lg bg-yellow-500/10"><div className="text-2xl font-bold text-yellow-500">{jobStats?.pending || 0}</div><div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Clock className="h-3 w-3" />Pendentes</div></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2"><BlastRadiusPoliciesCard /><ForensicSnapshotsCard /></div>

      <Card className="bg-muted/30">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Info className="h-5 w-5 text-blue-500" />Entenda as métricas</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div className="space-y-1"><p className="font-medium flex items-center gap-2"><Activity className="h-4 w-4 text-blue-500" />Sinal de Vida</p><p className="text-muted-foreground">Indica se os computadores estão respondendo. O sistema verifica a cada 60 segundos. Meta de 99.9% significa que toleramos no máximo 43 minutos de problema por mês.</p></div>
            <div className="space-y-1"><p className="font-medium flex items-center gap-2"><Zap className="h-4 w-4 text-yellow-500" />Tarefas</p><p className="text-muted-foreground">Comandos como coleta de dados, verificação de segurança e atualizações. Meta de 99.5% permite até 3.6 horas de falhas por mês.</p></div>
            <div className="space-y-1"><p className="font-medium flex items-center gap-2"><Server className="h-4 w-4 text-green-500" />Tempo Online</p><p className="text-muted-foreground">Porcentagem de computadores conectados e funcionando. Meta de 99% permite até 7.2 horas offline por mês.</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
