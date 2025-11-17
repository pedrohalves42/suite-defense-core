import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

interface RecentJobsActivityProps {
  tenantId?: string;
}

export function RecentJobsActivity({ tenantId }: RecentJobsActivityProps) {
  const { data: jobs = [] } = useQuery({
    queryKey: ['recent-jobs', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('id, type, status, agent_name, created_at, finished_at, error_message')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
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
      {jobs.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum job recente</p>
      )}
      {jobs.map((job) => (
        <div key={job.id} className="flex justify-between items-start text-sm border-b pb-2">
          <div className="flex-1">
            <div className="font-medium">
              {job.type} · {job.agent_name}
            </div>
            {job.error_message && (
              <div className="text-xs text-destructive mt-1">
                Erro: {job.error_message}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusColors[job.status as keyof typeof statusColors] || 'outline'}>
              {job.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {format(new Date(job.created_at), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
