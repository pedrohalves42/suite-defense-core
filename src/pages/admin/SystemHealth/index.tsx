import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Server, TrendingUp,
  Zap, RefreshCw, Brain, XCircle, Timer,
} from "lucide-react";
import JobTestRunner from "@/components/admin/JobTestRunner";
import { format, ptBR } from '@/lib/date-utils';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useSystemHealthData } from "./useSystemHealthData";

export default function SystemHealth() {
  const {
    isLoading, agentStats, jobStats, jobsOverTime, aiInsightsStats, performanceMetrics,
    healthScore, jobSuccessRate, v3AdoptionRate, overallHealth,
  } = useSystemHealthData();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Saúde do Sistema
            </h2>
            <p className="text-sm text-muted-foreground">
              Última atualização: {format(new Date(), "HH:mm:ss", { locale: ptBR })}
            </p>
          </div>
        </div>
        <Badge variant={overallHealth === "healthy" ? "default" : overallHealth === "degraded" ? "secondary" : "destructive"} className="text-sm px-3 py-1">
          {overallHealth === "healthy" ? "✓ Saudável" : overallHealth === "degraded" ? "⚠ Degradado" : "✗ Crítico"}
        </Badge>
      </div>

      {overallHealth !== "healthy" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {overallHealth === "critical"
              ? "Sistema em estado crítico. Verifique conectividade dos agentes e jobs travados."
              : "Saúde do sistema abaixo do ideal. Monitoramento recomendado."}
          </AlertDescription>
        </Alert>
      )}

      {/* Main Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agentes Online</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{healthScore}%</div>
            <p className="text-xs text-muted-foreground">{agentStats?.healthy} de {agentStats?.total} conectados</p>
            <Progress value={healthScore} className="mt-2 h-1.5" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobSuccessRate}%</div>
            <p className="text-xs text-muted-foreground">{jobStats?.completed} de {jobStats?.total} jobs (24h)</p>
            <Progress value={jobSuccessRate} className="mt-2 h-1.5" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobStats?.avgCompletionTime || 0}s</div>
            <p className="text-xs text-muted-foreground">Conclusão de jobs</p>
            <div className="mt-2 flex items-center gap-1">
              <Zap className={`h-3 w-3 ${(jobStats?.avgCompletionTime || 0) < 60 ? "text-green-500" : "text-yellow-500"}`} />
              <span className="text-xs">{(jobStats?.avgCompletionTime || 0) < 60 ? "Rápido" : (jobStats?.avgCompletionTime || 0) < 300 ? "Normal" : "Lento"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs Travados</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(jobStats?.stuckCount || 0) > 0 ? "text-destructive" : ""}`}>{jobStats?.stuckCount || 0}</div>
            <p className="text-xs text-muted-foreground">Em "delivered" há mais de 1h</p>
            {(jobStats?.stuckCount || 0) > 0 && (
              <div className="mt-2 flex items-center gap-1 text-destructive">
                <AlertTriangle className="h-3 w-3" />
                <span className="text-xs">Requer atenção</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status dos Agentes</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center"><span className="flex items-center gap-2 text-sm"><div className="h-2 w-2 rounded-full bg-green-500" />Online (últimos 5min)</span><span className="font-medium">{agentStats?.healthy}</span></div>
              <div className="flex justify-between items-center"><span className="flex items-center gap-2 text-sm"><div className="h-2 w-2 rounded-full bg-yellow-500" />Lento (5-30min)</span><span className="font-medium">{agentStats?.stale}</span></div>
              <div className="flex justify-between items-center"><span className="flex items-center gap-2 text-sm"><div className="h-2 w-2 rounded-full bg-red-500" />Offline (&gt;30min)</span><span className="font-medium">{agentStats?.offline}</span></div>
              <div className="flex justify-between items-center"><span className="flex items-center gap-2 text-sm"><div className="h-2 w-2 rounded-full bg-gray-400" />Pendentes</span><span className="font-medium">{agentStats?.pending}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs por Status</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center"><span className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-3 w-3 text-green-500" />Concluídos</span><span className="font-medium">{jobStats?.completed}</span></div>
              <div className="flex justify-between items-center"><span className="flex items-center gap-2 text-sm"><XCircle className="h-3 w-3 text-red-500" />Falharam</span><span className="font-medium">{jobStats?.failed}</span></div>
              <div className="flex justify-between items-center"><span className="flex items-center gap-2 text-sm"><RefreshCw className="h-3 w-3 text-blue-500" />Em execução</span><span className="font-medium">{jobStats?.delivered}</span></div>
              <div className="flex justify-between items-center"><span className="flex items-center gap-2 text-sm"><Clock className="h-3 w-3 text-yellow-500" />Na fila</span><span className="font-medium">{jobStats?.pending}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Insights Pendentes</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(aiInsightsStats?.critical || 0) > 0 && (
                <div className="flex justify-between items-center"><span className="flex items-center gap-2 text-sm"><Badge variant="destructive" className="h-5 px-1.5">!</Badge>Críticos</span><span className="font-medium text-destructive">{aiInsightsStats?.critical}</span></div>
              )}
              {(aiInsightsStats?.high || 0) > 0 && (
                <div className="flex justify-between items-center"><span className="flex items-center gap-2 text-sm"><div className="h-2 w-2 rounded-full bg-orange-500" />Alto</span><span className="font-medium">{aiInsightsStats?.high}</span></div>
              )}
              <div className="flex justify-between items-center"><span className="flex items-center gap-2 text-sm"><div className="h-2 w-2 rounded-full bg-yellow-500" />Médio</span><span className="font-medium">{aiInsightsStats?.medium || 0}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Total pendentes</span><span className="font-medium">{aiInsightsStats?.total || 0}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Jobs Timeline Chart */}
      {jobsOverTime && jobsOverTime.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Volume de Jobs (Últimas 12h)</CardTitle>
            <CardDescription>Jobs processados por hora</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={jobsOverTime}>
                  <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="completed" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.6} name="Concluídos" />
                  <Area type="monotone" dataKey="failed" stackId="1" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.6} name="Falharam" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Jobs v3 Adoption */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>Adoção Jobs v3</CardTitle>
            <CardDescription>Migração para o novo modelo de execução</CardDescription>
          </div>
          <Badge variant={v3AdoptionRate >= 80 ? "default" : "secondary"}>{v3AdoptionRate}%</Badge>
        </CardHeader>
        <CardContent>
          <Progress value={v3AdoptionRate} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">{jobStats?.v3} de {jobStats?.total} jobs usando v3 (últimas 24h)</p>
        </CardContent>
      </Card>

      <JobTestRunner />

      {/* Slow Operations */}
      {performanceMetrics && performanceMetrics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Operações Lentas (Últimas 24h)</CardTitle>
            <CardDescription>Funções com tempo médio acima de 1 segundo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {performanceMetrics.map((metric) => (
                <div key={metric.name} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{metric.name}</p>
                    <p className="text-xs text-muted-foreground">{metric.callCount} chamadas, {metric.errorCount} erros</p>
                  </div>
                  <Badge variant={metric.avgDuration > 2000 ? "destructive" : "secondary"}>{metric.avgDuration}ms</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
