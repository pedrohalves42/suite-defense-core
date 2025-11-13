import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertCircle, CheckCircle2, XCircle, RefreshCw, Terminal, Shield } from "lucide-react";
import { toast } from "sonner";

interface ProblematicAgent {
  id: string;
  agent_name: string;
  status: string;
  created_at: string;
  minutes_since_creation: number;
  installation_success: boolean | null;
  network_connectivity: boolean | null;
  metadata: any;
}

export default function AgentTroubleshooting() {
  const [regeneratingAgent, setRegeneratingAgent] = useState<string | null>(null);

  // Query para buscar agentes problemáticos
  const { data: problematicAgents, isLoading, refetch } = useQuery({
    queryKey: ["problematic-agents"],
    queryFn: async () => {
      // Buscar agentes em pending sem heartbeat há mais de 5 minutos
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data: agents, error: agentsError } = await supabase
        .from('agents')
        .select('id, agent_name, status, enrolled_at, last_heartbeat')
        .eq('status', 'pending')
        .is('last_heartbeat', null)
        .lt('enrolled_at', fiveMinutesAgo)
        .order('enrolled_at', { ascending: false });

      if (agentsError) throw agentsError;
      if (!agents) return [];

      // Buscar telemetria de instalação para esses agentes
      const agentIds = agents.map(a => a.id);
      if (agentIds.length === 0) return [];

      const { data: analytics } = await supabase
        .from('installation_analytics')
        .select('agent_id, metadata')
        .eq('event_type', 'post_installation')
        .in('agent_id', agentIds);

      // Combinar dados
      const result: ProblematicAgent[] = agents.map(agent => {
        const agentAnalytics = analytics?.find(a => a.agent_id === agent.id);
        const minutesSince = Math.floor((Date.now() - new Date(agent.enrolled_at).getTime()) / 60000);
        
        const metadata = agentAnalytics?.metadata as any || {};
        
        return {
          id: agent.id,
          agent_name: agent.agent_name,
          status: agent.status,
          created_at: agent.enrolled_at,
          minutes_since_creation: minutesSince,
          installation_success: metadata?.success ?? null,
          network_connectivity: metadata?.network_tests?.health_check_passed ?? null,
          metadata: metadata
        };
      });

      return result;
    },
    refetchInterval: 30000, // Atualizar a cada 30s
  });

  const handleRegenerateCredentials = async (agentId: string, agentName: string) => {
    setRegeneratingAgent(agentId);
    try {
      // Deletar agente atual
      const { error: deleteError } = await supabase
        .from("agents")
        .delete()
        .eq("id", agentId);

      if (deleteError) throw deleteError;

      toast.success(`Credenciais regeneradas para ${agentName}. Baixe novo instalador.`);
      refetch();
    } catch (error: any) {
      toast.error(`Erro ao regenerar credenciais: ${error.message}`);
    } finally {
      setRegeneratingAgent(null);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <Terminal className="h-8 w-8" />
          Agent Troubleshooting
        </h1>
        <p className="text-muted-foreground mt-2">
          Diagnóstico avançado de agentes com problemas de instalação ou conectividade
        </p>
      </div>

      {/* Sumário de Problemas */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agentes Problemáticos</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{problematicAgents?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Agentes sem heartbeat há mais de 5 minutos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Instalação Bem-Sucedida</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {problematicAgents?.filter((a) => a.installation_success).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Telemetria de instalação recebida
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Falhas de Rede</CardTitle>
            <XCircle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {problematicAgents?.filter((a) => !a.network_connectivity).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Agentes com problemas de conectividade
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Common Issues Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Problemas Comuns e Soluções
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>🔴 Agente não aparece após instalação</AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p className="font-semibold">Possíveis Causas:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Credenciais inválidas (AgentToken ou HmacSecret)</li>
                  <li>Firewall bloqueando conexão na porta 443</li>
                  <li>Proxy corporativo sem configuração adequada</li>
                  <li>Tarefa agendada não foi criada ou não está rodando</li>
                </ul>
                <p className="font-semibold mt-4">Solução:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Verificar logs: <code className="bg-muted px-2 py-1 rounded">C:\CyberShield\logs\agent.log</code></li>
                  <li>Verificar tarefa: <code className="bg-muted px-2 py-1 rounded">Get-ScheduledTask -TaskName "CyberShield Agent"</code></li>
                  <li>Testar conectividade: <code className="bg-muted px-2 py-1 rounded">Test-NetConnection -Port 443</code></li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger>🟡 Agente offline após funcionar</AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p className="font-semibold">Possíveis Causas:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Tarefa agendada foi parada manualmente</li>
                  <li>Servidor foi reiniciado e tarefa não iniciou automaticamente</li>
                  <li>Rate limiting por envios excessivos</li>
                </ul>
                <p className="font-semibold mt-4">Solução:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Reiniciar tarefa: <code className="bg-muted px-2 py-1 rounded">Start-ScheduledTask -TaskName "CyberShield Agent"</code></li>
                  <li>Verificar último erro: <code className="bg-muted px-2 py-1 rounded">Get-ScheduledTaskInfo -TaskName "CyberShield Agent"</code></li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3">
              <AccordionTrigger>🟢 Telemetria de instalação não recebida</AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p className="font-semibold">Possíveis Causas:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Instalador interrompido antes de enviar telemetria</li>
                  <li>Edge Function post-installation-telemetry offline</li>
                  <li>Timeout na requisição de telemetria</li>
                </ul>
                <p className="font-semibold mt-4">Solução:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Verificar logs de instalação: <code className="bg-muted px-2 py-1 rounded">C:\CyberShield\logs\install.log</code></li>
                  <li>Reinstalar agente com novo instalador</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Lista de Agentes Problemáticos */}
      <Card>
        <CardHeader>
          <CardTitle>Agentes Problemáticos Detectados</CardTitle>
          <CardDescription>
            {problematicAgents?.length === 0
              ? "🎉 Nenhum agente problemático encontrado!"
              : `${problematicAgents?.length} agente(s) requerem atenção`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {problematicAgents?.length === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Tudo OK!</AlertTitle>
              <AlertDescription>
                Todos os agentes estão funcionando corretamente.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {problematicAgents?.map((agent) => (
                <Card key={agent.id} className="border-l-4 border-l-warning">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{agent.agent_name}</CardTitle>
                        <CardDescription>
                          Criado há {Math.round(agent.minutes_since_creation)} minutos
                        </CardDescription>
                      </div>
                      <Badge variant="destructive">{agent.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Checklist de Validação */}
                    <div className="space-y-2">
                      <p className="font-semibold text-sm">Checklist de Validação:</p>
                      <div className="grid gap-2">
                        <div className="flex items-center gap-2">
                          {agent.installation_success ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          <span className="text-sm">Telemetria de instalação recebida</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {agent.metadata?.task_created ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          <span className="text-sm">Tarefa agendada criada</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {agent.metadata?.script_exists ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          <span className="text-sm">Script do agente existe</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {agent.network_connectivity ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          <span className="text-sm">Conectividade de rede OK</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-destructive" />
                          <span className="text-sm font-semibold">Primeiro heartbeat (FALTANDO ⚠️)</span>
                        </div>
                      </div>
                    </div>

                    {/* Metadata */}
                    {agent.metadata && (
                      <div className="bg-muted p-3 rounded-md text-xs">
                        <p className="font-semibold mb-2">Dados de Telemetria:</p>
                        <pre className="overflow-x-auto">{JSON.stringify(agent.metadata, null, 2)}</pre>
                      </div>
                    )}

                    {/* Ações */}
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRegenerateCredentials(agent.id, agent.agent_name)}
                        disabled={regeneratingAgent === agent.id}
                      >
                        {regeneratingAgent === agent.id ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Regenerando...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Regenerar Credenciais
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
