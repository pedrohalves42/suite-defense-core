import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useJobsHealth } from '@/hooks/useJobsHealth';
import { 
  Cog, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

export function JobsHealthCard() {
  const { summary, isLoading, refetch } = useJobsHealth();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const successRate = summary.overallSuccessRate;
  const getSuccessRateColor = () => {
    if (successRate >= 95) return 'text-green-600 dark:text-green-400';
    if (successRate >= 80) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getSuccessRateBg = () => {
    if (successRate >= 95) return 'bg-green-500/10';
    if (successRate >= 80) return 'bg-amber-500/10';
    return 'bg-red-500/10';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Cog className="h-4 w-4 text-muted-foreground" />
            Saúde do Job Engine
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Success Rate */}
          <div className={cn("p-3 rounded-lg text-center", getSuccessRateBg())}>
            <div className={cn("text-2xl font-bold", getSuccessRateColor())}>
              {successRate}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Taxa de Sucesso
            </div>
          </div>

          {/* Completed */}
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <div className="flex items-center justify-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">{summary.completedJobs}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Concluídos
            </div>
          </div>

          {/* Failed */}
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <div className="flex items-center justify-center gap-1">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-2xl font-bold">{summary.failedJobs}</span>
              {summary.failedJobs > 0 && (
                <Badge variant="destructive" className="text-xs ml-1">!</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Falhos
            </div>
          </div>

          {/* Stuck */}
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <div className="flex items-center justify-center gap-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-2xl font-bold">{summary.stuckJobs}</span>
              {summary.stuckJobs > 0 && (
                <Badge variant="outline" className="text-xs ml-1 border-amber-500 text-amber-600">⚠</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Travados
            </div>
          </div>

          {/* Queued / Executing */}
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <div className="flex items-center justify-center gap-1">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="text-2xl font-bold">{summary.queuedJobs + summary.executingJobs}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Em Fila
            </div>
          </div>
        </div>

        {/* Warning Messages */}
        {(summary.stuckJobs > 0 || summary.failedJobs > 0) && (
          <div className="mt-4 space-y-2">
            {summary.stuckJobs > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2 rounded-md">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{summary.stuckJobs} job{summary.stuckJobs > 1 ? 's' : ''} travado{summary.stuckJobs > 1 ? 's' : ''} há mais de 1h</span>
              </div>
            )}
            {summary.failedJobs > 0 && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-500/10 p-2 rounded-md">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>{summary.failedJobs} job{summary.failedJobs > 1 ? 's' : ''} falhou{summary.failedJobs > 1 ? 'ram' : ''} recentemente</span>
              </div>
            )}
          </div>
        )}

        {/* Average Execution Time */}
        {summary.avgExecutionSeconds > 0 && (
          <div className="mt-4 text-xs text-muted-foreground text-center">
            Tempo médio de execução: {summary.avgExecutionSeconds}s
          </div>
        )}

        {/* Link to details */}
        <div className="mt-4 pt-3 border-t">
          <Link 
            to="/admin/jobs" 
            className="flex items-center justify-center gap-1 text-sm text-primary hover:underline"
          >
            Ver detalhes de Jobs
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
