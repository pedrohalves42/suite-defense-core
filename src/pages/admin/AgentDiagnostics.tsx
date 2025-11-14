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
  FileText
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DiagnosticIssue {
  issue_type: string;
  severity: string;
  description: string;
  details: any;
}

interface Agent {
  id: string;
  agent_name: string;
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
        .from('agents')
        .select('*')
        .order('enrolled_at', { ascending: false });

      if (error) throw error;
      return data as Agent[];
    },
  });

  // Diagnóstico do agente selecionado
  const { data: diagnostics = [], isLoading: diagnosticsLoading, refetch: refetchDiagnostics } = useQuery({
    queryKey: ['agent-diagnostics', selectedAgent],
    queryFn: async () => {
      if (!selectedAgent) return [];

      const agent = agents.find(a => a.id === selectedAgent);
      if (!agent) return [];

      const { data, error } = await supabase.rpc('diagnose_agent_issues', {
        p_agent_name: agent.agent_name
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
        title: 'Health check concluído',
        description: 'Verificação executada com sucesso',
      });
      refetchDiagnostics();
    },
    onError: (error: any) => {
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
          <h1 className="text-3xl font-bold">Diagnóstico de Agentes</h1>
          <p className="text-muted-foreground">
            Análise detalhada de conectividade e problemas
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
          <AlertTitle>Agentes sem comunicação detectados</AlertTitle>
          <AlertDescription>
            {agents.filter(a => !a.last_heartbeat).length} agente(s) instalaram mas nunca enviaram heartbeat.
            <br />
            Possíveis causas:
            <ul className="list-disc list-inside mt-2">
              <li>Scheduled Task sem parâmetros (bug conhecido - corrigido)</li>
              <li>Firewall bloqueando saída HTTPS</li>
              <li>Credenciais inválidas (token/HMAC)</li>
            </ul>
            <div className="mt-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = '/admin/installation-logs'}
              >
                Ver Logs de Instalação
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
            <CardDescription>Selecione um agente para diagnóstico</CardDescription>
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
                        <p>OS: {agent.os_type}</p>
                        <p>Host: {agent.hostname}</p>
                        {agent.last_heartbeat && (
                          <p>
                            Último heartbeat:{' '}
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

        {/* Diagnóstico Detalhado */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Diagnóstico Detalhado
            </CardTitle>
            <CardDescription>
              {selectedAgent
                ? `Análise do agente ${agents.find(a => a.id === selectedAgent)?.agent_name}`
                : 'Selecione um agente para ver o diagnóstico'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedAgent ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Nenhum agente selecionado</AlertTitle>
                <AlertDescription>
                  Selecione um agente na lista à esquerda para ver o diagnóstico detalhado.
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
                            O agente está funcionando corretamente.
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
                  <Alert>
                    <Network className="h-4 w-4" />
                    <AlertTitle>Testes de Conectividade</AlertTitle>
                  <AlertDescription className="space-y-2 mt-2">
                      <div className="space-y-1">
                        <p className="font-medium">Checklist de Rede:</p>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          <li>Porta 443 (HTTPS) deve estar aberta</li>
                          <li>Firewall deve permitir conexões saindo para *.supabase.co</li>
                          <li>Proxy corporativo deve permitir WebSocket (wss://)</li>
                          <li>DNS deve resolver o domínio do Supabase</li>
                        </ul>
                      </div>
                    </AlertDescription>
                  </Alert>
                </TabsContent>

                <TabsContent value="logs" className="space-y-4">
                  <Alert>
                    <FileText className="h-4 w-4" />
                    <AlertTitle>Logs do Agente</AlertTitle>
                    <AlertDescription>
                      Os logs do agente são armazenados localmente em:
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
