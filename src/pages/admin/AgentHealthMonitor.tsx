import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAgentLifecycle } from "@/hooks/useAgentLifecycle";
import { useTenant } from "@/hooks/useTenant";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Heart, AlertCircle, Server, Clock } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ErrorState } from "@/components/ErrorState";

export default function AgentHealthMonitor() {
  const { tenant } = useTenant();
  const { data: agents, isLoading, isError, error: errorData, refetch } = useAgentLifecycle(tenant?.id);
  const [liveHeartbeats, setLiveHeartbeats] = useState<number>(0);
  const [recentHeartbeats, setRecentHeartbeats] = useState<string[]>([]);

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

  // Group agents by health status
  const healthGroups = {
    healthy: agents?.filter(a => a.lifecycle_stage === 'active' && !a.flags.has_errors) || [],
    warning: agents?.filter(a => 
      (a.lifecycle_stage === 'installed_offline' || a.flags.is_offline) && !a.flags.has_errors
    ) || [],
    critical: agents?.filter(a => a.flags.has_errors || a.flags.is_stuck) || [],
  };

  const totalAgents = agents?.length || 0;
  const healthPercentage = totalAgents > 0 
    ? Math.round((healthGroups.healthy.length / totalAgents) * 100)
    : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Monitor de Saúde dos Agentes</h1>
        <p className="text-muted-foreground">Acompanhamento em tempo real do status de todos os agentes</p>
      </div>

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
              {healthGroups.healthy.length} de {totalAgents} saudáveis
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
            <div className="text-2xl font-bold text-destructive">{healthGroups.critical.length}</div>
            <p className="text-xs text-muted-foreground">
              Requerem atenção
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avisos</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{healthGroups.warning.length}</div>
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
                <div className="w-4 h-4 bg-yellow-500 rounded" />
                <span className="text-sm">Aviso</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded" />
                <span className="text-sm">Crítico</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-300 rounded" />
                <span className="text-sm">Offline</span>
              </div>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <div className="grid grid-cols-8 gap-2">
              {agents?.map((agent) => {
                const color = 
                  agent.flags.has_errors || agent.flags.is_stuck ? 'bg-red-500' :
                  agent.flags.is_offline ? 'bg-gray-300' :
                  agent.lifecycle_stage === 'active' ? 'bg-green-500' :
                  'bg-yellow-500';

                return (
                  <Tooltip key={agent.agent_id}>
                    <TooltipTrigger asChild>
                      <div 
                        className={`${color} h-16 rounded-lg cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center`}
                      >
                        <Server className="h-6 w-6 text-white" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-1">
                        <p className="font-semibold">{agent.agent_name}</p>
                        <p className="text-sm">{agent.status_badge.label}</p>
                        {agent.metrics.last_seen && (
                          <p className="text-xs text-muted-foreground">
                            Visto: {new Date(agent.metrics.last_seen).toLocaleString('pt-BR')}
                          </p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
              {/* Fill empty squares to complete grid */}
              {Array.from({ length: Math.max(0, 8 - (agents?.length || 0) % 8) }).map((_, idx) => (
                <div key={`empty-${idx}`} className="h-16 rounded-lg border-2 border-dashed border-gray-200" />
              ))}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Health Groups */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">Saudáveis</CardTitle>
            <CardDescription>{healthGroups.healthy.length} agentes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {healthGroups.healthy.slice(0, 5).map(agent => (
                <div key={agent.agent_id} className="flex items-center justify-between p-2 rounded hover:bg-accent">
                  <span className="text-sm">{agent.agent_name}</span>
                  <Badge variant="outline" className="text-green-600">Ativo</Badge>
                </div>
              ))}
              {healthGroups.healthy.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  + {healthGroups.healthy.length - 5} mais
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-yellow-600">Avisos</CardTitle>
            <CardDescription>{healthGroups.warning.length} agentes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {healthGroups.warning.slice(0, 5).map(agent => (
                <div key={agent.agent_id} className="flex items-center justify-between p-2 rounded hover:bg-accent">
                  <span className="text-sm">{agent.agent_name}</span>
                  <Badge variant="outline" className="text-yellow-600">Offline</Badge>
                </div>
              ))}
              {healthGroups.warning.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  + {healthGroups.warning.length - 5} mais
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Críticos</CardTitle>
            <CardDescription>{healthGroups.critical.length} agentes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {healthGroups.critical.slice(0, 5).map(agent => (
                <div key={agent.agent_id} className="flex items-center justify-between p-2 rounded hover:bg-accent">
                  <span className="text-sm">{agent.agent_name}</span>
                  <Badge variant="destructive">Erro</Badge>
                </div>
              ))}
              {healthGroups.critical.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  + {healthGroups.critical.length - 5} mais
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
