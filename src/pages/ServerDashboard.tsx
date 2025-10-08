import { useState, useEffect } from "react";
import { Shield, Server, Users, Briefcase, FileText, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Agent {
  id: string;
  agent_name: string;
  status: string;
  enrolled_at: string;
  last_heartbeat: string | null;
  tenant_id: string;
}

interface Job {
  id: string;
  agent_name: string;
  type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface Report {
  id: string;
  agent_name: string;
  kind: string;
  file_path: string;
  created_at: string;
}

const ServerDashboard = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const [agentsRes, jobsRes, reportsRes] = await Promise.all([
        supabase.from("agents").select("*").order("enrolled_at", { ascending: false }),
        supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(50),
      ]);

      if (agentsRes.data) setAgents(agentsRes.data);
      if (jobsRes.data) setJobs(jobsRes.data);
      if (reportsRes.data) setReports(reportsRes.data);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const downloadInstaller = () => {
    window.open("/agent-installer", "_blank");
  };

  const activeAgents = agents.filter(a => {
    if (!a.last_heartbeat) return false;
    const lastHeartbeat = new Date(a.last_heartbeat);
    const now = new Date();
    return (now.getTime() - lastHeartbeat.getTime()) < 5 * 60 * 1000; // 5 minutos
  });

  const pendingJobs = jobs.filter(j => j.status === "queued").length;
  const completedJobs = jobs.filter(j => j.status === "done").length;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
              <Server className="h-8 w-8 text-primary animate-pulse-glow" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Servidor Principal
              </h1>
              <p className="text-sm text-muted-foreground">Painel Administrativo do Sistema</p>
            </div>
          </div>
          
          <Button onClick={downloadInstaller} className="gap-2">
            <Download className="h-4 w-4" />
            Criar Instalador de Agente
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Agentes Totais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{agents.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {activeAgents.length} ativos
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-accent/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-accent" />
                Agentes Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{activeAgents.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Últimos 5 minutos
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-warning/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-warning" />
                Jobs Pendentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{pendingJobs}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {completedJobs} concluídos
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-success/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-success" />
                Relatórios
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{reports.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Últimos 50
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="agents" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-secondary">
            <TabsTrigger value="agents">Agentes</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="reports">Relatórios</TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="mt-4">
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle>Agentes Registrados</CardTitle>
                <CardDescription>Lista completa de agentes matriculados no sistema</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-8">Carregando...</p>
                ) : agents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum agente registrado</p>
                ) : (
                  <div className="space-y-2">
                    {agents.map((agent) => {
                      const isActive = agent.last_heartbeat && 
                        (new Date().getTime() - new Date(agent.last_heartbeat).getTime()) < 5 * 60 * 1000;
                      
                      return (
                        <div
                          key={agent.id}
                          className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border hover:border-primary/30 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-success animate-pulse' : 'bg-muted'}`} />
                            <div>
                              <p className="font-mono font-semibold text-foreground">{agent.agent_name}</p>
                              <p className="text-xs text-muted-foreground">
                                Tenant: {agent.tenant_id}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant={isActive ? "default" : "secondary"}>
                              {agent.status}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {agent.last_heartbeat 
                                ? `Último: ${new Date(agent.last_heartbeat).toLocaleString()}`
                                : "Sem heartbeat"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs" className="mt-4">
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle>Jobs do Sistema</CardTitle>
                <CardDescription>Histórico e status dos jobs executados</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-8">Carregando...</p>
                ) : jobs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum job encontrado</p>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {jobs.map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {job.type}
                            </Badge>
                            <span className="text-sm font-mono text-foreground">{job.agent_name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Criado: {new Date(job.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge 
                            variant={
                              job.status === "done" ? "default" :
                              job.status === "delivered" ? "secondary" :
                              "outline"
                            }
                          >
                            {job.status}
                          </Badge>
                          {job.completed_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Concluído: {new Date(job.completed_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle>Relatórios Recebidos</CardTitle>
                <CardDescription>Relatórios de segurança enviados pelos agentes</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-8">Carregando...</p>
                ) : reports.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum relatório encontrado</p>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {reports.map((report) => (
                      <div
                        key={report.id}
                        className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {report.kind}
                            </Badge>
                            <span className="text-sm font-mono text-foreground">{report.agent_name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {report.file_path}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(report.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ServerDashboard;
