import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CronHealthEntry {
  cron_name: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  consecutive_failures: number | null;
  status: string | null;
  last_error: string | null;
}

/**
 * CronHealthAlert — OP-006 mitigation
 * Read-only component showing cron job health status.
 */
export function CronHealthAlert() {
  const { tenant } = useTenant();

  const { data: cronJobs, isLoading, refetch } = useQuery({
    queryKey: ['cron-health', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cron_health')
        .select('cron_name, last_success_at, last_failure_at, consecutive_failures, status, last_error')
        .order('cron_name');

      if (error) throw error;
      return (data || []) as unknown as CronHealthEntry[];
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });

  const unhealthyJobs = cronJobs?.filter(j => (j.consecutive_failures || 0) > 0 || j.status === 'failing') || [];
  const healthyJobs = cronJobs?.filter(j => (j.consecutive_failures || 0) === 0 && j.status !== 'failing') || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    );
  }

  if (!cronJobs?.length) return null;

  return (
    <Card className={unhealthyJobs.length > 0 ? 'border-destructive/50' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {unhealthyJobs.length > 0 ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            )}
            <CardTitle className="text-base">Saúde dos Cron Jobs</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          {unhealthyJobs.length > 0
            ? `${unhealthyJobs.length} job(s) com problemas detectados`
            : `Todos os ${healthyJobs.length} jobs operando normalmente`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {unhealthyJobs.map((job) => (
          <div key={job.cron_name} className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div className="min-w-0">
                <span className="font-mono text-sm">{job.cron_name}</span>
                {job.last_error && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{job.last_error}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {job.last_failure_at && (
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(job.last_failure_at), { locale: ptBR, addSuffix: true })}
                </span>
              )}
              <Badge variant="destructive">
                {job.consecutive_failures || 0}× falha
              </Badge>
            </div>
          </div>
        ))}
        {healthyJobs.map((job) => (
          <div key={job.cron_name} className="flex items-center justify-between rounded-md border p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              <span className="font-mono text-sm">{job.cron_name}</span>
            </div>
            <div className="flex items-center gap-2">
              {job.last_success_at && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(job.last_success_at), { locale: ptBR, addSuffix: true })}
                </span>
              )}
              <Badge variant="secondary">OK</Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
