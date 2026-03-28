import { Server, Sparkles, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Agent, Job } from "./types";

interface StatsCardsProps {
  agents: Agent[];
  activeAgents: Agent[];
  recentJobs: Job[];
}

export function StatsCards({ agents, activeAgents, recentJobs }: StatsCardsProps) {
  const pendingJobs = recentJobs.filter(j => j.status === 'queued').length;
  const completedJobs = recentJobs.filter(j => j.status === 'completed').length;
  const failedJobs = recentJobs.filter(j => j.status === 'failed').length;

  return (
    <>
      {/* Global Status */}
      <Card className={cn(
        "border-2 transition-all",
        pendingJobs === 0 && failedJobs === 0
          ? "bg-success/5 border-success/30"
          : failedJobs > 0
            ? "bg-destructive/5 border-destructive/30"
            : pendingJobs > 5
              ? "bg-warning/5 border-warning/30"
              : "bg-primary/5 border-primary/30"
      )}>
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-4">
            <div className="text-5xl">
              {pendingJobs === 0 && failedJobs === 0 ? '🟢' :
               failedJobs > 0 ? '🔴' :
               pendingJobs > 5 ? '🟡' : '🔵'}
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold">
                {pendingJobs === 0 && failedJobs === 0
                  ? 'Todas as Tarefas em Dia'
                  : failedJobs > 0
                    ? `${failedJobs} Tarefa(s) com Erro`
                    : pendingJobs > 5
                      ? `${pendingJobs} Tarefas Aguardando`
                      : 'Sistema Operando Normalmente'}
              </h2>
              <p className="text-muted-foreground">
                {activeAgents.length} de {agents.length} computadores online • {completedJobs} tarefas concluídas
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={cn(
          "bg-gradient-card transition-all",
          activeAgents.length === agents.length && agents.length > 0
            ? "border-success/30"
            : activeAgents.length / agents.length >= 0.8
              ? "border-primary/20"
              : "border-warning/30"
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />Computadores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{agents.length}</div>
            <p className={cn("text-xs mt-1",
              activeAgents.length === agents.length && agents.length > 0 ? "text-success" : "text-muted-foreground"
            )}>
              {activeAgents.length === agents.length && agents.length > 0
                ? `✓ Todos online (${activeAgents.length})`
                : `${activeAgents.length} online`}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card border-accent/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4" />Tarefas Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{recentJobs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">últimas 20 tarefas</p>
          </CardContent>
        </Card>

        <Card className={cn(
          "bg-gradient-card transition-all",
          pendingJobs === 0 ? "border-success/30" : pendingJobs > 5 ? "border-warning/30" : "border-primary/20"
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{pendingJobs}</div>
            <p className={cn("text-xs mt-1", pendingJobs === 0 ? "text-success" : "text-muted-foreground")}>
              {pendingJobs === 0 ? '✓ Nenhuma pendente' : 'aguardando execução'}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
