import { useState, useMemo, memo } from "react";
import { Users, Search, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { getJobTypeLabel } from "@/lib/job-labels";
import { formatBrazilDateTime } from "@/lib/date-utils";
import { CSVExportButton } from "@/components/dashboard/CSVExportButton";
import type { DashboardAgent, DashboardJob, DashboardReport } from "@/types/dashboard";

interface AgentsTabProps {
  agents: DashboardAgent[];
  jobs: DashboardJob[];
  reports: DashboardReport[];
  loading: boolean;
  tenantNames: Record<string, string>;
}

function AgentsTabComponent({ agents, jobs, reports, loading, tenantNames }: AgentsTabProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");

  const filteredAgents = useMemo(() => {
    return agents.filter(agent => {
      const matchesSearch = !search || 
        agent.agent_name.toLowerCase().includes(search.toLowerCase()) ||
        (tenantNames[agent.tenant_id] || "").toLowerCase().includes(search.toLowerCase());
      
      if (!matchesSearch) return false;

      if (statusFilter === "all") return true;
      const isOnline = agent.last_heartbeat && 
        (new Date().getTime() - new Date(agent.last_heartbeat).getTime()) < 5 * 60 * 1000;
      return statusFilter === "online" ? isOnline : !isOnline;
    });
  }, [agents, search, statusFilter, tenantNames]);

  return (
    <Card className="bg-gradient-card border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Computadores Registrados</CardTitle>
          <CSVExportButton
            data={filteredAgents.map(a => ({
              nome: a.agent_name,
              empresa: tenantNames[a.tenant_id] || a.tenant_id,
              status: a.last_heartbeat && (Date.now() - new Date(a.last_heartbeat).getTime()) < 300000 ? "Online" : "Offline",
              registrado: new Date(a.enrolled_at).toLocaleDateString(),
              ultimo_sinal: a.last_heartbeat ? new Date(a.last_heartbeat).toLocaleString() : "Nunca",
            }))}
            filename="computadores"
            columns={[
              { key: "nome", label: "Nome" },
              { key: "empresa", label: "Empresa" },
              { key: "status", label: "Status" },
              { key: "registrado", label: "Registrado em" },
              { key: "ultimo_sinal", label: "Último Sinal" },
            ]}
          />
        </div>
        <CardDescription>Lista completa com status em tempo real</CardDescription>
        {agents.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou empresa..."
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
            <div className="flex gap-1">
              {(["all", "online", "offline"] as const).map(f => (
                <Button
                  key={f}
                  variant={statusFilter === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(f)}
                  className="text-xs h-9"
                >
                  {f === "all" ? `Todos (${agents.length})` :
                   f === "online" ? `Online` : `Offline`}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4 bg-secondary/30 rounded-lg border border-border">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-3 w-3 rounded-full mt-1" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-5 w-40" />
                    <div className="flex gap-2"><Skeleton className="h-4 w-20 rounded-full" /><Skeleton className="h-4 w-16 rounded-full" /></div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Array.from({ length: 4 }).map((_, j) => (<div key={j}><Skeleton className="h-3 w-16 mb-1" /><Skeleton className="h-4 w-12" /></div>))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>{search || statusFilter !== "all" ? "Nenhum resultado encontrado" : "Nenhum computador registrado"}</p>
            {!search && statusFilter === "all" && (
              <Button onClick={() => navigate("/installer")} variant="outline" className="mt-4">Criar Instalador</Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAgents.map((agent) => {
              const isActive = agent.last_heartbeat && 
                (new Date().getTime() - new Date(agent.last_heartbeat).getTime()) < 5 * 60 * 1000;
              const agentJobs = jobs.filter(j => j.agent_name === agent.agent_name);
              const agentReports = reports.filter(r => r.agent_name === agent.agent_name);
              const lastJob = agentJobs[0];
              
              return (
                <div key={agent.id} className="p-4 bg-secondary/30 rounded-lg border border-border hover:border-primary/30 transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`w-3 h-3 rounded-full mt-1 ${isActive ? 'bg-success animate-pulse shadow-glow-success' : 'bg-muted'}`} />
                      <div className="flex-1 space-y-2">
                        <div>
                          <p className="font-mono font-bold text-lg text-foreground">{agent.agent_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {tenantNames[agent.tenant_id] || agent.tenant_id.slice(0, 8) + '...'}
                            </Badge>
                            <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
                              {isActive ? 'Online' : 'Offline'}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <p className="text-muted-foreground">Verificações</p>
                            <p className="font-semibold text-foreground">{agentJobs.length}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Relatórios</p>
                            <p className="font-semibold text-foreground">{agentReports.length}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Registrado em</p>
                            <p className="font-semibold text-foreground">{new Date(agent.enrolled_at).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Último Sinal</p>
                            <p className="font-semibold text-foreground">
                              {agent.last_heartbeat ? new Date(agent.last_heartbeat).toLocaleTimeString() : "Nunca"}
                            </p>
                          </div>
                        </div>

                        {lastJob && (
                          <div className="pt-2 border-t border-border">
                            <p className="text-xs text-muted-foreground mb-1">Última verificação:</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">{getJobTypeLabel(lastJob.type)}</Badge>
                              <Badge variant={lastJob.status === "completed" ? "default" : lastJob.status === "queued" ? "secondary" : "destructive"} className="text-xs">
                                {lastJob.status === "completed" ? "Concluída" : lastJob.status === "queued" ? "Aguardando" : "Com erro"}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{formatBrazilDateTime(lastJob.created_at, 'short')}</span>
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
  );
}

export default memo(AgentsTabComponent);
