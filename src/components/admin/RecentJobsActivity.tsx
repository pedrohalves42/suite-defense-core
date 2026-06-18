import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { getJobTypeLabel, getJobStatusLabel } from '@/lib/job-labels';
import { formatBrazilDateTime } from '@/lib/date-utils';

interface RecentJobsActivityProps {
  tenantId?: string;
  loading?: boolean;  // V-502: Guard para sincronização de tenant
}

export function RecentJobsActivity({ tenantId, loading }: RecentJobsActivityProps) {
  const { data: jobs = [], isError, error, isLoading } = useQuery({
    queryKey: ['recent-jobs', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('jobs_normalized')
        .select('id, type, normalized_status, agent_name, created_at, completed_at, error_message, is_v3, duration_seconds, output')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !loading && !!tenantId,
    staleTime: 30_000,
  });

  const statusColors = {
    completed: 'default',
    failed: 'destructive',
    pending: 'secondary',
    delivered: 'outline',
    queued: 'secondary'
  } as const;

  return (
    <div className="space-y-2">
      {/* Wave 4 - B37: distinguish loading / error / empty states */}
      {(isLoading || loading) && (
        <p className="text-sm text-muted-foreground">Carregando jobs recentes…</p>
      )}
      {isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar jobs: {error instanceof Error ? error.message : 'desconhecido'}
        </p>
      )}
      {!isLoading && !isError && jobs.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum job recente</p>
      )}
      {jobs.map((job) => (
        <div key={job.id} className="flex justify-between items-start text-sm border-b pb-2">
          <div className="flex-1">
            <div className="font-medium flex items-center gap-2">
              <span>{getJobTypeLabel(job.type)} → {job.agent_name}</span>
              {job.is_v3 && (
                <Badge variant="outline" className="text-xs px-1 py-0">v3</Badge>
              )}
            </div>
            {job.error_message && (
              <div className="text-xs text-destructive mt-1">
                Erro: {job.error_message}
              </div>
            )}
            {job.duration_seconds !== null && job.duration_seconds !== undefined && (
              <div className="text-xs text-muted-foreground mt-1">
                Duracao: {job.duration_seconds}s
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusColors[job.normalized_status as keyof typeof statusColors] || 'outline'}>
              {getJobStatusLabel(job.normalized_status)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatBrazilDateTime(job.created_at, 'short')}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
