import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Archive, RotateCcw, Clock, Server, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime, formatBrazilDateTime } from '@/lib/date-utils';
import { getOsIcon } from '@/lib/os-utils';
import { useQueryClient } from '@tanstack/react-query';

interface ArchivedAgent {
  id: string;
  agent_name: string;
  display_name: string | null;
  hostname: string | null;
  os_type: string | null;
  status: string;
  enrolled_at: string | null;
  last_heartbeat: string | null;
  archived_at: string;
  archived_reason: string | null;
}

export default function ArchivedAgents() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const { data: archivedAgents = [], isLoading } = useQuery({
    queryKey: ['archived-agents', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data: rawData, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: true,
      });

      if (error) throw error;
      const agents = ((rawData as unknown as ArchivedAgent[]) || [])
        .filter(a => a.archived_at !== null)
        .sort((a, b) => new Date(b.archived_at!).getTime() - new Date(a.archived_at!).getTime());
      return agents;
    },
    enabled: !!tenant?.id,
  });

  const handleRestore = async (agentId: string, agentName: string) => {
    try {
      const { error } = await supabase
        .from('agents')
        .update({ 
          archived_at: null, 
          archived_reason: null,
          status: 'inactive'
        })
        .eq('id', agentId);

      if (error) throw error;

      toast.success(`${agentName} restaurado com sucesso`);
      queryClient.invalidateQueries({ queryKey: ['archived-agents'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    } catch (err) {
      toast.error(`Erro ao restaurar: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Archive className="h-6 w-6 text-muted-foreground" />
            Agentes Arquivados
          </h1>
          <p className="text-muted-foreground mt-1">
            Histórico de computadores removidos ou desativados
          </p>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {archivedAgents.length} arquivado{archivedAgents.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Archived Agents List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="h-5 w-5" />
            Computadores Arquivados
          </CardTitle>
          <CardDescription>
            Computadores que foram arquivados e não aparecem mais nos dashboards principais
          </CardDescription>
        </CardHeader>
        <CardContent>
          {archivedAgents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Archive className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Nenhum agente arquivado</p>
              <p className="text-sm">Computadores removidos aparecerão aqui</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3 pr-4">
                {archivedAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-4 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{getOsIcon(agent.os_type || 'windows')}</span>
                        <span className="font-medium">{agent.display_name || agent.agent_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {agent.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                        {agent.hostname && (
                          <p>Hostname: {agent.hostname}</p>
                        )}
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Arquivado {formatRelativeTime(agent.archived_at)}
                          </span>
                          {agent.last_heartbeat && (
                            <span>
                              Último contato: {formatBrazilDateTime(agent.last_heartbeat, 'datetime')}
                            </span>
                          )}
                        </div>
                        {agent.archived_reason && (
                          <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{agent.archived_reason}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(agent.id, agent.agent_name)}
                      className="gap-1.5"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Restaurar
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full bg-primary/10">
              <Archive className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">O que significa arquivado?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Computadores arquivados não aparecem nos dashboards, métricas ou alertas. 
                Os dados históricos (jobs, logs, métricas) são mantidos e podem ser consultados.
                Você pode restaurar um computador arquivado a qualquer momento.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
