import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, CheckCircle2, XCircle, Clock, Monitor, Activity, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';


const StatusPage = () => {
  
  const { tenant } = useTenant();

  const { data: agents, isLoading } = useQuery({
    queryKey: ['status-page-agents', tenant],
    queryFn: async () => {
      if (!tenant) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('agents')
        .select('id, hostname, status, last_seen, agent_version')
        .eq('tenant_id', tenant?.id ?? '')
        .eq('is_archived', false)
        .order('hostname');
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant,
    refetchInterval: false,
    staleTime: 300_000,
    refetchOnWindowFocus: true,
  });

  const onlineCount = agents?.filter((a: Record<string, unknown>) => a.status === 'online').length || 0;
  const offlineCount = agents?.filter((a: Record<string, unknown>) => a.status === 'offline').length || 0;
  const totalCount = agents?.length || 0;
  const uptimePercent = totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 0;

  const overallStatus = uptimePercent === 100 ? 'operational' : uptimePercent >= 80 ? 'degraded' : 'outage';

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Shield className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Status da Proteção</h1>
        </div>
        <p className="text-sm text-muted-foreground">Visão em tempo real dos endpoints protegidos</p>
      </div>

      {/* Overall Status Banner */}
      <Card className={cn(
        "border-2",
        overallStatus === 'operational' && "border-green-500/30 bg-green-500/5",
        overallStatus === 'degraded' && "border-yellow-500/30 bg-yellow-500/5",
        overallStatus === 'outage' && "border-destructive/30 bg-destructive/5",
      )}>
        <CardContent className="pt-6 text-center">
          <div className={cn(
            "w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3",
            overallStatus === 'operational' && "bg-green-500/10",
            overallStatus === 'degraded' && "bg-yellow-500/10",
            overallStatus === 'outage' && "bg-destructive/10",
          )}>
            {overallStatus === 'operational' ? (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            ) : overallStatus === 'degraded' ? (
              <Clock className="h-8 w-8 text-yellow-500" />
            ) : (
              <XCircle className="h-8 w-8 text-destructive" />
            )}
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {overallStatus === 'operational' && 'Todos os Sistemas Operacionais'}
            {overallStatus === 'degraded' && 'Desempenho Parcial'}
            {overallStatus === 'outage' && 'Falha Detectada'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {uptimePercent}% dos endpoints online
          </p>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Monitor className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <div className="text-2xl font-bold text-foreground">{totalCount}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Wifi className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <div className="text-2xl font-bold text-green-500">{onlineCount}</div>
            <div className="text-xs text-muted-foreground">Online</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <WifiOff className="h-5 w-5 mx-auto text-destructive mb-1" />
            <div className="text-2xl font-bold text-destructive">{offlineCount}</div>
            <div className="text-xs text-muted-foreground">Offline</div>
          </CardContent>
        </Card>
      </div>

      {/* Agent List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Endpoints Monitorados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : agents && agents.length > 0 ? (
            <div className="space-y-2">
              {agents.map((agent: any) => {
                const isOnline = agent.status === 'online';
                const lastSeen = agent.last_seen
                  ? formatDistanceToNow(new Date(agent.last_seen), { addSuffix: true, locale: ptBR })
                  : 'nunca';

                return (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-2.5 h-2.5 rounded-full",
                        isOnline ? "bg-green-500" : "bg-destructive"
                      )} />
                      <div>
                        <div className="text-sm font-medium text-foreground">{agent.hostname || 'Sem nome'}</div>
                        <div className="text-xs text-muted-foreground">Visto {lastSeen}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {agent.agent_version && (
                        <Badge variant="secondary" className="text-[10px]">v{agent.agent_version}</Badge>
                      )}
                      <Badge variant={isOnline ? 'default' : 'destructive'} className="text-[10px]">
                        {isOnline ? 'Online' : 'Offline'}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhum endpoint cadastrado ainda.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground">
        Atualizado automaticamente a cada 30 segundos • Protegido por CyberShield
      </div>
    </div>
  );
};

export default StatusPage;
