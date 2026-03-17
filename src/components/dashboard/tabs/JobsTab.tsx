import { useState, useMemo, memo } from "react";
import { Search, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getJobTypeLabel } from "@/lib/job-labels";
import { formatBrazilDateTime } from "@/lib/date-utils";
import { CSVExportButton } from "@/components/dashboard/CSVExportButton";
import type { DashboardJob } from "@/types/dashboard";

interface JobsTabProps {
  jobs: DashboardJob[];
  loading: boolean;
}

function JobsTabComponent({ jobs, loading }: JobsTabProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchesSearch = !search ||
        job.agent_name.toLowerCase().includes(search.toLowerCase()) ||
        job.type.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (statusFilter === "all") return true;
      return job.status === statusFilter;
    });
  }, [jobs, search, statusFilter]);

  const statusCounts = useMemo(() => ({
    completed: jobs.filter(j => j.status === "completed").length,
    failed: jobs.filter(j => j.status === "failed").length,
    queued: jobs.filter(j => j.status === "queued").length,
  }), [jobs]);

  return (
    <Card className="bg-gradient-card border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Verificações do Sistema</CardTitle>
          <CSVExportButton
            data={filteredJobs.map(j => ({
              agente: j.agent_name,
              tipo: getJobTypeLabel(j.type),
              status: j.status,
              criado: formatBrazilDateTime(j.created_at, 'short'),
              finalizado: j.completed_at ? formatBrazilDateTime(j.completed_at, 'short') : "",
            }))}
            filename="verificacoes"
            columns={[
              { key: "agente", label: "Agente" },
              { key: "tipo", label: "Tipo" },
              { key: "status", label: "Status" },
              { key: "criado", label: "Criado em" },
              { key: "finalizado", label: "Finalizado em" },
            ]}
          />
        </div>
        <CardDescription>Histórico e status das verificações executadas</CardDescription>
        {jobs.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por agente ou tipo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <div className="flex gap-1 flex-wrap">
              {([
                { key: "all", label: `Todos (${jobs.length})` },
                { key: "completed", label: `OK (${statusCounts.completed})` },
                { key: "failed", label: `Erro (${statusCounts.failed})` },
                { key: "queued", label: `Fila (${statusCounts.queued})` },
              ] as const).map(f => (
                <Button
                  key={f.key}
                  variant={statusFilter === f.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(f.key)}
                  className="text-xs h-9"
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
              <div className="space-y-2"><div className="flex gap-2"><Skeleton className="h-4 w-24 rounded-full" /><Skeleton className="h-4 w-32" /></div><Skeleton className="h-3 w-40" /></div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}</div>
        ) : filteredJobs.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {search || statusFilter !== "all" ? "Nenhum resultado encontrado" : "Nenhuma verificação encontrada"}
          </p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredJobs.map((job) => (
              <div key={job.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-secondary/30 rounded-lg border border-border gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
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

export default memo(JobsTabComponent);
