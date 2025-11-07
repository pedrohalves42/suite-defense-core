import { useState, useEffect } from "react";
import { Shield, Server, Users, Briefcase, FileText, Download, Activity, TrendingUp, AlertCircle, Network, Zap, Clock, ShieldAlert, Key } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogoutButton } from "@/components/LogoutButton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";

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

interface AgentToken {
  id: string;
  agent_id: string;
  token: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  agents: {
    agent_name: string;
  };
}

interface RateLimit {
  id: string;
  identifier: string;
  endpoint: string;
  request_count: number;
  window_start: string;
  last_request_at: string;
  blocked_until: string | null;
}

const ServerDashboard = () => {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [agentTokens, setAgentTokens] = useState<AgentToken[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimit[]>([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<number>(0);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 10000);
    
    // Realtime subscription para agentes
    const agentsChannel = supabase
      .channel('agents-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => {
        loadDashboardData();
      })
      .subscribe();

    // Realtime subscription para jobs
    const jobsChannel = supabase
      .channel('jobs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => {
        loadDashboardData();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(agentsChannel);
      supabase.removeChannel(jobsChannel);
    };
  }, []);

  const loadDashboardData = async () => {
    try {
      const [agentsRes, jobsRes, reportsRes, tokensRes, rateLimitsRes] = await Promise.all([
        supabase.from("agents").select("*").order("enrolled_at", { ascending: false }),
        supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("agent_tokens").select("*, agents(agent_name)").order("created_at", { ascending: false }),
        supabase.from("rate_limits").select("*").order("last_request_at", { ascending: false }).limit(100),
      ]);

      if (agentsRes.data) {
        setAgents(agentsRes.data);
        // Calcular alertas (agentes inativos)
        const inactiveCount = agentsRes.data.filter(a => {
          if (!a.last_heartbeat) return true;
          const lastHeartbeat = new Date(a.last_heartbeat);
          return (new Date().getTime() - lastHeartbeat.getTime()) > 5 * 60 * 1000;
        }).length;
        setAlerts(inactiveCount);
      }
      if (jobsRes.data) setJobs(jobsRes.data);
      if (reportsRes.data) setReports(reportsRes.data);
      if (tokensRes.data) setAgentTokens(tokensRes.data as AgentToken[]);
      if (rateLimitsRes.data) setRateLimits(rateLimitsRes.data);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados do dashboard");
    } finally {
      setLoading(false);
    }
  };

  const activeAgents = agents.filter(a => {
    if (!a.last_heartbeat) return false;
    const lastHeartbeat = new Date(a.last_heartbeat);
    const now = new Date();
    return (now.getTime() - lastHeartbeat.getTime()) < 5 * 60 * 1000;
  });

  const pendingJobs = jobs.filter(j => j.status === "queued").length;
  const completedJobs = jobs.filter(j => j.status === "done").length;
  const failedJobs = jobs.filter(j => j.status === "failed").length;
  
  // Agrupar agentes por tenant
  const agentsByTenant = agents.reduce((acc, agent) => {
    acc[agent.tenant_id] = (acc[agent.tenant_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Jobs completados nas últimas 24h
  const recentJobs = jobs.filter(j => {
    if (!j.completed_at) return false;
    const completed = new Date(j.completed_at);
    return (new Date().getTime() - completed.getTime()) < 24 * 60 * 60 * 1000;
  }).length;

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
          
          <div className="flex items-center gap-3">
            <Button onClick={() => navigate("/installer")} className="gap-2">
              <Download className="h-4 w-4" />
              Criar Instalador
            </Button>
            <LogoutButton />
          </div>
        </div>

        {/* Stats Cards - Linha 1 */}
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
                {Object.keys(agentsByTenant).length} tenant(s)
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-accent/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-accent" />
                Agentes Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{activeAgents.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {((activeAgents.length / Math.max(agents.length, 1)) * 100).toFixed(0)}% online
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
                {recentJobs} nas últimas 24h
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
                {completedJobs} jobs concluídos
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Stats Cards - Linha 2 - Métricas Adicionais */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-gradient-card border-primary/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
                <Network className="h-3 w-3" />
                Taxa de Conexão
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {((activeAgents.length / Math.max(agents.length, 1)) * 100).toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-destructive/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="h-3 w-3" />
                Alertas Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{alerts}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-warning/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
                <Zap className="h-3 w-3" />
                Jobs Falhados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{failedJobs}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-success/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                Taxa de Sucesso
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {((completedJobs / Math.max(completedJobs + failedJobs, 1)) * 100).toFixed(0)}%
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-accent/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
                <Server className="h-3 w-3" />
                Tenants
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {Object.keys(agentsByTenant).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Visão Geral por Tenant */}
        {Object.keys(agentsByTenant).length > 0 && (
          <Card className="bg-gradient-card border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5 text-primary" />
                Distribuição por Tenant
              </CardTitle>
              <CardDescription>Agentes agrupados por ambiente</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(agentsByTenant).map(([tenant, count]) => (
                  <div key={tenant} className="p-3 bg-secondary/30 rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground">Tenant</p>
                    <p className="font-mono font-semibold text-foreground">{tenant}</p>
                    <p className="text-sm text-muted-foreground mt-1">{count} agente(s)</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="agents" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-secondary">
            <TabsTrigger value="agents">Agentes</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="reports">Relatórios</TabsTrigger>
            <TabsTrigger value="security">Segurança</TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="mt-4">
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle>Agentes Registrados</CardTitle>
                <CardDescription>Lista completa com status em tempo real</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-8">Carregando...</p>
                ) : agents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Nenhum agente registrado</p>
                    <Button onClick={() => navigate("/installer")} variant="outline" className="mt-4">
                      Criar Instalador
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {agents.map((agent) => {
                      const isActive = agent.last_heartbeat && 
                        (new Date().getTime() - new Date(agent.last_heartbeat).getTime()) < 5 * 60 * 1000;
                      
                      const agentJobs = jobs.filter(j => j.agent_name === agent.agent_name);
                      const agentReports = reports.filter(r => r.agent_name === agent.agent_name);
                      const lastJob = agentJobs[0];
                      
                      return (
                        <div
                          key={agent.id}
                          className="p-4 bg-secondary/30 rounded-lg border border-border hover:border-primary/30 transition-all"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4 flex-1">
                              <div className={`w-3 h-3 rounded-full mt-1 ${isActive ? 'bg-success animate-pulse shadow-glow-success' : 'bg-muted'}`} />
                              <div className="flex-1 space-y-2">
                                <div>
                                  <p className="font-mono font-bold text-lg text-foreground">{agent.agent_name}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="text-xs">
                                      {agent.tenant_id}
                                    </Badge>
                                    <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
                                      {agent.status}
                                    </Badge>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                  <div>
                                    <p className="text-muted-foreground">Jobs Executados</p>
                                    <p className="font-semibold text-foreground">{agentJobs.length}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Relatórios</p>
                                    <p className="font-semibold text-foreground">{agentReports.length}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Registrado em</p>
                                    <p className="font-semibold text-foreground">
                                      {new Date(agent.enrolled_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Último Heartbeat</p>
                                    <p className="font-semibold text-foreground">
                                      {agent.last_heartbeat 
                                        ? new Date(agent.last_heartbeat).toLocaleTimeString()
                                        : "Nunca"}
                                    </p>
                                  </div>
                                </div>

                                {lastJob && (
                                  <div className="pt-2 border-t border-border">
                                    <p className="text-xs text-muted-foreground mb-1">Último Job:</p>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-xs font-mono">
                                        {lastJob.type}
                                      </Badge>
                                      <Badge variant={
                                        lastJob.status === "done" ? "default" :
                                        lastJob.status === "queued" ? "secondary" :
                                        "destructive"
                                      } className="text-xs">
                                        {lastJob.status}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(lastJob.created_at).toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
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

          <TabsContent value="security" className="mt-4 space-y-4">
            {/* Security Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-card border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Status dos Agentes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Ativos</span>
                    <span className="text-lg font-bold text-success">{activeAgents.length}</span>
                  </div>
                  <Progress value={(activeAgents.length / Math.max(agents.length, 1)) * 100} className="h-2" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Inativos: {agents.length - activeAgents.length}</span>
                    <span className="text-primary font-semibold">
                      {((activeAgents.length / Math.max(agents.length, 1)) * 100).toFixed(0)}%
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card border-warning/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Key className="h-4 w-4 text-warning" />
                    Tokens de Agentes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="text-lg font-bold text-foreground">{agentTokens.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Ativos</span>
                    <span className="text-success font-semibold">
                      {agentTokens.filter(t => t.is_active).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Expirados</span>
                    <span className="text-destructive font-semibold">
                      {agentTokens.filter(t => t.expires_at && new Date(t.expires_at) < new Date()).length}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card border-destructive/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                    Rate Limiting
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Endpoints Monitorados</span>
                    <span className="text-lg font-bold text-foreground">
                      {new Set(rateLimits.map(r => r.endpoint)).size}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Bloqueios Ativos</span>
                    <span className="text-destructive font-semibold">
                      {rateLimits.filter(r => r.blocked_until && new Date(r.blocked_until) > new Date()).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Total de Requests</span>
                    <span className="text-muted-foreground font-semibold">
                      {rateLimits.reduce((sum, r) => sum + r.request_count, 0)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Heartbeats Recentes */}
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Últimos Heartbeats
                </CardTitle>
                <CardDescription>Atividade recente dos agentes</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-4">Carregando...</p>
                ) : agents.filter(a => a.last_heartbeat).length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">Nenhum heartbeat registrado</p>
                ) : (
                  <div className="space-y-2">
                    {agents
                      .filter(a => a.last_heartbeat)
                      .sort((a, b) => new Date(b.last_heartbeat!).getTime() - new Date(a.last_heartbeat!).getTime())
                      .slice(0, 10)
                      .map((agent) => {
                        const isActive = agent.last_heartbeat && 
                          (new Date().getTime() - new Date(agent.last_heartbeat).getTime()) < 5 * 60 * 1000;
                        const timeSince = agent.last_heartbeat 
                          ? Math.floor((new Date().getTime() - new Date(agent.last_heartbeat).getTime()) / 1000)
                          : 0;
                        
                        return (
                          <div
                            key={agent.id}
                            className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border hover:border-primary/30 transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-success animate-pulse' : 'bg-muted'}`} />
                              <div>
                                <p className="font-mono font-semibold text-sm text-foreground">{agent.agent_name}</p>
                                <p className="text-xs text-muted-foreground">{agent.tenant_id}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">
                                {timeSince < 60 ? `${timeSince}s atrás` : 
                                 timeSince < 3600 ? `${Math.floor(timeSince / 60)}m atrás` :
                                 `${Math.floor(timeSince / 3600)}h atrás`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(agent.last_heartbeat!).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tokens Expirados */}
            <Card className="bg-gradient-card border-warning/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-warning" />
                  Tokens Expirados e Inativos
                </CardTitle>
                <CardDescription>Tokens que precisam de atenção</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-4">Carregando...</p>
                ) : (() => {
                  const expiredOrInactive = agentTokens.filter(t => 
                    !t.is_active || (t.expires_at && new Date(t.expires_at) < new Date())
                  );
                  
                  return expiredOrInactive.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Key className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Todos os tokens estão ativos e válidos</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {expiredOrInactive.slice(0, 10).map((token) => {
                        const isExpired = token.expires_at && new Date(token.expires_at) < new Date();
                        const agentName = token.agents?.agent_name || 'Desconhecido';
                        
                        return (
                          <div
                            key={token.id}
                            className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border"
                          >
                            <div className="flex-1">
                              <p className="font-mono font-semibold text-sm text-foreground">{agentName}</p>
                              <p className="text-xs text-muted-foreground font-mono mt-1">
                                {token.token.substring(0, 8)}...{token.token.substring(token.token.length - 4)}
                              </p>
                            </div>
                            <div className="text-right space-y-1">
                              <Badge variant={isExpired ? "destructive" : "secondary"} className="text-xs">
                                {isExpired ? "Expirado" : "Inativo"}
                              </Badge>
                              {token.expires_at && (
                                <p className="text-xs text-muted-foreground">
                                  {new Date(token.expires_at).toLocaleDateString()}
                                </p>
                              )}
                              {token.last_used_at && (
                                <p className="text-xs text-muted-foreground">
                                  Último uso: {new Date(token.last_used_at).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Estatísticas de Rate Limiting */}
            <Card className="bg-gradient-card border-destructive/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  Estatísticas de Rate Limiting
                </CardTitle>
                <CardDescription>Proteção contra abuso de recursos</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-4">Carregando...</p>
                ) : rateLimits.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShieldAlert className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Nenhuma atividade de rate limiting registrada</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Estatísticas por Endpoint */}
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3">Por Endpoint</h4>
                      <div className="space-y-2">
                        {Object.entries(
                          rateLimits.reduce((acc, r) => {
                            if (!acc[r.endpoint]) {
                              acc[r.endpoint] = { count: 0, blocked: 0 };
                            }
                            acc[r.endpoint].count += r.request_count;
                            if (r.blocked_until && new Date(r.blocked_until) > new Date()) {
                              acc[r.endpoint].blocked++;
                            }
                            return acc;
                          }, {} as Record<string, { count: number; blocked: number }>)
                        ).map(([endpoint, stats]) => (
                          <div
                            key={endpoint}
                            className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border"
                          >
                            <div>
                              <p className="font-mono font-semibold text-sm text-foreground">{endpoint}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {stats.count} requests · {stats.blocked} bloqueados
                              </p>
                            </div>
                            <Badge variant={stats.blocked > 0 ? "destructive" : "default"} className="text-xs">
                              {stats.blocked > 0 ? `${stats.blocked} bloqueios` : "Normal"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bloqueios Ativos */}
                    {(() => {
                      const activeBlocks = rateLimits.filter(r => 
                        r.blocked_until && new Date(r.blocked_until) > new Date()
                      );
                      
                      return activeBlocks.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-foreground mb-3">Bloqueios Ativos</h4>
                          <div className="space-y-2">
                            {activeBlocks.map((limit) => (
                              <div
                                key={limit.id}
                                className="flex items-center justify-between p-3 bg-destructive/10 rounded-lg border border-destructive/30"
                              >
                                <div>
                                  <p className="font-mono font-semibold text-sm text-foreground">{limit.identifier}</p>
                                  <p className="text-xs text-muted-foreground mt-1">{limit.endpoint}</p>
                                </div>
                                <div className="text-right">
                                  <Badge variant="destructive" className="text-xs mb-1">
                                    Bloqueado
                                  </Badge>
                                  <p className="text-xs text-muted-foreground">
                                    Até: {new Date(limit.blocked_until!).toLocaleTimeString()}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
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
