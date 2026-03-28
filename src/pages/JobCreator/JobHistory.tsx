import { Zap, Plus, CheckCircle, XCircle, Clock, Server } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBrazilDateTime } from "@/lib/date-utils";
import { getJobTypeLabel, getJobStatusLabel } from "@/lib/job-labels";
import { getAgentDisplayName } from "@/lib/agent-utils";
import type { Job } from "./types";

interface JobHistoryProps {
  recentJobs: Job[];
  loadingData: boolean;
}

function getStatusBadge(status: string) {
  const variants: Record<string, { color: string; icon: React.ComponentType<{ className?: string }> }> = {
    queued: { color: "bg-warning/20 text-warning border-warning/30", icon: Clock },
    delivered: { color: "bg-primary/20 text-primary border-primary/30", icon: Server },
    completed: { color: "bg-success/20 text-success border-success/30", icon: CheckCircle },
    failed: { color: "bg-destructive/20 text-destructive border-destructive/30", icon: XCircle }
  };

  const variant = variants[status] || variants.queued;
  const Icon = variant.icon;

  return (
    <Badge variant="outline" className={`${variant.color} gap-1`}>
      <Icon className="h-3 w-3" />
      {getJobStatusLabel(status)}
    </Badge>
  );
}

export function JobHistory({ recentJobs, loadingData }: JobHistoryProps) {
  return (
    <Card className="bg-gradient-card border-accent/20">
      <CardHeader>
        <CardTitle>Histórico de Tarefas</CardTitle>
        <CardDescription>Últimas 50 tarefas criadas no sistema</CardDescription>
      </CardHeader>
      <CardContent>
        {loadingData ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : recentJobs.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="h-12 w-12 text-success mx-auto mb-4 opacity-70" />
            <p className="text-lg font-medium">Nenhuma tarefa criada ainda</p>
            <p className="text-sm text-muted-foreground mt-1">
              Crie sua primeira tarefa na aba "Criar Tarefa" para começar
            </p>
            <Button className="mt-4" variant="default" onClick={() => {
              const tabElement = document.querySelector('[data-state="inactive"][value="create"]');
              if (tabElement) (tabElement as HTMLElement).click();
            }}>
              <Plus className="mr-2 h-4 w-4" /> Criar Primeira Tarefa
            </Button>
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {recentJobs.map((job) => (
              <div key={job.id}
                className="flex items-center justify-between p-4 bg-card border rounded-lg hover:bg-accent/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusBadge(job.status)}
                    <span className="font-medium truncate">
                      {getAgentDisplayName({ agent_name: job.agent_name } as { agent_name: string; hostname?: string | null; display_name?: string | null })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3" />{getJobTypeLabel(job.type)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />{formatBrazilDateTime(job.created_at, 'short')}
                    </span>
                    {job.is_recurring && (
                      <Badge variant="outline" className="text-xs">🔄 Recorrente</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
