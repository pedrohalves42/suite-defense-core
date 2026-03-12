import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getJobTypeLabel } from "@/lib/job-labels";
import { formatBrazilDateTime } from "@/lib/date-utils";
import type { DashboardJob } from "@/hooks/useDashboardData";

interface JobsTabProps {
  jobs: DashboardJob[];
  loading: boolean;
}

export default function JobsTab({ jobs, loading }: JobsTabProps) {
  return (
    <Card className="bg-gradient-card border-primary/20">
      <CardHeader>
        <CardTitle>Verificações do Sistema</CardTitle>
        <CardDescription>Histórico e status das verificações executadas</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
              <div className="space-y-2"><div className="flex gap-2"><Skeleton className="h-4 w-24 rounded-full" /><Skeleton className="h-4 w-32" /></div><Skeleton className="h-3 w-40" /></div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}</div>
        ) : jobs.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhuma verificação encontrada</p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {jobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{getJobTypeLabel(job.type)}</Badge>
                    <span className="text-sm font-mono text-foreground">{job.agent_name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Iniciado: {formatBrazilDateTime(job.created_at, 'short')}</p>
                </div>
                <div className="text-right">
                  <Badge variant={
                    job.status === "completed" ? "default" :
                    job.status === "delivered" ? "secondary" :
                    job.status === "failed" ? "destructive" : "outline"
                  }>
                    {job.status === "completed" ? "Concluída" :
                     job.status === "delivered" ? "Entregue" :
                     job.status === "failed" ? "Com erro" :
                     job.status === "queued" ? "Aguardando" : job.status}
                  </Badge>
                  {job.completed_at && (
                    <p className="text-xs text-muted-foreground mt-1">Finalizado: {formatBrazilDateTime(job.completed_at, 'short')}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
