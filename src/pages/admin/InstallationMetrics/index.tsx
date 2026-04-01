import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, CheckCircle2, Clock, AlertTriangle, TrendingUp, TrendingDown, Server } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { useInstallationMetrics } from './useInstallationMetrics';
import { InstallationCharts } from './components/InstallationCharts';

export default function InstallationMetrics() {
  const {
    metrics, errors, isLoading, totalMetrics, totalAttempts,
    successRate, avgInstallTime, platformMetrics,
    errorsByPlatform, healthSummary, healthLevel,
  } = useInstallationMetrics();

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Metricas de Instalacao</h1>
          <p className="text-muted-foreground">Analise consolidada com dados das views SQL otimizadas</p>
        </div>
        <Activity className="h-8 w-8 text-primary" />
      </div>

      {healthSummary && (
        <Card className={
          healthLevel === 'healthy' ? 'border-green-500/50' :
          healthLevel === 'unhealthy' ? 'border-red-500/50' :
          'border-yellow-500/50'
        }>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Status de Saude dos Agentes</CardTitle>
              <Badge variant={healthLevel === 'healthy' ? 'default' : healthLevel === 'unhealthy' ? 'destructive' : 'secondary'}>
                {healthLevel === 'healthy' ? 'Saudavel' : healthLevel === 'unhealthy' ? 'Critico' : healthLevel === 'warning' ? 'Atencao' : 'Sem Dados'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-1"><span className="text-xs text-muted-foreground">Total Agentes</span><p className="text-lg font-semibold">{healthSummary.total_agents}</p></div>
            <div className="space-y-1"><span className="text-xs text-muted-foreground">Ativos</span><p className="text-lg font-semibold text-green-600">{healthSummary.active_agents}</p></div>
            <div className="space-y-1"><span className="text-xs text-muted-foreground">Pendentes</span><p className="text-lg font-semibold text-yellow-600">{healthSummary.pending_agents}</p></div>
            <div className="space-y-1"><span className="text-xs text-muted-foreground">Travados</span><p className="text-lg font-semibold text-red-600">{healthSummary.stuck_agents}</p></div>
            <div className="space-y-1"><span className="text-xs text-muted-foreground">Taxa de Ativacao</span><p className="text-lg font-semibold">{healthSummary.activation_rate_pct?.toFixed(1)}%</p></div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso Global</CardTitle>
            {parseFloat(successRate) >= 80 ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground">{totalMetrics?.successful_events} sucessos de {totalAttempts} eventos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Medio</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgInstallTime}s</div>
            <p className="text-xs text-muted-foreground">{parseFloat(avgInstallTime) < 60 ? "Performance excelente" : "Pode otimizar"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eventos com Falha</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMetrics?.failed_events || 0}</div>
            <p className="text-xs text-muted-foreground">{errors?.length || 0} tipos de erro unicos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Instalacoes Completas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMetrics?.total_installed || 0}</div>
            <p className="text-xs text-muted-foreground">{totalMetrics?.total_generated || 0} gerados, {totalMetrics?.total_copied || 0} copiados</p>
          </CardContent>
        </Card>
      </div>

      <InstallationCharts totalMetrics={totalMetrics} platformMetrics={platformMetrics} />

      {errors && errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resumo de Erros</CardTitle>
            <CardDescription>Erros mais comuns agrupados por plataforma</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(errorsByPlatform || {}).map(([platform, platformErrors]) => (
              <div key={platform} className="space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                </h4>
                <div className="space-y-2 pl-6">
                  {platformErrors.map((err, idx) => (
                    <div key={idx} className="text-sm border-l-2 border-destructive/50 pl-3 py-1">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground truncate max-w-[70%]">{err.error_message || 'Erro desconhecido'}</span>
                        <Badge variant="outline" className="ml-2">{err.error_count}x</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Tipo: {err.event_type} | Ultimo: {err.last_occurrence ? formatBrazilDateTime(err.last_occurrence, 'date') : 'N/A'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(!metrics || metrics.length === 0) && (!errors || errors.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Sem Dados de Metricas</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Ainda nao ha dados de instalacao suficientes. As metricas serao exibidas apos as primeiras instalacoes de agentes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
