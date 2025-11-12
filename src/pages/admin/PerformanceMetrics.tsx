import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import { logger } from '@/lib/logger';

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

export default function PerformanceMetrics() {
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['performance-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance_metrics')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        logger.error('Failed to fetch performance metrics', error);
        throw error;
      }

      return data as PerformanceMetric[];
    },
    staleTime: 30000, // 30 seconds
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

  const getOperationBadge = (type: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      edge_function: 'default',
      database_query: 'secondary',
      external_api: 'outline',
    };
    return <Badge variant={variants[type] || 'outline'}>{type}</Badge>;
  };

  const getDurationBadge = (duration: number) => {
    if (duration > 2000) {
      return <Badge variant="destructive">{duration}ms</Badge>;
    }
    if (duration > 1000) {
      return <Badge variant="secondary">{duration}ms</Badge>;
    }
    return <Badge variant="outline">{duration}ms</Badge>;
  };

  if (metricsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Performance Metrics</h1>
          <p className="text-muted-foreground">Monitor application performance and response times</p>
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Performance Metrics</h1>
        <p className="text-muted-foreground">Monitor application performance and response times</p>
      </div>

      {displayStats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{displayStats.avg_duration}ms</div>
              <p className="text-xs text-muted-foreground">Average across all calls</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Max Response Time</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{displayStats.max_duration}ms</div>
              <p className="text-xs text-muted-foreground">Slowest operation recorded</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{displayStats.total_calls}</div>
              <p className="text-xs text-muted-foreground">Last 100 operations</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Slow Operations</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
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
              <p className="text-xs text-muted-foreground">Operations &gt;2s</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Operations</CardTitle>
          <CardDescription>Latest 100 performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {metrics && metrics.length > 0 ? (
              metrics.map((metric) => (
                <div
                  key={metric.id}
                  className="flex items-center justify-between border-b pb-3 last:border-0"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{metric.function_name}</span>
                      {getOperationBadge(metric.operation_type)}
                      {metric.error_message && (
                        <Badge variant="destructive">Error</Badge>
                      )}
                    </div>
                    {metric.error_message && (
                      <p className="text-xs text-destructive">{metric.error_message}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(metric.created_at).toLocaleString()}
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
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No performance metrics available yet
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
