import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle2, Clock, AlertTriangle, TrendingUp, TrendingDown, Server, Zap } from "lucide-react";
import { formatBrazilDateTime } from "@/lib/date-utils";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { Badge } from "@/components/ui/badge";

const COLORS = {
  success: 'hsl(var(--chart-2))',
  failed: 'hsl(var(--destructive))',
  warning: 'hsl(var(--chart-4))',
  info: 'hsl(var(--primary))',
  windows: 'hsl(var(--primary))',
  linux: 'hsl(var(--chart-3))'
};

// Interfaces matching actual SQL view fields
interface AgentInstallationMetrics {
  tenant_id: string;
  platform: string;
  total_generated: number;
  total_downloaded: number;
  total_copied: number;
  total_installed: number;
  successful_events: number;
  failed_events: number;
  avg_install_time_seconds: number;
  with_network: number;
  without_network: number;
  last_event_at: string;
}

interface InstallationErrorSummary {
  tenant_id: string;
  platform: string;
  event_type: string;
  error_message: string;
  error_count: number;
  last_occurrence: string;
}

interface InstallationHealthStatus {
  tenant_id: string;
  total_agents: number;
  active_agents: number;
  pending_agents: number;
  stuck_agents: number;
  activation_rate_pct: number;
  window_interval: string;
}

