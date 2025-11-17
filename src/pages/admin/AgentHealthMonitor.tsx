import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Heart, AlertCircle, Server, Clock, Monitor } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ErrorState } from "@/components/ErrorState";
import { InstallationHealthCard } from "@/components/admin/InstallationHealthCard";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export default function AgentHealthMonitor() {
  const { tenant } = useTenant();
  const [liveHeartbeats, setLiveHeartbeats] = useState<number>(0);
  const [recentHeartbeats, setRecentHeartbeats] = useState<string[]>([]);

  // Fetch agent health metrics using RPC
  const { data: agentsHealth = [], isLoading, isError, error: errorData, refetch } = useQuery({
    queryKey: ['agent-health', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .rpc('get_agent_health_metrics', { p_tenant_id: tenant.id });
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000, // 30s
  });

  // Realtime subscription for heartbeats
  useEffect(() => {
    if (!tenant?.id) return;

    const channel = supabase
      .channel('agent-heartbeats')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agents',
          filter: `tenant_id=eq.${tenant.id}`
        },
        (payload: any) => {
          const agentName = payload.new.agent_name;
          setLiveHeartbeats(prev => prev + 1);
          setRecentHeartbeats(prev => [agentName, ...prev.slice(0, 4)]);
          
          toast.success(`❤️ Heartbeat recebido`, {
            description: `Agente: ${agentName}`,
            duration: 2000
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto p-6">
        <ErrorState 
          error={errorData!} 
          onRetry={refetch}
          title="Erro ao Carregar Monitor de Saúde"
        />
      </div>
    );
  }

  // Calculate health counts from real data
  const counts = agentsHealth.reduce(
    (acc, agent) => {
      if (agent.health_status === 'healthy') acc.healthy++;
      if (agent.health_status === 'critical') acc.critical++;
      if (agent.health_status === 'offline') acc.offline++;
      if (agent.health_status === 'never_connected') acc.never_connected++;
      return acc;
    },
    { healthy: 0, critical: 0, offline: 0, never_connected: 0 }
  );

  const totalAgents = agentsHealth.length || 0;
  const healthPercentage = totalAgents > 0 
    ? Math.round((counts.healthy / totalAgents) * 100)
    : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Monitor de Saúde dos Agentes</h1>
        <p className="text-muted-foreground">Acompanhamento em tempo real do status de todos os agentes</p>
      </div>

      {/* Installation Health Card */}
      <InstallationHealthCard />

      {/* Live Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saúde Geral</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{healthPercentage}%</div>
            <p className="text-xs text-muted-foreground">
              {counts.healthy} de {totalAgents} saudáveis
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Heartbeats Live</CardTitle>
            <Heart className="h-4 w-4 text-red-500 animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{liveHeartbeats}</div>
            <p className="text-xs text-muted-foreground">
              Recebidos nesta sessão
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Ativos</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{counts.critical}</div>
            <p className="text-xs text-muted-foreground">
              Requerem atenção
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{counts.offline}</div>
            <p className="text-xs text-muted-foreground">
              Offline temporariamente
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Heartbeats */}
      {recentHeartbeats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-500" />
              Heartbeats Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {recentHeartbeats.map((name, idx) => (
                <Badge key={`${name}-${idx}`} variant="outline" className="animate-pulse">
                  {name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Heatmap Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Mapa de Calor de Agentes</CardTitle>
          <CardDescription>
            <div className="flex gap-4 items-center mt-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded" />
                <span className="text-sm">Saudável</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-500 rounded" />
                <span className="text-sm">Offline</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded" />
                <span className="text-sm">Crítico</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-500 rounded" />
                <span className="text-sm">Nunca Conectou</span>
              </div>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <div className="grid grid-cols-8 gap-2">
              {agentsHealth.map((agent) => (
                <Tooltip key={agent.agent_name}>
                  <TooltipTrigger asChild>
                    <div 
                      className={cn(
                        "h-16 rounded-lg cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center",
                        agent.health_status === 'healthy' && 'bg-green-500',
                        agent.health_status === 'offline' && 'bg-orange-500',
                        agent.health_status === 'critical' && 'bg-red-500',
                        agent.health_status === 'never_connected' && 'bg-gray-500'
                      )}
                    >
                      <Server className="h-6 w-6 text-white" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-1">
                      <p className="font-semibold">{agent.agent_name}</p>
                      <p className="text-sm capitalize">{agent.health_status}</p>
                      {agent.seconds_since_heartbeat !== null && (
                        <p className="text-xs text-muted-foreground">
                          Último heartbeat: {Math.floor(agent.seconds_since_heartbeat / 60)}min atrás
                        </p>
                      )}
                      {agent.total_jobs_24h > 0 && (
                        <p className="text-xs">
                          Jobs: {agent.total_jobs_24h} (falhas: {agent.failure_rate_pct}%)
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
              {/* Fill empty squares to complete grid */}
              {Array.from({ length: Math.max(0, 8 - (agentsHealth.length % 8 || 8)) }).map((_, idx) => (
                <div key={`empty-${idx}`} className="h-16 rounded-lg border-2 border-dashed border-gray-200" />
              ))}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Detailed Agent Health List - já implementado acima nas linhas 209-273 */}
    </div>
  );
}
