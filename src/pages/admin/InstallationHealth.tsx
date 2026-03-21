import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, RefreshCw, Activity, TrendingUp, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { InstallationHealthCard } from "@/components/admin/InstallationHealthCard";
import { InstallationTrendChart } from "@/components/admin/InstallationTrendChart";
import { AgentQuickActions } from "@/components/admin/AgentQuickActions";
import { getJobTypeLabel } from "@/lib/job-labels";
import { formatBrazilDateTime } from "@/lib/date-utils";
import { useActiveTenant } from "@/hooks/useActiveTenant";

type ProblematicAgent = {
  id: string;
  agent_name: string;
  status: string;
  enrolled_at: string;
  minutes_since_enrollment: number;
  never_connected: boolean;
};

type StuckJob = {
  id: string;
  agent_name: string;
  type: string;
  status: string;
  delivered_at: string;
  hours_stuck: number;
};

type InstallationError = {
  agent_name: string;
  platform: string;
  error_message: string;
  created_at: string;
};

export default function InstallationHealth() {
  // ADR-VELLUM V-102: Use centralized tenant hook with loading guard
  const { activeTenant, loading: tenantLoading, isFetched } = useActiveTenant();
  const [problematicAgents, setProblematicAgents] = useState<ProblematicAgent[]>([]);
  const [stuckJobs, setStuckJobs] = useState<StuckJob[]>([]);
  const [recentErrors, setRecentErrors] = useState<InstallationError[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = async () => {
    setLoading(true);
    try {
      // ADR-026 Zero-Gap: Use RPC with explicit tenant_id
      if (!activeTenant?.id) return;
      const { data: rpcData, error: agentsError } = await supabase.rpc('get_agents_list', {
        p_tenant_id: activeTenant.id,
        p_include_archived: false,
      });
      if (agentsError) {
        logger.error('Error fetching agents:', agentsError);
        toast.error('Erro ao carregar agentes problematicos');
      }
      // Filter problematic agents client-side
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      // RPC returns untyped JSON — cast is required
      const agents = ((rpcData || []) as unknown as RpcAgentRow[]).filter((a) =>
        (a.status === 'pending' || !a.last_heartbeat) &&
        a.enrolled_at && a.enrolled_at >= twentyFourHoursAgo
      ).sort((a, b) => (b.enrolled_at || '').localeCompare(a.enrolled_at || ''));

      if (!agentsError) {
        const formatted: ProblematicAgent[] = (agents || []).map((a: any) => ({
          id: a.id,
          agent_name: a.agent_name,
          status: a.status,
          enrolled_at: a.enrolled_at,
          minutes_since_enrollment: Math.floor((Date.now() - new Date(a.enrolled_at).getTime()) / 60000),
          never_connected: !a.last_heartbeat
        }));
        setProblematicAgents(formatted);
      }

      // Jobs travados
      const { data: jobs, error: jobsError } = await supabase
        .from('jobs')
        .select('id, agent_name, type, status, delivered_at')
        .eq('status', 'delivered')
        .lt('delivered_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order('delivered_at', { ascending: true })
        .limit(20);

      if (jobsError) {
        console.error('Error fetching jobs:', jobsError);
        toast.error('Erro ao carregar jobs travados');
      } else {
        const formatted: StuckJob[] = (jobs || []).map(j => ({
          id: j.id,
          agent_name: j.agent_name,
          type: j.type,
          status: j.status,
          delivered_at: j.delivered_at!,
          hours_stuck: Math.floor((Date.now() - new Date(j.delivered_at!).getTime()) / 3600000)
        }));
        setStuckJobs(formatted);
      }

      // Erros recentes de instalacao
      const { data: errors, error: errorsError } = await supabase
        .from('installation_analytics')
        .select('agent_name, platform, error_message, created_at')
        .eq('success', false)
        .not('error_message', 'is', null)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      if (errorsError) {
        console.error('Error fetching errors:', errorsError);
        toast.error('Erro ao carregar erros de instalacao');
      } else {
        setRecentErrors(errors || []);
      }

      setLastUpdate(new Date());
    } catch (err) {
      console.error('Exception fetching data:', err);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  // ADR-VELLUM V-102: Guard - only fetch when tenant is fully synchronized
  useEffect(() => {
    if (!tenantLoading && isFetched && activeTenant?.id) {
      fetchData();
      // Auto-refresh a cada 2 minutos
      const interval = setInterval(fetchData, 120000);
      return () => clearInterval(interval);
    }
  }, [activeTenant?.id, tenantLoading, isFetched]);

  const getSeverityColor = (minutesSince: number) => {
    if (minutesSince > 60) return "bg-red-500";
    if (minutesSince > 30) return "bg-amber-500";
    return "bg-yellow-500";
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Installation Health Monitor</h1>
          <p className="text-muted-foreground mt-1">
            Monitoramento em tempo real de instalacoes e agentes problematicos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Ultima atualizacao: {formatBrazilDateTime(lastUpdate, 'time')}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Taxa de sucesso global */}
      <InstallationHealthCard />

      {/* P2-04: Gráfico de tendência de instalações */}
      <InstallationTrendChart />

      {/* Tabs para diferentes views */}
      <Tabs defaultValue="agents" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="agents" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            Agentes Problematicos
            {problematicAgents.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {problematicAgents.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="jobs" className="gap-2">
            <Clock className="h-4 w-4" />
            Jobs Travados
            {stuckJobs.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {stuckJobs.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="errors" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Erros Recentes
          </TabsTrigger>
        </TabsList>

        {/* Agentes problematicos */}
        <TabsContent value="agents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Agentes Pending ou Sem Heartbeat (ultimas 24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {problematicAgents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  [OK]  Nenhum agente problematico detectado
                </div>
              ) : (
                <div className="space-y-3">
                  {problematicAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{agent.agent_name}</span>
                          <Badge variant={agent.status === 'pending' ? 'secondary' : 'destructive'}>
                            {agent.status}
                          </Badge>
                          {agent.never_connected && (
                            <Badge variant="destructive">Nunca conectou</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Criado há {agent.minutes_since_enrollment} minutos
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <AgentQuickActions agentId={agent.id} agentName={agent.agent_name} />
                        <div
                          className={`w-3 h-3 rounded-full ${getSeverityColor(agent.minutes_since_enrollment)}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Jobs travados */}
        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Jobs em estado 'delivered' ha mais de 1 hora
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stuckJobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  [OK]  Nenhum job travado detectado
                </div>
              ) : (
                <div className="space-y-3">
                  {stuckJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{job.agent_name}</span>
                          <Badge variant="outline">{getJobTypeLabel(job.type)}</Badge>
                          <Badge variant="secondary">{job.status}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Travado ha {job.hours_stuck}h ? ID: {job.id.substring(0, 8)}...
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Erros recentes */}
        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Ultimos 10 erros de instalacao (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentErrors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  [OK]  Nenhum erro de instalacao detectado
                </div>
              ) : (
                <div className="space-y-3">
                  {recentErrors.map((error, idx) => (
                    <div
                      key={idx}
                      className="p-4 border border-border rounded-lg bg-card"
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground">{error.agent_name}</span>
                            <Badge variant="outline">{error.platform}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatBrazilDateTime(error.created_at, 'datetime')}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground mt-2 break-words">
                            {error.error_message}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
