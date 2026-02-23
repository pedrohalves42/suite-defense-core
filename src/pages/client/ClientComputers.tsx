import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Monitor, 
  Wifi, 
  WifiOff,
  Cpu,
  HardDrive,
  MemoryStick,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/date-utils';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DiskMetricsPanel } from '@/components/agent/DiskMetricsPanel';

// Health indicator component
const HealthIndicator = ({ cpu, memory, disk }: { cpu?: number; memory?: number; disk?: number }) => {
  const getHealthStatus = () => {
    const hasData = cpu !== undefined || memory !== undefined || disk !== undefined;
    if (!hasData) return { status: 'unknown', color: 'text-muted-foreground', bg: 'bg-muted', label: 'Sem dados' };
    
    const avgUsage = [cpu, memory, disk].filter(v => v !== undefined).reduce((a, b) => a! + b!, 0)! / 
                     [cpu, memory, disk].filter(v => v !== undefined).length;
    
    if (avgUsage >= 90 || (disk && disk >= 95)) {
      return { status: 'critical', color: 'text-red-500', bg: 'bg-red-500', label: 'Crítico' };
    }
    if (avgUsage >= 70 || (disk && disk >= 85)) {
      return { status: 'warning', color: 'text-yellow-500', bg: 'bg-yellow-500', label: 'Atenção' };
    }
    return { status: 'healthy', color: 'text-green-500', bg: 'bg-green-500', label: 'Saudável' };
  };

  const health = getHealthStatus();

  const getTooltipText = () => {
    if (health.status === 'unknown') return 'Aguardando coleta de métricas';
    if (health.status === 'critical') return 'Recursos do sistema em nível crítico. Verifique uso de CPU, memória ou disco.';
    if (health.status === 'warning') return 'Uso de recursos moderadamente alto. Monitore para evitar problemas.';
    return 'Sistema funcionando normalmente. Recursos em níveis saudáveis.';
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <div className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${health.bg} animate-pulse`} />
            <span className={`text-xs font-medium ${health.color}`}>{health.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p>{getTooltipText()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const ClientComputers = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const { data: agents, isLoading } = useQuery({
    queryKey: ['client-computers', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      // ADR-026: Use agents_safe view to protect hmac_secret
      const { data: agentsData, error } = await supabase
        .from('agents_safe')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('last_heartbeat', { ascending: false, nullsFirst: false });

      if (error) throw error;

      // Fetch latest metrics for each agent
      const agentIds = agentsData?.map(a => a.id) || [];
      
      if (agentIds.length === 0) return [];

      const { data: metricsData } = await supabase
        .from('agent_system_metrics_partitioned')
        .select('agent_id, cpu_usage_percent, memory_usage_percent, disk_usage_percent, collected_at')
        .in('agent_id', agentIds)
        .order('collected_at', { ascending: false });

      // Get latest metrics per agent
      const latestMetrics: Record<string, any> = {};
      metricsData?.forEach(m => {
        if (!latestMetrics[m.agent_id]) {
          latestMetrics[m.agent_id] = m;
        }
      });

      return agentsData?.map(agent => ({
        ...agent,
        metrics: latestMetrics[agent.id] || null
      })) || [];
    },
    enabled: !!tenant?.id,
    refetchInterval: 120000, // COST-OPT: 30s → 2min
  });

  const requestVerificationMutation = useMutation({
    mutationFn: async (agentName: string) => {
      // Create multiple collection jobs for comprehensive verification
      const jobTypes = [
        'software_inventory_collect',
        'collect_antivirus_status',
        'light_vuln_scan'
      ];

      for (const jobType of jobTypes) {
        const { error } = await supabase.functions.invoke('create-job', {
          body: {
            tenant_id: tenant?.id,
            agent_name: agentName,
            job_type: jobType,
            payload: {}
          }
        });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Verificação solicitada!', {
        description: 'Os resultados estarão disponíveis em alguns minutos.'
      });
      queryClient.invalidateQueries({ queryKey: ['client-computers'] });
    },
    onError: () => {
      toast.error('Erro ao solicitar verificação', {
        description: 'Tente novamente em alguns instantes.'
      });
    }
  });

  const isOnline = (lastHeartbeat: string | null) => {
    if (!lastHeartbeat) return false;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(lastHeartbeat) > fiveMinutesAgo;
  };

  // Calculate summary stats
  const summary = agents ? {
    total: agents.length,
    online: agents.filter(a => isOnline(a.last_heartbeat)).length,
    offline: agents.filter(a => !isOnline(a.last_heartbeat)).length,
    healthy: agents.filter(a => {
      const m = a.metrics;
      if (!m) return false;
      const avg = [m.cpu_usage_percent, m.memory_usage_percent, m.disk_usage_percent]
        .filter(v => v != null)
        .reduce((a, b) => a + b, 0) / 3;
      return avg < 70;
    }).length
  } : null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meus Computadores</h1>
        <p className="text-muted-foreground">
          {agents?.length || 0} computador(es) monitorado(s)
        </p>
      </div>

      {/* Summary Cards */}
      {summary && summary.total > 0 && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Monitor className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Wifi className="h-6 w-6 mx-auto text-green-500 mb-2" />
              <p className="text-2xl font-bold text-green-600">{summary.online}</p>
              <p className="text-xs text-muted-foreground">Online</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <WifiOff className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-2xl font-bold">{summary.offline}</p>
              <p className="text-xs text-muted-foreground">Offline</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <CheckCircle2 className="h-6 w-6 mx-auto text-green-500 mb-2" />
              <p className="text-2xl font-bold text-green-600">{summary.healthy}</p>
              <p className="text-xs text-muted-foreground">Saudáveis</p>
            </CardContent>
          </Card>
        </div>
      )}

      {agents && agents.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent: any, index: number) => {
            const online = isOnline(agent.last_heartbeat);
            const metrics = agent.metrics;

            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${online ? 'bg-green-500/10' : 'bg-muted'}`}>
                          <Monitor className={`h-5 w-5 ${online ? 'text-green-600' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <h3 className="font-medium truncate max-w-[180px]">
                            {agent.display_name || agent.hostname || agent.agent_name}
                          </h3>
                          <p className="text-xs text-muted-foreground">{agent.os_type}</p>
                        </div>
                      </div>
                      <Badge variant={online ? 'default' : 'secondary'} className={online ? 'bg-green-500/10 text-green-600' : ''}>
                        {online ? (
                          <><Wifi className="h-3 w-3 mr-1" /> Online</>
                        ) : (
                          <><WifiOff className="h-3 w-3 mr-1" /> Offline</>
                        )}
                      </Badge>
                    </div>

                    {/* Health Indicator */}
                    <div className="mb-3">
                      <HealthIndicator 
                        cpu={metrics?.cpu_usage_percent}
                        memory={metrics?.memory_usage_percent}
                        disk={metrics?.disk_usage_percent}
                      />
                    </div>

                    {agent.last_heartbeat && (
                      <p className="text-xs text-muted-foreground mb-3">
                        Último sinal: {formatRelativeTime(agent.last_heartbeat)}
                      </p>
                    )}

                    {metrics && (
                      <>
                        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
                          <div className="text-center">
                            <Cpu className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                            <p className={`text-sm font-medium ${(metrics.cpu_usage_percent || 0) >= 90 ? 'text-red-500' : ''}`}>
                              {metrics.cpu_usage_percent?.toFixed(0) || '--'}%
                            </p>
                            <p className="text-xs text-muted-foreground">CPU</p>
                          </div>
                          <div className="text-center">
                            <MemoryStick className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                            <p className={`text-sm font-medium ${(metrics.memory_usage_percent || 0) >= 90 ? 'text-red-500' : ''}`}>
                              {metrics.memory_usage_percent?.toFixed(0) || '--'}%
                            </p>
                            <p className="text-xs text-muted-foreground">Memória</p>
                          </div>
                          <div className="text-center">
                            <HardDrive className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                            <p className={`text-sm font-medium ${(metrics.disk_usage_percent || 0) >= 90 ? 'text-red-500' : ''}`}>
                              {metrics.disk_usage_percent?.toFixed(0) || '--'}%
                            </p>
                            <p className="text-xs text-muted-foreground">Disco</p>
                          </div>
                        </div>
                        {/* Painel de múltiplos discos */}
                        <div className="mt-3 pt-3 border-t">
                          <DiskMetricsPanel agentId={agent.id} compact />
                        </div>
                      </>
                    )}

                    {/* Request Verification Button */}
                    {online && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-3"
                        onClick={() => requestVerificationMutation.mutate(agent.agent_name)}
                        disabled={requestVerificationMutation.isPending}
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${requestVerificationMutation.isPending ? 'animate-spin' : ''}`} />
                        Solicitar Verificação
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum computador encontrado</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Peça ao administrador para instalar o agente CyberShield nos seus computadores.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
