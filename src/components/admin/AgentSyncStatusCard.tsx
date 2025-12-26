import { useAgentSyncStatus } from '@/hooks/useAgentSyncStatus';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Clock, WifiOff, HelpCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function AgentSyncStatusCard() {
  const { agents, isLoading, stats, refetch } = useAgentSyncStatus();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getSyncIcon = (status: string) => {
    switch (status) {
      case 'synced':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-warning" />;
      case 'offline':
        return <WifiOff className="h-4 w-4 text-muted-foreground" />;
      default:
        return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getSyncBadge = (status: string) => {
    switch (status) {
      case 'synced':
        return <Badge variant="outline" className="bg-success/10 text-success border-success/30">Sincronizado</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Pendente</Badge>;
      case 'offline':
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Offline</Badge>;
      default:
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Nunca sincronizado</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Status de Sincronização
          </CardTitle>
          <CardDescription>
            Última sincronização de sites bloqueados por agente
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 rounded-lg bg-success/10 border border-success/20">
            <div className="text-2xl font-bold text-success">{stats.synced}</div>
            <div className="text-xs text-muted-foreground">Sincronizados</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-warning/10 border border-warning/20">
            <div className="text-2xl font-bold text-warning">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">Pendentes</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted border">
            <div className="text-2xl font-bold text-muted-foreground">{stats.offline}</div>
            <div className="text-xs text-muted-foreground">Offline</div>
          </div>
        </div>

        {/* Agent List */}
        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            {agents.map(agent => (
              <div
                key={agent.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {getSyncIcon(agent.syncStatus)}
                  <div>
                    <div className="font-medium text-sm">
                      {agent.display_name || agent.agent_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {agent.last_block_sync_at
                        ? `Sincronizado ${formatDistanceToNow(new Date(agent.last_block_sync_at), { addSuffix: true, locale: ptBR })}`
                        : 'Nunca sincronizado'}
                    </div>
                  </div>
                </div>
                {getSyncBadge(agent.syncStatus)}
              </div>
            ))}
            {agents.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum agente ativo encontrado
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
