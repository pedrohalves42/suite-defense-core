import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle, Clock, TrendingUp, RefreshCw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import { HelpTooltip } from '@/components/ui/tech-tooltip';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

interface PerformanceMetric {
  id: string;
  function_name: string;
  operation_type: 'edge_function' | 'database_query' | 'external_api';
  duration_ms: number;
  status_code: number | null;
  error_message: string | null;
  created_at: string;
}

interface MetricStats {
  avg_duration: number;
  max_duration: number;
  total_calls: number;
  error_count: number;
  slow_calls: number;
}

// Friendly color palette for charts
const CHART_COLORS = {
  primary: 'hsl(221, 83%, 53%)',    // Blue
  success: 'hsl(142, 76%, 36%)',    // Green  
  warning: 'hsl(38, 92%, 50%)',     // Amber
  danger: 'hsl(0, 72%, 51%)',       // Red
  info: 'hsl(199, 89%, 48%)',       // Cyan
  purple: 'hsl(262, 83%, 58%)',     // Purple
};

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function PerformanceMetrics() {
  const { data: metrics, isLoading: metricsLoading, refetch, isFetching } = useQuery({
    queryKey: ['performance-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance_metrics')
        .select('id, function_name, operation_type, duration_ms, status_code, error_message, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        logger.error('Failed to fetch performance metrics', error);
        throw error;
      }

      return data as PerformanceMetric[];
    },
    staleTime: 30000,
  });

  const calculateStats = (metrics: PerformanceMetric[]): MetricStats => {
    if (!metrics || metrics.length === 0) {
      return {
        avg_duration: 0,
        max_duration: 0,
        total_calls: 0,
        error_count: 0,
        slow_calls: 0,
      };
    }

    const durations = metrics.map((m) => m.duration_ms);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const max = Math.max(...durations);
    const errors = metrics.filter((m) => m.error_message !== null).length;
    const slow = metrics.filter((m) => m.duration_ms > 2000).length;

    return {
      avg_duration: Math.round(avg),
      max_duration: max,
      total_calls: metrics.length,
      error_count: errors,
      slow_calls: slow,
    };
  };

  const displayStats = metrics ? calculateStats(metrics) : null;

  // Group by operation type for pie chart
  const operationTypeData = metrics?.reduce((acc, m) => {
    const existing = acc.find(a => a.name === m.operation_type);
    if (existing) {
      existing.value++;
    } else {
      acc.push({ name: m.operation_type, value: 1 });
    }
    return acc;
  }, [] as { name: string; value: number }[]) || [];

  // Group by function for bar chart
  const functionData = metrics?.reduce((acc, m) => {
    const existing = acc.find(a => a.name === m.function_name);
    if (existing) {
      existing.calls++;
      existing.totalDuration += m.duration_ms;
      existing.avgDuration = Math.round(existing.totalDuration / existing.calls);
    } else {
      acc.push({ 
        name: m.function_name.slice(0, 20), 
        calls: 1, 
        totalDuration: m.duration_ms,
        avgDuration: m.duration_ms 
      });
    }
    return acc;
  }, [] as { name: string; calls: number; totalDuration: number; avgDuration: number }[])
  .sort((a, b) => b.calls - a.calls)
  .slice(0, 8) || [];

  const getOperationLabel = (type: string): string => {
    const labels: Record<string, string> = {
      edge_function: 'Função do Sistema',
      database_query: 'Consulta ao Banco',
      external_api: 'API Externa',
    };
    return labels[type] || type;
  };

  const getOperationBadge = (type: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      edge_function: 'default',
      database_query: 'secondary',
      external_api: 'outline',
    };
    return <Badge variant={variants[type] || 'outline'}>{getOperationLabel(type)}</Badge>;
  };

  const getDurationBadge = (duration: number) => {
    if (duration > 2000) {
      return <Badge variant="destructive" className="font-mono">{duration}ms</Badge>;
    }
    if (duration > 1000) {
      return <Badge variant="warning" className="font-mono">{duration}ms</Badge>;
    }
    return <Badge variant="success" className="font-mono">{duration}ms</Badge>;
  };

  if (metricsLoading) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Métricas de Desempenho</h1>
          <p className="text-muted-foreground">Acompanhe a velocidade e saúde do sistema</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[80px]" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-7 w-7 text-yellow-500" />
            Métricas de Desempenho
            <HelpTooltip term="performance metrics" />
          </h1>
          <p className="text-muted-foreground">Acompanhe a velocidade e saúde do sistema</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Summary Cards */}
      {displayStats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1">
                  Tempo de Resposta Médio
                  <HelpTooltip term="response time" />
                </CardTitle>
                <Clock className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{displayStats.avg_duration}ms</div>
                <p className="text-xs text-muted-foreground">Média de todas as operações</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-l-4 border-l-amber-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tempo Máximo</CardTitle>
                <TrendingUp className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{displayStats.max_duration}ms</div>
                <p className="text-xs text-muted-foreground">Operação mais lenta</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Chamadas</CardTitle>
                <Activity className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{displayStats.total_calls}</div>
                <p className="text-xs text-muted-foreground">Últimas 100 operações</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className={cn(
              "border-l-4",
              displayStats.slow_calls > 0 ? "border-l-red-500" : "border-l-green-500"
            )}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Operações Lentas</CardTitle>
                <AlertTriangle className={cn(
                  "h-4 w-4",
                  displayStats.slow_calls > 0 ? "text-red-500" : "text-green-500"
                )} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {displayStats.slow_calls}
                  {displayStats.slow_calls > 0 && (
                    <span className="text-sm font-normal text-destructive ml-2">
                      ({Math.round((displayStats.slow_calls / displayStats.total_calls) * 100)}%)
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Acima de 2 segundos</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Charts Row */}
      {metrics && metrics.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Function calls bar chart */}
          <Card>
            <CardHeader>
              <CardTitle>Chamadas por Função</CardTitle>
              <CardDescription>Top 8 funções por volume de chamadas</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={functionData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number, name: string) => [
                      name === 'calls' ? `${value} chamadas` : `${value}ms`,
                      name === 'calls' ? 'Chamadas' : 'Tempo Médio'
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="calls" fill={CHART_COLORS.primary} name="Chamadas" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgDuration" fill={CHART_COLORS.success} name="Tempo Médio (ms)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Operation type pie chart */}
          <Card>
            <CardHeader>
              <CardTitle>Distribuição por Tipo</CardTitle>
              <CardDescription>Tipos de operação executados</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={operationTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${getOperationLabel(name)} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {operationTypeData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number, name: string) => [value, getOperationLabel(name)]}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Operations */}
      <Card>
        <CardHeader>
          <CardTitle>Operações Recentes</CardTitle>
          <CardDescription>Últimas 100 métricas de desempenho</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics && metrics.length > 0 ? (
            <div className="space-y-3">
              {metrics.slice(0, 20).map((metric) => (
                <div
                  key={metric.id}
                  className="flex items-center justify-between border-b border-border/50 pb-3 last:border-0"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{metric.function_name}</span>
                      {getOperationBadge(metric.operation_type)}
                      {metric.error_message && (
                        <Badge variant="destructive">Erro</Badge>
                      )}
                    </div>
                    {metric.error_message && (
                      <p className="text-xs text-destructive">{metric.error_message}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatBrazilDateTime(metric.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getDurationBadge(metric.duration_ms)}
                    {metric.status_code && (
                      <Badge
                        variant={metric.status_code >= 400 ? 'destructive' : 'outline'}
                      >
                        {metric.status_code}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Activity}
              title="Nenhuma métrica disponível"
              description="As métricas de desempenho serão coletadas automaticamente conforme o sistema processa requisições."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
