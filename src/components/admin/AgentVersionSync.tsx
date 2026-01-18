import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Check, AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { prepareJobForInsert } from "@/lib/job-utils";
import { useTenant } from "@/hooks/useTenant";

interface Agent {
  id: string;
  agent_name: string;
  agent_version: string | null;
  status: string;
  last_heartbeat: string | null;
  os_type: string | null;
  tenant_id: string;
}

interface LatestVersions {
  windows: string;
  linux: string;
  macos: string;
}

interface AgentVersionSyncProps {
  latestVersions: LatestVersions;
}

export function AgentVersionSync({ latestVersions }: AgentVersionSyncProps) {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingAgent, setSyncingAgent] = useState<string | null>(null);

  // Fetch active agents - FILTERED BY TENANT
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents-for-sync', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      // ADR-026: Use agents_safe view to protect hmac_secret
      const { data, error } = await supabase
        .from('agents_safe')
        .select('id, agent_name, agent_version, status, last_heartbeat, os_type, tenant_id')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active')
        .is('archived_at', null)
        .order('agent_name');
      
      if (error) throw error;
      return data as (Agent & { tenant_id: string })[];
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000 // Refresh every 30s
  });

  // Determine latest version for an agent based on OS type
  const getLatestVersionForAgent = (agent: Agent): string => {
    const osType = agent.os_type?.toLowerCase() || 'windows';
    if (osType.includes('linux')) return latestVersions.linux;
    if (osType.includes('mac') || osType.includes('darwin')) return latestVersions.macos;
    return latestVersions.windows;
  };

  // Check if agent is up to date
  const isUpToDate = (agent: Agent): boolean => {
    if (!agent.agent_version) return false;
    const latest = getLatestVersionForAgent(agent);
    return agent.agent_version === latest;
  };

  // Check if agent is online (heartbeat within 5 minutes)
  const isOnline = (agent: Agent): boolean => {
    if (!agent.last_heartbeat) return false;
    const lastHeartbeat = new Date(agent.last_heartbeat);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return lastHeartbeat > fiveMinutesAgo;
  };

  // Create update job for single agent
  const createUpdateJob = useMutation({
    mutationFn: async (agent: Agent) => {
      const targetVersion = getLatestVersionForAgent(agent);
      
      const jobData = await prepareJobForInsert({
        tenant_id: agent.tenant_id,
        agent_name: agent.agent_name,
        type: 'update_agent',
        status: 'queued',
        payload: { target_version: targetVersion, force: true },
        approved: true
      });
      
      const { data, error } = await supabase
        .from('jobs')
        .insert([jobData])
        .select()
        .single();

      if (error) throw error;
      return { agent, job: data };
    },
    onSuccess: ({ agent }) => {
      toast.success(`Job de update criado para ${agent.agent_name}`);
      queryClient.invalidateQueries({ queryKey: ['agents-for-sync'] });
    },
    onError: (error, agent) => {
      toast.error(`Erro ao criar job para ${agent.agent_name}: ${error.message}`);
    }
  });

  // Sync single agent
  const handleSyncAgent = async (agent: Agent) => {
    setSyncingAgent(agent.id);
    try {
      await createUpdateJob.mutateAsync(agent);
    } finally {
      setSyncingAgent(null);
    }
  };

  // Sync all outdated agents
  const handleSyncAll = async () => {
    const outdatedAgents = agents.filter(a => !isUpToDate(a) && isOnline(a));
    
    if (outdatedAgents.length === 0) {
      toast.info('Todos os agentes online já estão atualizados');
      return;
    }

    setSyncingAll(true);
    try {
      let successCount = 0;
      let errorCount = 0;

      for (const agent of outdatedAgents) {
        try {
          await createUpdateJob.mutateAsync(agent);
          successCount++;
        } catch {
          errorCount++;
        }
      }

      if (errorCount === 0) {
        toast.success(`${successCount} jobs de update criados com sucesso`);
      } else {
        toast.warning(`${successCount} jobs criados, ${errorCount} erros`);
      }
    } finally {
      setSyncingAll(false);
    }
  };

  const outdatedCount = agents.filter(a => !isUpToDate(a)).length;
  const onlineCount = agents.filter(a => isOnline(a)).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Carregando agentes...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Sincronização de Versões
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {outdatedCount} de {agents.length} desatualizados • {onlineCount} online
            </span>
            <Button
              size="sm"
              onClick={handleSyncAll}
              disabled={syncingAll || outdatedCount === 0}
              className="gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${syncingAll ? 'animate-spin' : ''}`} />
              {syncingAll ? 'Sincronizando...' : 'Sync All'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {agents.map((agent) => {
            const upToDate = isUpToDate(agent);
            const online = isOnline(agent);
            const latestVersion = getLatestVersionForAgent(agent);

            return (
              <div
                key={agent.id}
                className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{agent.agent_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {agent.agent_version || 'N/A'} → {latestVersion}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Online/Offline indicator */}
                  {online ? (
                    <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30 border-green-500 text-xs">
                      Online
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-50 dark:bg-gray-950/30 border-gray-400 text-xs">
                      Offline
                    </Badge>
                  )}
                  
                  {/* Version status */}
                  {upToDate ? (
                    <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30 border-green-500 text-xs gap-1">
                      <Check className="h-3 w-3" />
                      Atualizado
                    </Badge>
                  ) : (
                    <>
                      <Badge variant="outline" className="bg-orange-50 dark:bg-orange-950/30 border-orange-500 text-xs gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Desatualizado
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSyncAgent(agent)}
                        disabled={syncingAgent === agent.id || !online}
                        className="h-7 px-2 text-xs"
                        title={!online ? 'Agente offline - aguarde conexão' : 'Criar job de update'}
                      >
                        {syncingAgent === agent.id ? (
                          <Clock className="h-3 w-3 animate-pulse" />
                        ) : (
                          'Atualizar'
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {agents.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              Nenhum agente ativo encontrado
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
