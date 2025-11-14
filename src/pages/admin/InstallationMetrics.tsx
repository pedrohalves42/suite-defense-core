import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle2, Clock, AlertTriangle, TrendingUp, TrendingDown, Server, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts';
import { Badge } from "@/components/ui/badge";

const COLORS = {
  success: 'hsl(var(--success))',
  failed: 'hsl(var(--destructive))',
  warning: 'hsl(var(--warning))',
  info: 'hsl(var(--primary))',
  windows: 'hsl(var(--primary))',
  linux: 'hsl(var(--accent))'
};

interface AgentInstallationMetrics {
  date: string;
  tenant_id: string;
  platform: string;
  total_attempts: number;
  successful_installs: number;
  failed_installs: number;
  success_rate_pct: number;
  avg_install_time_sec: number;
  windows_count: number;
  linux_count: number;
  network_ok: number;
  network_failed: number;
  verified_count: number;
  unverified_count: number;
  windows_ps1_installs: number;
  linux_bash_installs: number;
}

interface InstallationErrorSummary {
  tenant_id: string;
  platform: string;
  error_message: string;
  occurrence_count: number;
  percentage_of_failures: number;
  last_seen: string;
  first_seen: string;
  affected_agents: string[];
  unique_agents_affected: number;
}

interface InstallationHealthStatus {
  tenant_id: string;
  attempts_24h: number;
  success_24h: number;
  failed_24h: number;
  failure_rate_24h_pct: number;
  health_status: string;
  last_installation_at: string;
}

