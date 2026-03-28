import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, Monitor, Clock, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBrazilDateTime } from '@/lib/date-utils';
import type { Agent } from './types';

interface AgentsListProps {
  sortedAgents: Agent[];
  getTimeSince: (date: string | null) => string;
}

function getStatusBadge(status: string, lastHeartbeat: string | null) {
  if (!lastHeartbeat) {
    return (
      <Badge variant="secondary" className="gap-1">
        <WifiOff className="h-3 w-3" />
        Sem Sinal
      </Badge>
    );
  }

  const minutesSinceHeartbeat = (Date.now() - new Date(lastHeartbeat).getTime()) / 1000 / 60;

  if (minutesSinceHeartbeat < 2) {
    return (
      <Badge className="bg-green-500 gap-1">
        <Wifi className="h-3 w-3" />
        Online
      </Badge>
    );
  } else if (minutesSinceHeartbeat < 5) {
    return (
      <Badge className="bg-yellow-500 gap-1">
        <AlertTriangle className="h-3 w-3" />
        Atenção
      </Badge>
    );
  } else {
    return (
      <Badge className="bg-red-500 gap-1">
        <WifiOff className="h-3 w-3" />
        Offline
      </Badge>
    );
  }
}

export function AgentsList({ sortedAgents, getTimeSince }: AgentsListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Status dos Computadores
        </CardTitle>
        <CardDescription>
          Atualização em tempo real — computadores com problemas aparecem primeiro
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedAgents.length === 0 ? (
            <div className="text-center py-8">
              <Monitor className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">Nenhum computador cadastrado</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Use uma chave de registro para adicionar computadores</p>
            </div>
          ) : (
            sortedAgents.map((agent) => {
              const minutesSinceHeartbeat = agent.last_heartbeat
                ? (Date.now() - new Date(agent.last_heartbeat).getTime()) / 1000 / 60
                : 999;
              const isOffline = minutesSinceHeartbeat >= 5;
              const isWarning = minutesSinceHeartbeat >= 2 && minutesSinceHeartbeat < 5;

              return (
                <div
                  key={agent.id}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-lg border transition-colors",
                    isOffline ? "bg-red-500/5 border-red-500/30" :
                    isWarning ? "bg-yellow-500/5 border-yellow-500/30" :
                    "bg-card hover:bg-accent/5"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-3 h-3 rounded-full animate-pulse",
                      isOffline ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-green-500'
                    )} />
                    <div>
                      <p className="font-medium">{agent.agent_name}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        Último sinal: {getTimeSince(agent.last_heartbeat)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Registrado: {formatBrazilDateTime(agent.enrolled_at, 'datetime')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(agent.status, agent.last_heartbeat)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
