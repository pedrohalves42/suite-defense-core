import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Monitor, 
  Wifi, 
  WifiOff,
  Cpu,
  HardDrive,
  MemoryStick
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/date-utils';

export const ClientComputers = () => {
  const { tenant } = useTenant();

  const { data: agents, isLoading } = useQuery({
    queryKey: ['client-computers', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data: agentsData, error } = await supabase
        .from('agents')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('last_heartbeat', { ascending: false, nullsFirst: false });

      if (error) throw error;

      // Fetch latest metrics for each agent
      const agentIds = agentsData?.map(a => a.id) || [];
      
      if (agentIds.length === 0) return [];

      const { data: metricsData } = await supabase
        .from('agent_system_metrics')
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
    refetchInterval: 30000
  });

  const isOnline = (lastHeartbeat: string | null) => {
    if (!lastHeartbeat) return false;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(lastHeartbeat) > fiveMinutesAgo;
  };

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

      {agents && agents.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent: any) => {
            const online = isOnline(agent.last_heartbeat);
            const metrics = agent.metrics;

            return (
              <Card key={agent.id} className="overflow-hidden">
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

                  {agent.last_heartbeat && (
                    <p className="text-xs text-muted-foreground mb-3">
                      Último sinal: {formatRelativeTime(agent.last_heartbeat)}
                    </p>
                  )}

                  {metrics && (
                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
                      <div className="text-center">
                        <Cpu className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                        <p className="text-sm font-medium">
                          {metrics.cpu_usage_percent?.toFixed(0) || '--'}%
                        </p>
                        <p className="text-xs text-muted-foreground">CPU</p>
                      </div>
                      <div className="text-center">
                        <MemoryStick className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                        <p className="text-sm font-medium">
                          {metrics.memory_usage_percent?.toFixed(0) || '--'}%
                        </p>
                        <p className="text-xs text-muted-foreground">Memória</p>
                      </div>
                      <div className="text-center">
                        <HardDrive className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                        <p className="text-sm font-medium">
                          {metrics.disk_usage_percent?.toFixed(0) || '--'}%
                        </p>
                        <p className="text-xs text-muted-foreground">Disco</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
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