export default function InstallationMetrics() {
  // Query for consolidated metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['agent-installation-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_installation_metrics' as 'agents')
        .select('tenant_id, platform, total_generated, total_downloaded, total_copied, total_installed, successful_events, failed_events, avg_install_time_seconds, with_network, without_network, last_event_at');

      if (error) throw error;
      return data as unknown as AgentInstallationMetrics[];
    }
  });

  // Query for error summary
  const { data: errors, isLoading: errorsLoading } = useQuery({
    queryKey: ['installation-error-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installation_error_summary' as 'agents')
        .select('tenant_id, platform, event_type, error_message, error_count, last_occurrence')
        .limit(20);

      if (error) throw error;
      return data as unknown as InstallationErrorSummary[];
    }
  });

  // Query for health status
  const { data: healthStatus, isLoading: healthLoading } = useQuery({
    queryKey: ['installation-health-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installation_health_status' as any)
        .select('*');

      if (error) throw error;
      return data as unknown as InstallationHealthStatus[];
    }
  });

  const isLoading = metricsLoading || errorsLoading || healthLoading;

  // Aggregate global metrics
  const totalMetrics = metrics?.reduce((acc, curr) => ({
    total_generated: acc.total_generated + (curr.total_generated || 0),
    total_downloaded: acc.total_downloaded + (curr.total_downloaded || 0),
    total_copied: acc.total_copied + (curr.total_copied || 0),
    total_installed: acc.total_installed + (curr.total_installed || 0),
    successful_events: acc.successful_events + (curr.successful_events || 0),
    failed_events: acc.failed_events + (curr.failed_events || 0),
    avg_install_time_seconds: acc.avg_install_time_seconds + (curr.avg_install_time_seconds || 0),
    with_network: acc.with_network + (curr.with_network || 0),
    without_network: acc.without_network + (curr.without_network || 0),
    count: acc.count + 1
  }), {
    total_generated: 0,
    total_downloaded: 0,
    total_copied: 0,
    total_installed: 0,
    successful_events: 0,
    failed_events: 0,
    avg_install_time_seconds: 0,
    with_network: 0,
    without_network: 0,
    count: 0
  });

  // Calculate total attempts and success rate
  const totalAttempts = totalMetrics ? 
    totalMetrics.total_generated + totalMetrics.total_downloaded + totalMetrics.total_copied + totalMetrics.total_installed : 0;
  
  const successRate = totalMetrics && totalAttempts > 0
    ? ((totalMetrics.successful_events / totalAttempts) * 100).toFixed(1)
    : '0';

  const avgInstallTime = totalMetrics && totalMetrics.count > 0
    ? (totalMetrics.avg_install_time_seconds / totalMetrics.count).toFixed(1)
    : '0';

  // Group metrics by platform
  const platformMetrics = metrics?.reduce((acc, curr) => {
    const platform = curr.platform?.toLowerCase() || 'unknown';
    if (!acc[platform]) {
      acc[platform] = { total: 0, success: 0, failed: 0, avgTime: 0, count: 0 };
    }
    const platformTotal = (curr.total_generated || 0) + (curr.total_downloaded || 0) + (curr.total_copied || 0) + (curr.total_installed || 0);
    acc[platform].total += platformTotal;
    acc[platform].success += curr.successful_events || 0;
    acc[platform].failed += curr.failed_events || 0;
    acc[platform].avgTime += curr.avg_install_time_seconds || 0;
    acc[platform].count += 1;
    return acc;
  }, {} as Record<string, { total: number; success: number; failed: number; avgTime: number; count: number }>);

  // Prepare chart data
  const platformData = Object.entries(platformMetrics || {}).map(([name, stats]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: stats.total,
    color: name === 'windows' ? COLORS.windows : COLORS.linux
  }));

  const successPieData = [
    { name: 'Sucesso', value: totalMetrics?.successful_events || 0, color: COLORS.success },
    { name: 'Falha', value: totalMetrics?.failed_events || 0, color: COLORS.failed }
  ];

  const networkHealthData = [
    { name: 'Conexao OK', value: totalMetrics?.with_network || 0, color: COLORS.success },
    { name: 'Sem Conexao', value: totalMetrics?.without_network || 0, color: COLORS.failed }
  ];

  // Platform comparison chart data
  const platformChartData = Object.entries(platformMetrics || {}).map(([name, stats]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    'Taxa de Sucesso (%)': stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : '0',
    'Tempo Medio (s)': stats.count > 0 ? (stats.avgTime / stats.count).toFixed(1) : '0',
    Sucessos: stats.success,
    Falhas: stats.failed
  }));

  // Consolidate errors by platform
  const errorsByPlatform = errors?.reduce((acc, err) => {
    const platform = err.platform || 'unknown';
    if (!acc[platform]) {
      acc[platform] = [];
    }
    acc[platform].push(err);
    return acc;
  }, {} as Record<string, InstallationErrorSummary[]>);

  // Get health status summary
  const healthSummary = healthStatus?.[0];
  const healthLevel = healthSummary 
    ? (healthSummary.activation_rate_pct >= 80 ? 'healthy' : 
       healthSummary.activation_rate_pct >= 50 ? 'warning' : 'unhealthy')
    : 'no_data';

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Metricas de Instalacao</h1>
          <p className="text-muted-foreground">
            Analise consolidada com dados das views SQL otimizadas
          </p>
        </div>
        <Activity className="h-8 w-8 text-primary" />
      </div>

      {/* Health Status Alert */}
      {healthSummary && (
        <Card className={
          healthLevel === 'healthy' ? 'border-green-500/50' : 
          healthLevel === 'unhealthy' ? 'border-red-500/50' : 
          'border-yellow-500/50'
        }>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Status de Saude dos Agentes</CardTitle>
              <Badge variant={
                healthLevel === 'healthy' ? 'default' : 
                healthLevel === 'unhealthy' ? 'destructive' : 
                'secondary'
              }>
                {healthLevel === 'healthy' ? 'Saudavel' : 
                 healthLevel === 'unhealthy' ? 'Critico' : 
                 healthLevel === 'warning' ? 'Atencao' : 'Sem Dados'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Total Agentes</span>
              <p className="text-lg font-semibold">{healthSummary.total_agents}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Ativos</span>
              <p className="text-lg font-semibold text-green-600">{healthSummary.active_agents}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Pendentes</span>
              <p className="text-lg font-semibold text-yellow-600">{healthSummary.pending_agents}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Travados</span>
              <p className="text-lg font-semibold text-red-600">{healthSummary.stuck_agents}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Taxa de Ativacao</span>
              <p className="text-lg font-semibold">{healthSummary.activation_rate_pct?.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso Global</CardTitle>
            {parseFloat(successRate) >= 80 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground">
              {totalMetrics?.successful_events} sucessos de {totalAttempts} eventos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Medio</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgInstallTime}s</div>
            <p className="text-xs text-muted-foreground">
              {parseFloat(avgInstallTime) < 60 ? "Performance excelente" : "Pode otimizar"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eventos com Falha</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMetrics?.failed_events || 0}</div>
            <p className="text-xs text-muted-foreground">
              {errors?.length || 0} tipos de erro unicos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Instalacoes Completas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMetrics?.total_installed || 0}</div>
            <p className="text-xs text-muted-foreground">
              {totalMetrics?.total_generated || 0} gerados, {totalMetrics?.total_copied || 0} copiados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Success vs Failure Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuicao de Sucesso/Falha</CardTitle>
            <CardDescription>Visao geral de todos os eventos</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={successPieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {successPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Platform Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuicao por Plataforma</CardTitle>
            <CardDescription>Eventos por sistema operacional</CardDescription>
          </CardHeader>
          <CardContent>
            {platformData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={platformData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {platformData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                Sem dados de plataforma
              </div>
            )}
          </CardContent>
        </Card>

        {/* Network Health */}
        <Card>
          <CardHeader>
            <CardTitle>Saude da Rede</CardTitle>
            <CardDescription>Conectividade durante instalacoes</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={networkHealthData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {networkHealthData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Platform Comparison */}
        {platformChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Comparacao entre Plataformas</CardTitle>
              <CardDescription>Metricas detalhadas por SO</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={platformChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                  <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="Taxa de Sucesso (%)" fill={COLORS.success} />
                  <Bar yAxisId="right" dataKey="Tempo Medio (s)" fill={COLORS.info} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Error Summary Section */}
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
                        <span className="text-muted-foreground truncate max-w-[70%]">
                          {err.error_message || 'Erro desconhecido'}
                        </span>
                        <Badge variant="outline" className="ml-2">
                          {err.error_count}x
                        </Badge>
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

      {/* Empty State */}
      {(!metrics || metrics.length === 0) && (!errors || errors.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Sem Dados de Metricas</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Ainda nao ha dados de instalacao suficientes. As metricas serao exibidas 
              apos as primeiras instalacoes de agentes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
