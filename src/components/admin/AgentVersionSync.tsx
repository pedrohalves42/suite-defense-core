import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Check, AlertTriangle, Clock, Copy, Bomb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { prepareJobForInsert } from "@/lib/job-utils";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Agent {
  id: string;
  agent_name: string;
  agent_version: string | null;
  status: string;
  last_heartbeat: string | null;
  os_type: string | null;
  tenant_id: string;
  force_update_version?: string | null;
  force_update_delivered_count?: number | null;
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
  const { activeTenant: tenant, loading: tenantLoading } = useActiveTenant();
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingAgent, setSyncingAgent] = useState<string | null>(null);
  const [nuclearLoading, setNuclearLoading] = useState(false);
  const [nuclearCommands, setNuclearCommands] = useState<{
    powershell_oneliner: string;
    outdated_agents: { id: string; name: string; current_version: string; force_update_delivered_count: number }[];
    latest_version: string;
  } | null>(null);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents-for-sync', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false
      });
      
      if (error) throw error;
      return ((data || []) as any[])
        .filter((a: any) => a.status === 'active')
        .map((a: any): Agent => ({
          id: a.id,
          agent_name: a.agent_name,
          agent_version: a.agent_version,
          status: a.status,
          last_heartbeat: a.last_heartbeat,
          os_type: a.os_type,
          tenant_id: a.tenant_id,
          force_update_version: a.force_update_version,
          force_update_delivered_count: a.force_update_delivered_count,
        }))
        .sort((a: Agent, b: Agent) => a.agent_name.localeCompare(b.agent_name));
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: 30000
  });

  const getLatestVersionForAgent = (agent: Agent): string => {
    const osType = agent.os_type?.toLowerCase() || 'windows';
    if (osType.includes('linux')) return latestVersions.linux;
    if (osType.includes('mac') || osType.includes('darwin')) return latestVersions.macos;
    return latestVersions.windows;
  };

  const isUpToDate = (agent: Agent): boolean => {
    if (!agent.agent_version) return false;
    return agent.agent_version === getLatestVersionForAgent(agent);
  };

  const isOnline = (agent: Agent): boolean => {
    if (!agent.last_heartbeat) return false;
    const lastHeartbeat = new Date(agent.last_heartbeat);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return lastHeartbeat > fiveMinutesAgo;
  };

  const stuckAgents = agents.filter(a => 
    a.force_update_version && 
    !isUpToDate(a) && 
    (a.force_update_delivered_count || 0) >= 5
  );

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

  const handleSyncAgent = async (agent: Agent) => {
    setSyncingAgent(agent.id);
    try {
      await createUpdateJob.mutateAsync(agent);
    } finally {
      setSyncingAgent(null);
    }
  };

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

  const handleNuclearReinstall = async () => {
    if (!tenant?.id) return;
    setNuclearLoading(true);
    try {
      const response = await supabase.functions.invoke('force-reinstall-fleet', {
        body: { tenant_id: tenant.id }
      });

      if (response.error) throw response.error;

      const result = response.data;
      setNuclearCommands({
        powershell_oneliner: result.commands.powershell_oneliner,
        outdated_agents: result.outdated_agents,
        latest_version: result.latest_version
      });
      toast.success('Comandos de reinstalação gerados!');
    } catch (error: any) {
      toast.error(`Erro ao gerar comandos: ${error.message}`);
    } finally {
      setNuclearLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
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
    <div className="space-y-4">
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
              const isStuck = stuckAgents.some(s => s.id === agent.id);

              return (
                <div
                  key={agent.id}
                  className={`flex items-center justify-between py-2 px-3 rounded-md ${
                    isStuck ? 'bg-destructive/10 border border-destructive/30' : 'bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">
                        {agent.agent_name}
                        {isStuck && (
                          <Badge variant="destructive" className="ml-2 text-[10px] px-1 py-0">
                            STUCK
                          </Badge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {agent.agent_version || 'N/A'} → {latestVersion}
                        {isStuck && ` (${agent.force_update_delivered_count || 0}x tentado)`}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {online ? (
                      <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30 border-green-500 text-xs">
                        Online
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 dark:bg-gray-950/30 border-gray-400 text-xs">
                        Offline
                      </Badge>
                    )}
                    
                    {upToDate ? (
                      <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30 border-green-500 text-xs gap-1">
                        <Check className="h-3 w-3" />
                        Atualizado
                      </Badge>
                    ) : (
                      <>
                        <Badge variant="outline" className="bg-orange-50 dark:bg-orange-950/30 border-orange-500 text-xs gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {isStuck ? 'Não suporta auto-update' : 'Desatualizado'}
                        </Badge>
                        {!isStuck && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSyncAgent(agent)}
                            disabled={syncingAgent === agent.id || !online}
                            className="h-7 px-2 text-xs"
                            title={!online ? 'Agente offline' : 'Criar job de update'}
                          >
                            {syncingAgent === agent.id ? (
                              <Clock className="h-3 w-3 animate-pulse" />
                            ) : (
                              'Atualizar'
                            )}
                          </Button>
                        )}
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

      {/* Nuclear Reinstall Section */}
      {(stuckAgents.length > 0 || outdatedCount > 0) && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <Bomb className="h-4 w-4" />
                Reinstalação Nuclear
              </CardTitle>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleNuclearReinstall}
                disabled={nuclearLoading}
                className="gap-1"
              >
                {nuclearLoading ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Bomb className="h-3 w-3" />
                )}
                {nuclearLoading ? 'Gerando...' : 'Gerar Comandos'}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {stuckAgents.length > 0 
                ? `${stuckAgents.length} agente(s) não suportam auto-update. Use o comando abaixo via RMM/GPO ou acesso remoto.`
                : `${outdatedCount} agente(s) desatualizados. Use reinstalação nuclear se a atualização normal falhar.`
              }
            </p>
          </CardHeader>

          {nuclearCommands && (
            <CardContent className="pt-0 space-y-4">
              <Collapsible defaultOpen>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs w-full justify-start">
                    📋 Comando PowerShell (executar como Admin em cada máquina)
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="relative">
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono">
                      {nuclearCommands.powershell_oneliner}
                    </pre>
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute top-2 right-2 h-7 px-2"
                      onClick={() => copyToClipboard(nuclearCommands.powershell_oneliner)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Agentes alvo ({nuclearCommands.outdated_agents.length}):</strong></p>
                <ul className="list-disc list-inside">
                  {nuclearCommands.outdated_agents.map(a => (
                    <li key={a.id}>{a.name} ({a.current_version} → v{nuclearCommands.latest_version})</li>
                  ))}
                </ul>
                <p className="mt-2"><strong>Instruções:</strong></p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Execute o comando como Administrador em cada máquina</li>
                  <li>Para deploy em massa, use via RMM (ConnectWise, Datto) ou GPO</li>
                  <li>Aguarde 2-3 minutos e verifique o dashboard</li>
                </ol>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
