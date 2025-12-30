import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/hooks/useTenant";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertCircle, Server, Clock, CheckCircle, Wifi, WifiOff, Shield, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ErrorState } from "@/components/ErrorState";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { getOsIcon } from '@/lib/os-utils';
import { AgentStatusBadges } from '@/components/agents/AgentStatusBadges';
import { AgentQuickActions } from '@/components/admin/AgentQuickActions';
import { OfflineAgentActions } from '@/components/admin/OfflineAgentActions';
import { TooltipProvider as TooltipProviderWrapper } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HealthTrendChart } from '@/components/admin/HealthTrendChart';
import { AgentDetailsDrawer } from '@/components/agent/AgentDetailsDrawer';

type StatusFilter = 'all' | 'problems' | 'protected' | 'offline';

interface SelectedAgent {
  id: string;
  name: string;
  tenantId: string;
  isThrottled?: boolean | null;
  isIsolated?: boolean | null;
  isInSafeMode?: boolean | null;
}

export default function AgentHealthMonitor() {
  const { tenant } = useTenant();
  const [liveHeartbeats, setLiveHeartbeats] = useState<number>(0);
  const [recentHeartbeats, setRecentHeartbeats] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedAgent, setSelectedAgent] = useState<SelectedAgent | null>(null);

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

  // Calculate health counts from real data - MUST be before conditional returns
  const counts = useMemo(() => agentsHealth.reduce(
    (acc, agent) => {
      if (agent.health_status === 'healthy') acc.healthy++;
      // Contar como critical se health_status é critical OU se tem alertas críticos
      if (agent.health_status === 'critical' || agent.has_critical_alerts) acc.critical++;
      if (agent.health_status === 'offline') acc.offline++;
      if (agent.health_status === 'never_connected') acc.never_connected++;
      if (agent.is_throttled || agent.is_isolated || agent.is_in_safe_mode) acc.withProblems++;
      if (agent.is_in_safe_mode) acc.protected++;
      return acc;
    },
    { healthy: 0, critical: 0, offline: 0, never_connected: 0, withProblems: 0, protected: 0 }
  ), [agentsHealth]);

  const totalAgents = agentsHealth.length || 0;
  const healthPercentage = totalAgents > 0 
    ? Math.round((counts.healthy / totalAgents) * 100)
    : 0;

  // Filter agents based on selected status - MUST be before conditional returns
  const filteredAgents = useMemo(() => {
    switch (statusFilter) {
      case 'problems':
        return agentsHealth.filter(a => a.is_throttled || a.is_isolated || a.is_in_safe_mode);
      case 'protected':
        return agentsHealth.filter(a => a.is_in_safe_mode);
      case 'offline':
        return agentsHealth.filter(a => a.health_status === 'offline' || a.health_status === 'never_connected');
      default:
        return agentsHealth;
    }
  }, [agentsHealth, statusFilter]);

  // Conditional returns AFTER all hooks
  if (isLoading) {
    return (
      <div className="space-y-6">
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
      <div>
        <ErrorState
          error={errorData!} 
          onRetry={refetch}
          title="Erro ao carregar"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      {/* 🔢 CAMADA 2: KPIs - Máximo 3 */}
      <div className="grid gap-4 md:grid-cols-3">
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
      </div>

      {/* 📈 CAMADA 3: Gráfico de Tendência */}
      <HealthTrendChart />

      {/* Recent Connections (sutil, não como KPI) */}
      {recentHeartbeats.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" />
              <span>Conexões recentes:</span>
              {recentHeartbeats.slice(0, 3).map((name, idx) => (
                <Badge key={`${name}-${idx}`} variant="secondary" className="px-2 py-0.5 text-xs">
                  {name}
                </Badge>
              ))}
              {recentHeartbeats.length > 3 && (
                <span className="text-xs">+{recentHeartbeats.length - 3} mais</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent List with Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Computadores
            </CardTitle>
            
            {/* Status Filter Tabs */}
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)} className="w-full sm:w-auto">
              <TabsList className="grid grid-cols-4 w-full sm:w-auto">
                <TabsTrigger value="all" className="text-xs sm:text-sm">
                  Todos
                  <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">{totalAgents}</Badge>
                </TabsTrigger>
                <TabsTrigger value="problems" className="text-xs sm:text-sm">
                  <ShieldAlert className="h-3 w-3 mr-1 hidden sm:inline" />
                  Problemas
                  {counts.withProblems > 0 && (
                    <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-[10px]">{counts.withProblems}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="protected" className="text-xs sm:text-sm">
                  <Shield className="h-3 w-3 mr-1 hidden sm:inline" />
                  Protegidos
                  {counts.protected > 0 && (
                    <Badge className="ml-1.5 px-1.5 py-0 text-[10px] bg-orange-500">{counts.protected}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="offline" className="text-xs sm:text-sm">
                  <WifiOff className="h-3 w-3 mr-1 hidden sm:inline" />
                  Offline
                  {(counts.offline + counts.never_connected) > 0 && (
                    <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">{counts.offline + counts.never_connected}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {filteredAgents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-3 opacity-50" />
              {statusFilter === 'all' ? (
                <>
                  <p>Nenhum computador cadastrado ainda</p>
                  <p className="text-sm">Instale o agente em seus computadores para começar</p>
                </>
              ) : statusFilter === 'problems' ? (
                <>
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500 opacity-70" />
                  <p className="text-green-600">Nenhum computador com problemas</p>
                  <p className="text-sm">Todos estão funcionando normalmente</p>
                </>
              ) : statusFilter === 'protected' ? (
                <>
                  <Shield className="h-12 w-12 mx-auto mb-3 text-orange-500 opacity-70" />
                  <p>Nenhum computador em modo protegido</p>
                  <p className="text-sm">Isso é bom! Significa que não houve erros graves</p>
                </>
              ) : (
                <>
                  <Wifi className="h-12 w-12 mx-auto mb-3 text-green-500 opacity-70" />
                  <p className="text-green-600">Todos os computadores estão online</p>
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredAgents.map((agent, idx) => {
                const isOnline = agent.health_status === 'healthy' || agent.health_status === 'critical';
                const secondsSinceHeartbeat = agent.seconds_since_heartbeat || 0;
                const lastSeenText = secondsSinceHeartbeat < 60 
                  ? 'Agora mesmo'
                  : secondsSinceHeartbeat < 3600 
                    ? `Há ${Math.floor(secondsSinceHeartbeat / 60)} min`
                    : secondsSinceHeartbeat < 86400
                      ? `Há ${Math.floor(secondsSinceHeartbeat / 3600)} h`
                      : `Há ${Math.floor(secondsSinceHeartbeat / 86400)} dias`;

                const hasSpecialStatus = agent.is_throttled || agent.is_isolated || agent.is_in_safe_mode;

                return (
                  <div 
                    key={agent.agent_name + idx}
                    onClick={() => agent.id && tenant?.id && setSelectedAgent({
                      id: agent.id,
                      name: agent.agent_name,
                      tenantId: tenant.id,
                      isThrottled: agent.is_throttled,
                      isIsolated: agent.is_isolated,
                      isInSafeMode: agent.is_in_safe_mode
                    })}
                    className={cn(
                      "p-4 rounded-lg border transition-all hover:shadow-md cursor-pointer",
                      agent.is_isolated ? "border-red-300 bg-red-50/50 dark:bg-red-950/20" :
                      agent.is_throttled ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20" :
                      agent.is_in_safe_mode ? "border-orange-300 bg-orange-50/50 dark:bg-orange-950/20" :
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
                      <div className="flex items-center gap-2">
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
                    </div>

                    {/* Rules Engine Status Badges */}
                    {hasSpecialStatus && (
                      <div className="mt-2">
                        <TooltipProviderWrapper>
                          <AgentStatusBadges
                            isThrottled={agent.is_throttled}
                            isIsolated={agent.is_isolated}
                            isInSafeMode={agent.is_in_safe_mode}
                            throttleReason={agent.throttle_reason}
                            isolationReason={agent.isolation_reason}
                            safeModeReason={agent.safe_mode_reason}
                          />
                        </TooltipProviderWrapper>
                      </div>
                    )}
                    
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

                    {/* Quick Actions for special states */}
                    {hasSpecialStatus && agent.id && (
                      <div className="mt-3 pt-3 border-t">
                        <AgentQuickActions
                          agentId={agent.id}
                          agentName={agent.agent_name}
                          isThrottled={agent.is_throttled}
                          isIsolated={agent.is_isolated}
                          isInSafeMode={agent.is_in_safe_mode}
                        />
                      </div>
                    )}

                    {/* Offline Agent Actions */}
                    {!isOnline && !hasSpecialStatus && agent.id && tenant?.id && (
                      <div className="mt-3 pt-3 border-t">
                        <OfflineAgentActions
                          agentId={agent.id}
                          agentName={agent.agent_name}
                          tenantId={tenant.id}
                          secondsOffline={secondsSinceHeartbeat}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent Details Drawer */}
      <AgentDetailsDrawer
        agentId={selectedAgent?.id || null}
        agentName={selectedAgent?.name}
        tenantId={selectedAgent?.tenantId}
        open={!!selectedAgent}
        onClose={() => setSelectedAgent(null)}
        isThrottled={selectedAgent?.isThrottled}
        isIsolated={selectedAgent?.isIsolated}
        isInSafeMode={selectedAgent?.isInSafeMode}
      />
    </div>
  );
}
