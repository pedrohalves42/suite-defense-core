import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/hooks/useTenant";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Heart, AlertCircle, Server, Clock, Trash2, CheckCircle, XCircle, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ErrorState } from "@/components/ErrorState";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { getOsIcon } from '@/lib/os-utils';

export default function AgentHealthMonitor() {
  const { tenant } = useTenant();
  const [liveHeartbeats, setLiveHeartbeats] = useState<number>(0);
  const [recentHeartbeats, setRecentHeartbeats] = useState<string[]>([]);
  const [isCleaningJobs, setIsCleaningJobs] = useState(false);

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
    refetchInterval: 30000,
  });

  // Fetch job statistics
  const { data: jobStats, refetch: refetchJobStats } = useQuery({
    queryKey: ['job-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { failed: 0, delivered: 0, total: 0 };
      
      const { data, error } = await supabase
        .from('jobs')
        .select('status', { count: 'exact' })
        .eq('tenant_id', tenant.id);
      
      if (error) throw error;
      
      const failed = data.filter(j => j.status === 'failed').length;
      const delivered = data.filter(j => j.status === 'delivered').length;
      
      return { failed, delivered, total: data.length };
    },
    enabled: !!tenant?.id,
    refetchInterval: 60000,
  });

  // Cleanup jobs function
  const handleCleanup = async (type: 'failed' | 'delivered' | 'all') => {
    const statusMap = {
      failed: ['failed'],
      delivered: ['delivered'],
      all: ['failed', 'delivered']
    };

    const confirmMessage = 
      type === 'failed' ? `Limpar ${jobStats?.failed || 0} tarefas com falha?` :
      type === 'delivered' ? `Limpar ${jobStats?.delivered || 0} tarefas pendentes?` :
      `Limpar todas as ${(jobStats?.failed || 0) + (jobStats?.delivered || 0)} tarefas?`;

    if (!confirm(confirmMessage)) return;

    setIsCleaningJobs(true);

    try {
      const { data, error } = await supabase.functions.invoke('cleanup-jobs', {
        body: {
          status: statusMap[type],
          older_than_days: 0
        }
      });

      if (error) throw error;

      toast.success(`${data.deleted_count} tarefas removidas`);
      refetchJobStats();
    } catch (error) {
      console.error('Cleanup error:', error);
      toast.error('Erro ao limpar tarefas');
    } finally {
      setIsCleaningJobs(false);
    }
  };

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
        (payload: { new: { agent_name: string } }) => {
          const agentName = payload.new.agent_name;
          setLiveHeartbeats(prev => prev + 1);
          setRecentHeartbeats(prev => [agentName, ...prev.slice(0, 4)]);
          
          toast.success(`✓ ${agentName} conectado`, { duration: 2000 });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-9 w-80" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto p-6">
        <ErrorState 
          error={errorData!} 
          onRetry={refetch}
          title="Erro ao carregar"
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            Status dos Computadores
          </h1>
          <p className="text-sm text-muted-foreground">Veja se todos os seus computadores estão funcionando bem</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <Activity className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Contextual Message */}
      {healthPercentage >= 80 && counts.critical === 0 && totalAgents > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="py-4 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-green-700 dark:text-green-400 font-medium">
                🎉 Tudo certo! {counts.healthy} de {totalAgents} computadores estão protegidos.
              </span>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {counts.critical > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-yellow-500/10 border-yellow-500/20">
            <CardContent className="py-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <span className="text-yellow-700 dark:text-yellow-400 font-medium">
                ⚠️ {counts.critical} computador{counts.critical > 1 ? 'es precisam' : ' precisa'} de atenção
              </span>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <Card className="border-l-4 border-green-500 hover:shadow-lg transition-all">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Protegidos</span>
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div className="text-2xl font-bold text-green-600">{counts.healthy}</div>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${healthPercentage}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{healthPercentage}% do total</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-l-4 border-yellow-500 hover:shadow-lg transition-all">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Precisam de Atenção</span>
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              </div>
              <div className="text-2xl font-bold text-yellow-600">{counts.critical}</div>
              <p className="text-xs text-muted-foreground mt-2">
                {counts.critical > 0 ? 'Verifique esses computadores' : '✓ Nenhum problema'}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-l-4 border-gray-400 hover:shadow-lg transition-all">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Desligados</span>
                <WifiOff className="h-5 w-5 text-gray-500" />
              </div>
              <div className="text-2xl font-bold text-gray-600">{counts.offline}</div>
              <p className="text-xs text-muted-foreground mt-2">
                {counts.offline > 0 ? 'Computadores offline' : '✓ Todos conectados'}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-l-4 border-red-500 hover:shadow-lg transition-all">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Conexões ao Vivo</span>
                <Heart className="h-5 w-5 text-red-500 animate-pulse" />
              </div>
              <div className="text-2xl font-bold text-red-600">{liveHeartbeats}</div>
              <p className="text-xs text-muted-foreground mt-2">Recebidas agora</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Connections */}
      {recentHeartbeats.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="h-4 w-4 text-red-500" />
              Computadores que acabaram de se conectar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {recentHeartbeats.map((name, idx) => (
                <Badge key={`${name}-${idx}`} variant="secondary" className="px-3 py-1">
                  ✓ {name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job Cleanup (only show if there are jobs to clean) */}
      {jobStats && (jobStats.failed > 0 || jobStats.delivered > 0) && (
        <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-orange-600" />
              Limpeza de Tarefas
            </CardTitle>
            <CardDescription>
              Remover tarefas antigas ou com problemas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              <span className="font-semibold text-red-600">{jobStats.failed} com falha</span>
              {' • '}
              <span className="font-semibold text-yellow-600">{jobStats.delivered} aguardando</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => handleCleanup('failed')}
                disabled={isCleaningJobs || jobStats.failed === 0}
              >
                Limpar com Falha
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleCleanup('all')}
                disabled={isCleaningJobs || (jobStats.failed === 0 && jobStats.delivered === 0)}
              >
                Limpar Tudo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Todos os Computadores ({totalAgents})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalAgents === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum computador cadastrado ainda</p>
              <p className="text-sm">Instale o agente em seus computadores para começar</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {agentsHealth.map((agent, idx) => {
                const isOnline = agent.health_status === 'healthy' || agent.health_status === 'critical';
                const secondsSinceHeartbeat = agent.seconds_since_heartbeat || 0;
                const lastSeenText = secondsSinceHeartbeat < 60 
                  ? 'Agora mesmo'
                  : secondsSinceHeartbeat < 3600 
                    ? `Há ${Math.floor(secondsSinceHeartbeat / 60)} min`
                    : secondsSinceHeartbeat < 86400
                      ? `Há ${Math.floor(secondsSinceHeartbeat / 3600)} h`
                      : `Há ${Math.floor(secondsSinceHeartbeat / 86400)} dias`;

                return (
                  <div 
                    key={agent.agent_name + idx}
                    className={cn(
                      "p-4 rounded-lg border transition-all hover:shadow-md",
                      isOnline ? "border-green-200 bg-green-50/50 dark:bg-green-950/20" : "border-gray-200 bg-gray-50/50 dark:bg-gray-950/20"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{getOsIcon(agent.os_type || 'windows')}</span>
                        <div>
                          <p className="font-medium">{agent.agent_name}</p>
                          <p className="text-xs text-muted-foreground">{agent.hostname || 'N/A'}</p>
                        </div>
                      </div>
                      <Badge variant={isOnline ? "default" : "secondary"} className={cn(
                        isOnline ? "bg-green-500" : ""
                      )}>
                        {isOnline ? (
                          <><Wifi className="w-3 h-3 mr-1" /> Online</>
                        ) : (
                          <><WifiOff className="w-3 h-3 mr-1" /> Offline</>
                        )}
                      </Badge>
                    </div>
                    
                    {/* Agent info */}
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <p>Versão: {agent.agent_version || 'N/A'}</p>
                      <p>SO: {agent.os_version || agent.os_type || 'N/A'}</p>
                    </div>

                    {/* Last seen */}
                    <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {agent.last_heartbeat ? lastSeenText : 'Nunca conectado'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