export default function InstallationMetrics() {
  const { toast } = useToast();

  // Query para métricas consolidadas
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['agent-installation-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_installation_metrics' as any)
        .select('*')
        .order('date', { ascending: false })
        .limit(90);

      if (error) throw error;
      return data as unknown as AgentInstallationMetrics[];
    }
  });

  // Query para resumo de erros
  const { data: errors, isLoading: errorsLoading } = useQuery({
    queryKey: ['installation-error-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installation_error_summary' as any)
        .select('*')
        .limit(20);

      if (error) throw error;
      return data as unknown as InstallationErrorSummary[];
    }
  });

  // Query para status de saúde
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

  // Agregar métricas globais
  const totalMetrics = metrics?.reduce((acc, curr) => ({
    total_attempts: acc.total_attempts + curr.total_attempts,
    successful_installs: acc.successful_installs + curr.successful_installs,
    failed_installs: acc.failed_installs + curr.failed_installs,
    avg_install_time_sec: acc.avg_install_time_sec + curr.avg_install_time_sec,
    windows_count: acc.windows_count + curr.windows_count,
    linux_count: acc.linux_count + curr.linux_count,
    network_ok: acc.network_ok + curr.network_ok,
    network_failed: acc.network_failed + curr.network_failed,
    verified_count: acc.verified_count + curr.verified_count,
    unverified_count: acc.unverified_count + curr.unverified_count
  }), {
    total_attempts: 0,
    successful_installs: 0,
    failed_installs: 0,
    avg_install_time_sec: 0,
    windows_count: 0,
    linux_count: 0,
    network_ok: 0,
    network_failed: 0,
    verified_count: 0,
    unverified_count: 0
  });

  const successRate = totalMetrics && totalMetrics.total_attempts > 0
    ? ((totalMetrics.successful_installs / totalMetrics.total_attempts) * 100).toFixed(1)
    : '0';

  const avgInstallTime = metrics && metrics.length > 0
    ? (totalMetrics!.avg_install_time_sec / metrics.length).toFixed(1)
    : '0';

  // Preparar dados para gráficos
  const platformData = [
    { name: 'Windows', value: totalMetrics?.windows_count || 0, color: COLORS.windows },
    { name: 'Linux', value: totalMetrics?.linux_count || 0, color: COLORS.linux }
  ];

  const successPieData = [
    { name: 'Sucesso', value: totalMetrics?.successful_installs || 0, color: COLORS.success },
    { name: 'Falha', value: totalMetrics?.failed_installs || 0, color: COLORS.failed }
  ];

  const networkHealthData = [
    { name: 'Conexão OK', value: totalMetrics?.network_ok || 0, color: COLORS.success },
    { name: 'Sem Conexão', value: totalMetrics?.network_failed || 0, color: COLORS.failed }
  ];

  // Dados de timeline (últimos 30 dias)
  const timelineData = metrics
    ?.slice(0, 30)
    .reverse()
    .map(m => ({
      date: new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      taxa: m.success_rate_pct,
      sucessos: m.successful_installs,
      falhas: m.failed_installs,
      tempo: m.avg_install_time_sec
    })) || [];

  // Platform comparison
  const platformComparison = metrics?.reduce((acc, curr) => {
    if (!acc[curr.platform]) {
      acc[curr.platform] = { total: 0, success: 0, failed: 0, avgTime: 0, count: 0 };
    }
    acc[curr.platform].total += curr.total_attempts;
    acc[curr.platform].success += curr.successful_installs;
    acc[curr.platform].failed += curr.failed_installs;
    acc[curr.platform].avgTime += curr.avg_install_time_sec;
    acc[curr.platform].count += 1;
    return acc;
  }, {} as Record<string, { total: number; success: number; failed: number; avgTime: number; count: number }>);

  const platformChartData = Object.entries(platformComparison || {}).map(([name, stats]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    'Taxa de Sucesso (%)': ((stats.success / stats.total) * 100).toFixed(1),
    'Tempo Médio (s)': (stats.avgTime / stats.count).toFixed(1),
    Sucessos: stats.success,
    Falhas: stats.failed
  }));

  // Consolidar erros por plataforma
  const errorsByPlatform = errors?.reduce((acc, err) => {
    if (!acc[err.platform]) {
      acc[err.platform] = [];
    }
    acc[err.platform].push(err);
    return acc;
  }, {} as Record<string, InstallationErrorSummary[]>);

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
          <h1 className="text-3xl font-bold tracking-tight">Métricas de Instalação</h1>
          <p className="text-muted-foreground">
            Análise consolidada com dados das views SQL otimizadas
          </p>
        </div>
        <Activity className="h-8 w-8 text-primary" />
      </div>

      {/* Health Status Alerts */}
      {healthStatus && healthStatus.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {healthStatus.map((health) => (
            <Card key={health.tenant_id} className={
              health.health_status === 'healthy' ? 'border-green-500/50' : 
              health.health_status === 'unhealthy' ? 'border-red-500/50' : 
              'border-yellow-500/50'
            }>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Status de Saúde (24h)</CardTitle>
                  <Badge variant={
                    health.health_status === 'healthy' ? 'default' : 
                    health.health_status === 'unhealthy' ? 'destructive' : 
                    'secondary'
                  }>
                    {health.health_status === 'healthy' ? 'Saudável' : 
                     health.health_status === 'unhealthy' ? 'Crítico' : 
                     'Sem Dados'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Taxa de Falha:</span>
                  <span className="font-medium">{health.failure_rate_24h_pct}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tentativas:</span>
                  <span className="font-medium">{health.attempts_24h}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Sucessos:</span>
                  <span className="font-medium text-green-600">{health.success_24h}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Falhas:</span>
                  <span className="font-medium text-red-600">{health.failed_24h}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
              {totalMetrics?.successful_installs} de {totalMetrics?.total_attempts} instalações
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
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
            <CardTitle className="text-sm font-medium">Instalações com Falha</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMetrics?.failed_installs}</div>
            <p className="text-xs text-muted-foreground">
              {errors?.length || 0} tipos de erro únicos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verificação HMAC</CardTitle>
            <Zap className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMetrics?.verified_count}</div>
            <p className="text-xs text-muted-foreground">
              {totalMetrics?.unverified_count} não verificados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Success vs Failure Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Sucesso/Falha</CardTitle>
            <CardDescription>Visão geral de todas as instalações</CardDescription>
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
            <CardTitle>Distribuição por Plataforma</CardTitle>
            <CardDescription>Windows vs Linux</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Timeline Chart */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Tendência de Taxa de Sucesso (Últimos 30 Dias)</CardTitle>
            <CardDescription>Evolução temporal da taxa de sucesso</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="colorTaxa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={COLORS.success} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="taxa" 
                  stroke={COLORS.success} 
                  fillOpacity={1} 
                  fill="url(#colorTaxa)" 
                  name="Taxa de Sucesso (%)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Platform Comparison */}
        {platformChartData.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Comparação entre Plataformas</CardTitle>
              <CardDescription>Métricas detalhadas por sistema operacional</CardDescription>
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
                  <Bar yAxisId="right" dataKey="Tempo Médio (s)" fill={COLORS.info} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Network Health */}
        <Card>
          <CardHeader>
            <CardTitle>Saúde da Rede</CardTitle>
            <CardDescription>Conectividade durante instalações</CardDescription>
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

        {/* Installation Time Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Tempo de Instalação</CardTitle>
            <CardDescription>Evolução do tempo médio (últimos 30 dias)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="tempo" 
                  stroke={COLORS.info} 
                  strokeWidth={2}
                  name="Tempo (s)"
                  dot={{ fill: COLORS.info }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Error Summary Section */}
      {errors && errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resumo de Erros Mais Comuns</CardTitle>
            <CardDescription>
              Top {errors.length} erros identificados com maior ocorrência
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(errorsByPlatform || {}).map(([platform, platformErrors]) => (
                <div key={platform} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    <h3 className="font-semibold text-sm uppercase">{platform}</h3>
                  </div>
                  <div className="space-y-2">
                    {platformErrors.slice(0, 5).map((error, idx) => (
                      <div 
                        key={idx}
                        className="border rounded-lg p-3 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <p className="text-sm font-medium flex-1">
                            {error.error_message.substring(0, 100)}
                            {error.error_message.length > 100 && '...'}
                          </p>
                          <Badge variant="destructive" className="ml-2">
                            {error.occurrence_count}x
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{error.percentage_of_failures.toFixed(1)}% das falhas</span>
                          <span>•</span>
                          <span>{error.unique_agents_affected} agentes afetados</span>
                          <span>•</span>
                          <span>Última vez: {new Date(error.last_seen).toLocaleDateString('pt-BR')}</span>
                        </div>
                        {error.affected_agents && error.affected_agents.length > 0 && (
                          <div className="mt-2 pt-2 border-t">
                            <p className="text-xs text-muted-foreground">
                              Agentes: {error.affected_agents.slice(0, 3).join(', ')}
                              {error.affected_agents.length > 3 && ` +${error.affected_agents.length - 3} mais`}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {(!metrics || metrics.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum dado disponível</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              As métricas consolidadas aparecerão aqui assim que houver instalações registradas.
              Gere uma nova enrollment key e execute uma instalação para popular os dados.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
