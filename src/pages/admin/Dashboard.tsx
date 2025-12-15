import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/hooks/useTenant';
import { Activity, Shield, Server, AlertTriangle, CheckCircle, Wifi, WifiOff, Clock, HardDrive, Cpu, MemoryStick, CheckCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { getAgentDisplayName, getAgentStatusInfo, formatRelativeTimePt } from '@/lib/agent-utils';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

interface AgentWithMetrics {
  id: string;
  agent_name: string;
  hostname: string | null;
  display_name: string | null;
  status: string;
  last_heartbeat: string | null;
  os_type: string | null;
  agent_version: string | null;
  cpu_usage?: number | null;
  memory_usage?: number | null;
  disk_usage?: number | null;
  uptime_seconds?: number | null;
}

export default function Dashboard() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const onboardingParam = searchParams.get('onboarding');
    if (onboardingParam === 'true') {
      setShowOnboarding(true);
      searchParams.delete('onboarding');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch agents with their latest metrics
  const { data: agentsWithMetrics, isLoading: agentsLoading } = useQuery({
    queryKey: ['dashboard-agents-metrics', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      // Fetch agents
      const { data: agents, error: agentsError } = await supabase
        .from('agents')
        .select('id, agent_name, hostname, display_name, status, last_heartbeat, os_type, agent_version')
        .eq('tenant_id', tenant.id)
        .order('last_heartbeat', { ascending: false, nullsFirst: false });

      if (agentsError) throw agentsError;
      if (!agents || agents.length === 0) return [];

      // Fetch latest metrics for each agent from partitioned table
      const agentIds = agents.map(a => a.id);
      const { data: metrics } = await supabase
        .from('agent_system_metrics_partitioned')
        .select('agent_id, cpu_usage_percent, memory_usage_percent, disk_usage_percent, uptime_seconds')
        .in('agent_id', agentIds)
        .order('collected_at', { ascending: false });

      // Create a map of latest metrics per agent
      const metricsMap = new Map<string, any>();
      metrics?.forEach(m => {
        if (!metricsMap.has(m.agent_id)) {
          metricsMap.set(m.agent_id, m);
        }
      });

      // Merge agents with metrics
      return agents.map(agent => ({
        ...agent,
        cpu_usage: metricsMap.get(agent.id)?.cpu_usage_percent,
        memory_usage: metricsMap.get(agent.id)?.memory_usage_percent,
        disk_usage: metricsMap.get(agent.id)?.disk_usage_percent,
        uptime_seconds: metricsMap.get(agent.id)?.uptime_seconds,
      })) as AgentWithMetrics[];
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000, // Refresh every 30s
  });

  // Fetch critical alerts
  const { data: criticalAlerts } = useQuery({
    queryKey: ['critical-alerts', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('system_alerts')
        .select('*')
        .eq('tenant_id', tenant.id)
        .in('severity', ['critical', 'high'])
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000,
  });

  // Fetch recent jobs
  const { data: recentJobs } = useQuery({
    queryKey: ['dashboard-recent-jobs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('jobs_normalized')
        .select('id, agent_name, type, normalized_status, created_at, completed_at')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  // Mutation for acknowledging all alerts
  const acknowledgeAllMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant não encontrado');
      const { data, error } = await supabase.rpc('acknowledge_all_alerts', {
        p_tenant_id: tenant.id
      });
      if (error) throw error;
      return data as { success: boolean; acknowledged_count: number } | null;
    },
    onSuccess: (data) => {
      const count = (data as any)?.acknowledged_count || 0;
      toast.success(`${count} alerta(s) reconhecido(s) com sucesso`);
      queryClient.invalidateQueries({ queryKey: ['critical-alerts'] });
    },
    onError: (error: any) => {
      toast.error(`Erro ao reconhecer alertas: ${error.message}`);
    }
  });

  // Calculate summary stats
  const onlineAgents = agentsWithMetrics?.filter(a => {
    const status = getAgentStatusInfo(a);
    return status.isOnline;
  }).length || 0;

  const offlineAgents = (agentsWithMetrics?.length || 0) - onlineAgents;

  const formatUptime = (seconds: number | null | undefined) => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getJobTypeName = (type: string) => {
    const names: Record<string, string> = {
      software_inventory_collect: 'Inventário',
      light_vuln_scan: 'Vulnerabilidades',
      collect_antivirus_status: 'Antivírus',
      collect_web_activity: 'Web',
      update_agent: 'Atualização',
    };
    return names[type] || type;
  };

  if (agentsLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Painel de Controle</h2>
        <p className="text-muted-foreground">
          Visão geral dos seus computadores protegidos
        </p>
      </div>

      {/* Critical Alerts */}
      {criticalAlerts && criticalAlerts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-l-4 border-destructive bg-destructive/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Alertas Críticos ({criticalAlerts.length})
                </CardTitle>
                <Button 
                  onClick={() => acknowledgeAllMutation.mutate()}
                  disabled={acknowledgeAllMutation.isPending}
                  variant="outline"
                  size="sm"
                  className="gap-1"
                >
                  <CheckCheck className="h-4 w-4" />
                  {acknowledgeAllMutation.isPending ? "Reconhecendo..." : "Reconhecer Todos"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {criticalAlerts.slice(0, 3).map(alert => (
                <div key={alert.id} className="flex justify-between items-center p-2 bg-background rounded">
                  <span className="text-sm">{alert.message}</span>
                  <Badge variant="destructive">{alert.severity}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-l-4 border-green-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wifi className="h-4 w-4 text-green-500" />
                Computadores Online
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{onlineAgents}</div>
              <p className="text-xs text-muted-foreground">de {agentsWithMetrics?.length || 0} total</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-l-4 border-red-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <WifiOff className="h-4 w-4 text-red-500" />
                Computadores Offline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{offlineAgents}</div>
              <p className="text-xs text-muted-foreground">precisam de atenção</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-l-4 border-blue-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                Tarefas Recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{recentJobs?.length || 0}</div>
              <p className="text-xs text-muted-foreground">últimas 24 horas</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Agents Grid - Individual Cards per Computer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Seus Computadores
          </CardTitle>
          <CardDescription>Status em tempo real de cada máquina protegida</CardDescription>
        </CardHeader>
        <CardContent>
          {!agentsWithMetrics || agentsWithMetrics.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum computador cadastrado ainda.</p>
              <p className="text-sm">Acesse "Chaves de Instalação" para adicionar seu primeiro computador.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agentsWithMetrics.map((agent, idx) => {
                const statusInfo = getAgentStatusInfo(agent);
                const displayName = getAgentDisplayName(agent);
                
                return (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Card className={cn(
                      "hover:shadow-md transition-all",
                      statusInfo.isOnline ? "border-green-200 dark:border-green-900" : "border-red-200 dark:border-red-900"
                    )}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base font-medium truncate" title={displayName}>
                            {displayName}
                          </CardTitle>
                          <Badge variant={statusInfo.variant} className="shrink-0">
                            {statusInfo.isOnline ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
                            {statusInfo.label}
                          </Badge>
                        </div>
                        <CardDescription className="flex items-center gap-2 text-xs">
                          <span>{agent.os_type || 'Windows'}</span>
                          {agent.agent_version && (
                            <>
                              <span>•</span>
                              <span>v{agent.agent_version.replace('v', '')}</span>
                            </>
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Last seen */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>Último sinal: {formatRelativeTimePt(agent.last_heartbeat)}</span>
                        </div>

                        {/* Metrics */}
                        {statusInfo.isOnline && (
                          <div className="space-y-2">
                            {/* CPU */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="flex items-center gap-1">
                                  <Cpu className="h-3 w-3" />
                                  CPU
                                </span>
                                <span>{agent.cpu_usage != null ? `${Math.round(agent.cpu_usage)}%` : 'N/A'}</span>
                              </div>
                              {agent.cpu_usage != null && (
                                <Progress value={agent.cpu_usage} className="h-1" />
                              )}
                            </div>

                            {/* Memory */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="flex items-center gap-1">
                                  <MemoryStick className="h-3 w-3" />
                                  Memória
                                </span>
                                <span>{agent.memory_usage != null ? `${Math.round(agent.memory_usage)}%` : 'N/A'}</span>
                              </div>
                              {agent.memory_usage != null && (
                                <Progress value={agent.memory_usage} className="h-1" />
                              )}
                            </div>

                            {/* Disk */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="flex items-center gap-1">
                                  <HardDrive className="h-3 w-3" />
                                  Disco
                                </span>
                                <span>{agent.disk_usage != null ? `${Math.round(agent.disk_usage)}%` : 'N/A'}</span>
                              </div>
                              {agent.disk_usage != null && (
                                <Progress value={agent.disk_usage} className="h-1" />
                              )}
                            </div>

                            {/* Uptime */}
                            <div className="text-xs text-muted-foreground pt-1">
                              Ligado há: {formatUptime(agent.uptime_seconds)}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Jobs */}
      {recentJobs && recentJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Últimas Tarefas Executadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <div className="space-y-2">
                {recentJobs.map(job => {
                  // Find agent display name
                  const agent = agentsWithMetrics?.find(a => a.agent_name === job.agent_name);
                  const agentDisplay = agent ? getAgentDisplayName(agent) : job.agent_name;
                  
                  return (
                    <div key={job.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-sm font-medium">{getJobTypeName(job.type)}</p>
                          <p className="text-xs text-muted-foreground">{agentDisplay}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          job.normalized_status === 'completed' ? 'default' :
                          job.normalized_status === 'failed' ? 'destructive' :
                          'secondary'
                        }>
                          {job.normalized_status === 'completed' && <CheckCircle className="h-3 w-3 mr-1" />}
                          {job.normalized_status === 'completed' ? 'Concluído' :
                           job.normalized_status === 'failed' ? 'Falhou' :
                           'Em andamento'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTimePt(job.created_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <OnboardingWizard 
        open={showOnboarding} 
        onComplete={() => setShowOnboarding(false)} 
      />
    </div>
  );
}
