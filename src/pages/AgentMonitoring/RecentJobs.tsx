import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity } from 'lucide-react';
import { getJobTypeLabel } from '@/lib/job-labels';
import { formatBrazilDateTime } from '@/lib/date-utils';
import type { Job } from './types';

function getJobStatusBadge(status: string) {
  switch (status) {
    case 'done':
    case 'completed':
      return <Badge className="bg-green-500">✓ Concluído</Badge>;
    case 'queued':
      return <Badge className="bg-blue-500">⏳ Na Fila</Badge>;
    case 'delivered':
      return <Badge className="bg-yellow-500">⚙️ Executando</Badge>;
    case 'failed':
      return <Badge variant="destructive">❌ Falhou</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

interface RecentJobsProps {
  recentJobs: Job[];
}

export function RecentJobs({ recentJobs }: RecentJobsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Tarefas Recentes
        </CardTitle>
        <CardDescription>Últimas 10 tarefas executadas pelo sistema</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {recentJobs.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">Nenhuma tarefa executada ainda</p>
              <p className="text-xs text-muted-foreground/70 mt-1">As tarefas aparecerão aqui conforme forem executadas</p>
            </div>
          ) : (
            recentJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
              >
                <div>
                  <p className="font-medium text-sm">{getJobTypeLabel(job.type)}</p>
                  <p className="text-xs text-muted-foreground">
                    Computador: {job.agent_name} • {formatBrazilDateTime(job.created_at, 'short')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {getJobStatusBadge(job.status)}
                  {job.completed_at && (
                    <span className="text-xs text-muted-foreground">
                      {Math.round((new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()) / 1000)}s
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
