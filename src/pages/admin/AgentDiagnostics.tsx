import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCw, 
  Terminal,
  Network,
  Activity,
  FileText,
  Shield,
  Wifi,
  Globe,
  Server
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SecurityJobDispatcher } from '@/components/admin/SecurityJobDispatcher';
import { DynamicValidationSystem } from '@/components/admin/DynamicValidationSystem';
import { useAgentNetworkInfo } from '@/hooks/useAgentNetworkInfo';
import { getOsDisplayName, getOsIcon } from '@/lib/os-utils';

interface DiagnosticIssue {
  issue_type: string;
  severity: string;
  description: string;
  details: Record<string, unknown>;
}

interface Agent {
  id: string;
  agent_name: string;
  tenant_id: string;
  status: string;
  last_heartbeat: string | null;
  os_type: string;
  hostname: string;
  enrolled_at: string;
}

export default function AgentDiagnostics() {
  const { toast } = useToast();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // Buscar todos os agentes
  const { data: agents = [], isLoading: agentsLoading, refetch: refetchAgents } = useQuery({
    queryKey: ['agents-diagnostics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents_safe')
        .select('*')
        .order('enrolled_at', { ascending: false });

      if (error) throw error;
      return data as Agent[];
    },
  });

  // Diagnostico do agente selecionado
  const { data: diagnostics = [], isLoading: diagnosticsLoading, refetch: refetchDiagnostics } = useQuery({
    queryKey: ['agent-diagnostics', selectedAgent],
    queryFn: async () => {
      if (!selectedAgent) return [];

      const agent = agents.find(a => a.id === selectedAgent);
      if (!agent) return [];

      const { data, error } = await supabase.rpc('diagnose_agent_issues', {
        p_agent_name: agent.agent_name,
        p_tenant_id: agent.tenant_id
      });

      if (error) throw error;
      return data as DiagnosticIssue[];
    },
    enabled: !!selectedAgent,
  });

  // Health check manual
  const healthCheck = useMutation({
    mutationFn: async (agentName: string) => {
      const { data, error } = await supabase.functions.invoke('validate-agent-health', {
        body: { agentName }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Health check concluido',
        description: 'Verificacao executada com sucesso',
      });
      refetchDiagnostics();
    },
    onError: (error) => {
      toast({
        title: 'Erro no health check',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'info': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'high': return <AlertCircle className="h-5 w-5 text-orange-500" />;
      case 'medium': return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'info': return <CheckCircle className="h-5 w-5 text-blue-500" />;
      default: return <Activity className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (agent: Agent) => {
    if (!agent.last_heartbeat) {
      return <Badge variant="destructive">Nunca Conectou</Badge>;
    }

    const lastSeen = new Date(agent.last_heartbeat);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);

    if (diffMinutes < 5) {
      return <Badge className="bg-green-500">Online</Badge>;
    } else if (diffMinutes < 15) {
      return <Badge className="bg-yellow-500">Inativo</Badge>;
    } else {
      return <Badge variant="destructive">Offline</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Diagnostico de Agentes</h1>
          <p className="text-muted-foreground">
            Analise detalhada de conectividade e problemas
          </p>
        </div>
        <Button onClick={() => refetchAgents()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Alert para agentes sem heartbeat */}
      {agents.filter(a => !a.last_heartbeat).length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Agentes sem comunicacao detectados</AlertTitle>
          <AlertDescription>
            {agents.filter(a => !a.last_heartbeat).length} agente(s) instalaram mas nunca enviaram heartbeat.
            <br />
            Possiveis causas:
            <ul className="list-disc list-inside mt-2">
              <li>Scheduled Task sem parametros (bug conhecido - corrigido)</li>
              <li>Firewall bloqueando saida HTTPS</li>
              <li>Credenciais invalidas (token/HMAC)</li>
            </ul>
            <div className="mt-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = '/admin/installation-logs'}
              >
                Ver Logs de Instalacao
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Agentes */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Agentes ({agents.length})
            </CardTitle>
            <CardDescription>Selecione um agente para diagnostico</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {agentsLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Carregando...
                  </p>
                ) : agents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum agente encontrado
                  </p>
                ) : (
                  agents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgent(agent.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedAgent === agent.id
                          ? 'border-primary bg-accent'
                          : 'border-border hover:bg-accent/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm truncate">
                          {agent.agent_name}
                        </span>
                        {getStatusBadge(agent)}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>OS: {getOsDisplayName(agent.os_type, null)}</p>
                        <p>Host: {agent.hostname}</p>
                        {agent.last_heartbeat && (
                          <p>
                            Ultimo heartbeat:{' '}
                            {new Date(agent.last_heartbeat).toLocaleString('pt-BR')}
                          </p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Validação Inteligente com IA */}
        <DynamicValidationSystem />

        {/* Disparador de Jobs de Segurança */}
        <SecurityJobDispatcher agents={agents} />

        {/* Diagnostico Detalhado */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Diagnostico Detalhado
            </CardTitle>
            <CardDescription>
              {selectedAgent
                ? `Analise do agente ${agents.find(a => a.id === selectedAgent)?.agent_name}`
                : 'Selecione um agente para ver o diagnostico'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedAgent ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Nenhum agente selecionado</AlertTitle>
                <AlertDescription>
                  Selecione um agente na lista a esquerda para ver o diagnostico detalhado.
                </AlertDescription>
              </Alert>
            ) : diagnosticsLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Tabs defaultValue="issues" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="issues">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Problemas
                  </TabsTrigger>
                  <TabsTrigger value="network">
                    <Network className="h-4 w-4 mr-2" />
                    Rede
                  </TabsTrigger>
                  <TabsTrigger value="logs">
                    <FileText className="h-4 w-4 mr-2" />
                    Logs
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="issues" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">
                      {diagnostics.length} problema(s) detectado(s)
                    </h3>
                    <Button
                      onClick={() => {
                        const agent = agents.find(a => a.id === selectedAgent);
                        if (agent) healthCheck.mutate(agent.agent_name);
                      }}
                      variant="outline"
                      size="sm"
                      disabled={healthCheck.isPending}
                    >
                      {healthCheck.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Activity className="h-4 w-4 mr-2" />
                      )}
                      Health Check
                    </Button>
                  </div>

                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {diagnostics.length === 0 ? (
                        <Alert>
                          <CheckCircle className="h-4 w-4" />
                          <AlertTitle>Nenhum problema detectado</AlertTitle>
                          <AlertDescription>
                            O agente esta funcionando corretamente.
                          </AlertDescription>
                        </Alert>
                      ) : (
                        diagnostics.map((issue, idx) => (
                          <Alert key={idx} className="border-l-4" style={{ borderLeftColor: getSeverityColor(issue.severity).replace('bg-', 'rgb(var(--') + '))' }}>
                            <div className="flex items-start gap-3">
                              {getSeverityIcon(issue.severity)}
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <AlertTitle className="mb-0">
                                    {issue.description}
                                  </AlertTitle>
                                  <Badge variant="outline" className={`${getSeverityColor(issue.severity)} text-white`}>
                                    {issue.severity}
                                  </Badge>
                                </div>
                                <AlertDescription>
                                  <p className="text-sm mb-2">Tipo: {issue.issue_type}</p>
                                  {issue.details && (
                                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                      {JSON.stringify(issue.details, null, 2)}
                                    </pre>
                                  )}
                                </AlertDescription>
                              </div>
                            </div>
                          </Alert>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="network" className="space-y-4">
                  <NetworkDiagnosticsTab 
                    selectedAgentId={selectedAgent} 
                    agents={agents}
                    onCollectNetworkInfo={() => {
                      const agent = agents.find(a => a.id === selectedAgent);
                      if (agent) {
                        supabase.functions.invoke('create-job', {
                          body: {
                            agentName: agent.agent_name,
                            type: 'collect_network_info',
                            payload: {},
                            approved: true,
                          },
                        }).then(() => {
                          toast({
                            title: 'Job criado',
                            description: 'Coleta de informações de rede iniciada',
                          });
                        }).catch((err) => {
                          toast({
                            title: 'Erro',
                            description: err.message,
                            variant: 'destructive',
                          });
                        });
                      }
                    }}
                  />
                </TabsContent>

                <TabsContent value="logs" className="space-y-4">
                  <Alert>
                    <FileText className="h-4 w-4" />
                    <AlertTitle>Logs do Agente</AlertTitle>
                    <AlertDescription>
                      Os logs do agente sao armazenados localmente em:
                      <br />
                      <code className="text-xs bg-muted px-2 py-1 rounded mt-2 block">
                        Windows: C:\ProgramData\CyberShield\logs\agent.log
                        <br />
                        Linux: /var/log/cybershield/agent.log
                      </code>
                    </AlertDescription>
                  </Alert>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Network Diagnostics Tab Component
function NetworkDiagnosticsTab({ 
  selectedAgentId, 
  agents,
  onCollectNetworkInfo 
}: { 
  selectedAgentId: string | null;
  agents: Agent[];
  onCollectNetworkInfo: () => void;
}) {
  const { data: networkInfo, isLoading, refetch } = useAgentNetworkInfo(selectedAgentId || '', !!selectedAgentId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!networkInfo) {
    return (
      <div className="space-y-4">
        <Alert>
          <Network className="h-4 w-4" />
          <AlertTitle>Sem dados de rede</AlertTitle>
          <AlertDescription>
            Nenhuma informação de rede coletada para este agente.
          </AlertDescription>
        </Alert>
        <Button onClick={onCollectNetworkInfo} className="w-full">
          <Wifi className="h-4 w-4 mr-2" />
          Coletar Informações de Rede
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Firewall Status */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 border rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Domain</span>
            <Shield className={`h-4 w-4 ${networkInfo.firewall_domain ? 'text-green-500' : 'text-red-500'}`} />
          </div>
          <Badge variant={networkInfo.firewall_domain ? 'default' : 'destructive'}>
            {networkInfo.firewall_domain ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
        <div className="p-3 border rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Private</span>
            <Shield className={`h-4 w-4 ${networkInfo.firewall_private ? 'text-green-500' : 'text-red-500'}`} />
          </div>
          <Badge variant={networkInfo.firewall_private ? 'default' : 'destructive'}>
            {networkInfo.firewall_private ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
        <div className="p-3 border rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Public</span>
            <Shield className={`h-4 w-4 ${networkInfo.firewall_public ? 'text-green-500' : 'text-yellow-500'}`} />
          </div>
          <Badge variant={networkInfo.firewall_public ? 'default' : 'secondary'}>
            {networkInfo.firewall_public ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
      </div>

      {/* Connectivity Tests */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 border rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">DNS</span>
          </div>
          {networkInfo.dns_test_success ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : networkInfo.dns_test_success === false ? (
            <XCircle className="h-4 w-4 text-red-500" />
          ) : (
            <span className="text-xs text-muted-foreground">N/A</span>
          )}
        </div>
        <div className="p-3 border rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">HTTPS (443)</span>
          </div>
          {networkInfo.https_test_success ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : networkInfo.https_test_success === false ? (
            <XCircle className="h-4 w-4 text-red-500" />
          ) : (
            <span className="text-xs text-muted-foreground">N/A</span>
          )}
        </div>
      </div>

      {/* Network Info */}
      <div className="space-y-2">
        {networkInfo.public_ip && (
          <div className="flex items-center justify-between p-2 bg-muted rounded">
            <span className="text-sm">IP Público</span>
            <code className="text-xs">{networkInfo.public_ip}</code>
          </div>
        )}
        {networkInfo.gateway_ip && (
          <div className="flex items-center justify-between p-2 bg-muted rounded">
            <span className="text-sm">Gateway</span>
            <code className="text-xs">{networkInfo.gateway_ip}</code>
          </div>
        )}
        {networkInfo.dns_servers.length > 0 && (
          <div className="flex items-center justify-between p-2 bg-muted rounded">
            <span className="text-sm">DNS Servers</span>
            <code className="text-xs">{networkInfo.dns_servers.join(', ')}</code>
          </div>
        )}
      </div>

      {/* Open Ports */}
      {networkInfo.open_ports.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Portas Abertas ({networkInfo.open_ports.length})</h4>
          <ScrollArea className="h-[150px]">
            <div className="space-y-1">
              {networkInfo.open_ports.slice(0, 20).map((port, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 text-xs border rounded">
                  <span className="font-mono">{port.port}/{port.protocol}</span>
                  <span className="text-muted-foreground truncate max-w-[150px]">{port.process}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
        <Button onClick={onCollectNetworkInfo} variant="outline" size="sm">
          <Wifi className="h-4 w-4 mr-2" />
          Nova Coleta
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Última coleta: {new Date(networkInfo.collected_at).toLocaleString('pt-BR')}
      </p>
    </div>
  );
}
