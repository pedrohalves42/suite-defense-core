import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/hooks/useTenant";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertCircle, Server, Clock, CheckCircle, Wifi, WifiOff, Shield, ShieldAlert, Archive } from "lucide-react";
import { getOsDisplayName } from "@/lib/os-utils";
import { toast } from "sonner";
import { ErrorState } from "@/components/ErrorState";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { AgentQuickActions } from '@/components/admin/AgentQuickActions';
import { OfflineAgentActions } from '@/components/admin/OfflineAgentActions';
import { AgentAuthFailureAlert } from '@/components/admin/AgentAuthFailureAlert';
import { TooltipProvider as TooltipProviderWrapper } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HealthTrendChart } from '@/components/admin/HealthTrendChart';
import { AgentDetailsDrawer } from '@/components/agent/AgentDetailsDrawer';
import { AgentCard } from '@/components/agent/AgentCard';
import { useAgentsSystemMetrics } from '@/hooks/useAgentSystemMetrics';
import { useAgentsDiskMetrics } from '@/hooks/useAgentsDiskMetrics';
import { Link } from 'react-router-dom';
import { SimpleAgentList } from '@/components/dashboard/SimpleAgentList';
import { useSimpleModeContext } from '@/hooks/useSimpleMode';
import { BatchActionBar } from '@/components/fleet/BatchActionBar';
import { Checkbox } from '@/components/ui/checkbox';

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
  // V-FIX: Use loading guard to prevent race condition during tenant sync
  const { tenant, loading: tenantLoading } = useTenant();
  const [liveHeartbeats, setLiveHeartbeats] = useState<number>(0);
  const [recentHeartbeats, setRecentHeartbeats] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedAgent, setSelectedAgent] = useState<SelectedAgent | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<Set<string>>(new Set());
  // Simple Mode - visualização simplificada
  const { isSimple } = useSimpleModeContext();
  const queryClient = useQueryClient();

  // Fetch agent health metrics using RPC
  // V-FIX: Guard with !tenantLoading to prevent queries before JWT sync completes
  const { data: agentsHealth = [], isLoading, isError, error: errorData, refetch } = useQuery({
    queryKey: ['agent-health', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .rpc('get_agent_health_metrics', { p_tenant_id: tenant.id });
      if (error) throw error;
      return data;
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
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
          queryClient.invalidateQueries({ queryKey: ['agent-health', tenant.id] });
          
          toast.success(`✓ ${agentName} conectado`, { duration: 2000 });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, queryClient]);

  // Calculate health counts from real data - MUST be before conditional returns
  const counts = useMemo(() => agentsHealth.reduce(
    (acc, agent) => {
      if (agent.health_status === 'healthy') acc.healthy++;
      // critical = NOT healthy (warning/offline/never_connected) or has active alerts while online
      if (agent.health_status === 'warning' || agent.health_status === 'critical') acc.critical++;
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

  // Get agent IDs for metrics fetching
  const agentIds = useMemo(() => 
    filteredAgents.map(a => a.id).filter((id): id is string => !!id),
    [filteredAgents]
  );

  // Fetch system metrics (CPU, RAM, Disk) for all visible agents
  const { data: systemMetrics = {} } = useAgentsSystemMetrics(agentIds);
  
  // Fetch disk metrics for all visible agents
  const { data: diskMetrics = {} } = useAgentsDiskMetrics(agentIds);

  // Conditional returns AFTER all hooks
  // V-FIX: Show loading during tenant sync as well
  if (isLoading || tenantLoading) {
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

  // 🎯 MODO SIMPLES - Lista simplificada para donos de negócio
  if (isSimple) {
    return (
      <div className="space-y-6">
        <div className="page-header-enterprise">
          <h1>Meus Computadores</h1>
          <p>Veja quais estão protegidos</p>
        </div>

        <SimpleAgentList 
          agents={agentsHealth.map(a => ({
            id: a.id || '',
            agent_name: a.agent_name || 'Computador',
            health_status: a.health_status as 'healthy' | 'warning' | 'critical' | 'offline' | 'never_connected',
          }))}
          isLoading={isLoading}
          onAgentClick={(agent) => tenant?.id && setSelectedAgent({
            id: agent.id,
            name: agent.agent_name,
            tenantId: tenant.id,
          })}
        />

        {/* Agent Details Drawer */}
        <AgentDetailsDrawer
          agentId={selectedAgent?.id || null}
          agentName={selectedAgent?.name}
          tenantId={selectedAgent?.tenantId}
          open={!!selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      </div>
    );
  }

  // 🔧 MODO TÉCNICO - Interface completa
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
            <Server className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Status dos Computadores
            </h2>
            <p className="text-sm text-muted-foreground">Veja se todos os seus computadores estão funcionando bem</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/archived-agents">
              <Archive className="h-4 w-4 mr-2" />
              Arquivados
            </Link>
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <Activity className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
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
                const isOnline = agent.health_status === 'healthy' || agent.health_status === 'warning' || agent.health_status === 'critical';
                const hasSpecialStatus = agent.is_throttled || agent.is_isolated || agent.is_in_safe_mode;
                const agentMetrics = agent.id ? systemMetrics[agent.id] : undefined;
                const agentDisks = agent.id ? diskMetrics[agent.id] : undefined;
                const isSelected = agent.id ? selectedBatch.has(agent.id) : false;

                // Determine health status for the card
                const healthStatus: 'healthy' | 'warning' | 'critical' | undefined = 
                  agent.health_status === 'critical' ? 'critical' :
                  agent.health_status === 'warning' || hasSpecialStatus ? 'warning' :
                  agent.health_status === 'healthy' ? 'healthy' : undefined;

                return (
                  <div key={agent.agent_name + idx} className="space-y-2 relative">
                    {/* Batch selection checkbox */}
                    {agent.id && (
                      <div className="absolute top-2 right-2 z-10">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            setSelectedBatch(prev => {
                              const next = new Set(prev);
                              if (checked) next.add(agent.id!);
                              else next.delete(agent.id!);
                              return next;
                            });
                          }}
                          className="h-4 w-4"
                        />
                      </div>
                    )}
                    <AgentCard
                      id={agent.id || ''}
                      name={agent.agent_name}
                      hostname={agent.hostname}
                      osVersion={getOsDisplayName(agent.os_type, agent.os_version || null)}
                      agentVersion={agent.agent_version}
                      isOnline={isOnline}
                      healthStatus={healthStatus}
                      lastHeartbeat={agent.last_heartbeat}
                      uptimeSeconds={agentMetrics?.uptime_seconds ?? undefined}
                      cpuPercent={agentMetrics?.cpu_usage_percent}
                      memoryPercent={agentMetrics?.memory_usage_percent}
                      diskPercent={agentMetrics?.disk_usage_percent}
                      disks={agentDisks}
                      isThrottled={agent.is_throttled}
                      isIsolated={agent.is_isolated}
                      isInSafeMode={agent.is_in_safe_mode}
                      onClick={() => agent.id && tenant?.id && setSelectedAgent({
                        id: agent.id,
                        name: agent.agent_name,
                        tenantId: tenant.id,
                        isThrottled: agent.is_throttled,
                        isIsolated: agent.is_isolated,
                        isInSafeMode: agent.is_in_safe_mode
                      })}
                    />
                    
                    {/* Auth Failure Alert for never_connected agents */}
                    {agent.health_status === 'never_connected' && agent.id && (
                      <TooltipProviderWrapper>
                        <AgentAuthFailureAlert
                          agentId={agent.id}
                          agentName={agent.agent_name}
                        />
                      </TooltipProviderWrapper>
                    )}

                    {/* Quick Actions for special states */}
                    {hasSpecialStatus && agent.id && (
                      <div className="px-4 pb-3">
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
                      <div className="px-4 pb-3">
                        <OfflineAgentActions
                          agentId={agent.id}
                          agentName={agent.agent_name}
                          tenantId={tenant.id}
                          secondsOffline={agent.seconds_since_heartbeat || 0}
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

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedIds={Array.from(selectedBatch)}
        selectedNames={filteredAgents
          .filter(a => a.id && selectedBatch.has(a.id))
          .map(a => a.agent_name)}
        onClearSelection={() => setSelectedBatch(new Set())}
      />

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
