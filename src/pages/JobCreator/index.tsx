import { Zap, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JobCleanupDialog } from "@/components/jobs/JobCleanupDialog";
import { toast } from "sonner";
import { useJobCreator } from "./useJobCreator";
import { StatsCards } from "./StatsCards";
import { JobForm } from "./JobForm";
import { JobHistory } from "./JobHistory";

const JobCreator = () => {
  const {
    agents, recentJobs, loadingData, latestVersion,
    activeAgents, loadJobs, clearPendingJobs,
  } = useJobCreator();

  const handleClearPendingJobs = () => {
    const pendingCount = recentJobs.filter(j => j.status === 'queued').length;
    if (pendingCount === 0) { toast.info("Não há tarefas pendentes para limpar"); return; }
    if (confirm(`Limpar tarefas pendentes há mais de 1 hora? (${pendingCount} na fila atualmente)`)) {
      clearPendingJobs.mutate();
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
            <Zap className="h-8 w-8 text-primary animate-pulse-glow" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Central de Tarefas
            </h1>
            <p className="text-sm text-muted-foreground">Crie e gerencie tarefas para os computadores</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <JobCleanupDialog onCleanupComplete={loadJobs} />
          <Button onClick={handleClearPendingJobs} disabled={clearPendingJobs.isPending} variant="outline" className="gap-2">
            <Trash2 className="h-4 w-4" />
            {clearPendingJobs.isPending ? "Limpando..." : "Limpar Pendentes"}
          </Button>
        </div>
      </div>

      <StatsCards agents={agents} activeAgents={activeAgents} recentJobs={recentJobs} />

      <Tabs defaultValue="create" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="create">Criar Tarefa</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4">
          <JobForm agents={agents} activeAgents={activeAgents} latestVersion={latestVersion}
            loadingData={loadingData} onJobCreated={loadJobs} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <JobHistory recentJobs={recentJobs} loadingData={loadingData} />
        </TabsContent>
      </Tabs>

      {/* Trust Anchor */}
      <Card className="bg-muted/20 border-dashed">
        <CardContent className="py-4 text-center">
          <p className="text-sm text-muted-foreground">
            💡 As tarefas são enviadas automaticamente quando o computador se conecta.
            <br />
            <span className="text-primary font-medium">O status atualiza em tempo real.</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default JobCreator;
