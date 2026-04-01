import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useSystemOperations } from './useSystemOperations';
import { SummaryCards } from './SummaryCards';
import { EdgeFunctionStatsTable } from './EdgeFunctionStats';
import { StuckJobsTable } from './StuckJobsTable';
import { AutomationStatus } from './AutomationStatus';

export default function SystemOperations() {
  const {
    summary, stuckJobs, efStats, isLoading, jobSuccessRate,
    cleanupMutation, runCleanupMutation, handleRefresh,
  } = useSystemOperations();

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Operações do Sistema</h1>
          <p className="text-muted-foreground">Monitoramento de saúde, latência e automação</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => runCleanupMutation.mutate()} disabled={runCleanupMutation.isPending}>
            <Trash2 className={cn("h-4 w-4 mr-2", runCleanupMutation.isPending && "animate-pulse")} />
            {runCleanupMutation.isPending ? 'Limpando...' : 'Executar Limpeza'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />Atualizar
          </Button>
        </div>
      </div>

      <SummaryCards summary={summary} stuckJobs={stuckJobs} jobSuccessRate={jobSuccessRate} />
      <EdgeFunctionStatsTable stats={efStats} />
      <StuckJobsTable jobs={stuckJobs} onCleanup={() => cleanupMutation.mutate()} isPending={cleanupMutation.isPending} />
      <AutomationStatus />
    </div>
  );
}
