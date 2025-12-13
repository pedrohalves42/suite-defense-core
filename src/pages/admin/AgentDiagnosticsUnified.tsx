import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { 
  AlertCircle, CheckCircle2, XCircle, RefreshCw, Terminal, Shield, Download,
  Trash2, Clock, Wifi, WifiOff, Key, AlertTriangle, Computer
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { formatRelativeTime } from "@/lib/date-utils";

interface ProblematicAgent {
  id: string;
  agent_name: string;
  status: string | null;
  enrolled_at: string | null;
  last_heartbeat: string | null;
  hostname: string | null;
  os_type: string | null;
  issue_type: string | null;
  has_active_token: boolean | null;
  failed_jobs_24h: number | null;
}

export default function AgentDiagnosticsUnified() {
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [regeneratingAgent, setRegeneratingAgent] = useState<string | null>(null);
  const [agentToCleanup, setAgentToCleanup] = useState<ProblematicAgent | null>(null);
  const [showBulkCleanupDialog, setShowBulkCleanupDialog] = useState(false);

  // Query problematic agents
  const { data: problematicAgents, isLoading, refetch } = useQuery({
    queryKey: ["problematic-agents-unified", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_problematic_agents')
        .select('*')
        .order('enrolled_at', { ascending: false });

      if (error) throw error;
      return (data || []) as ProblematicAgent[];
    },
    refetchInterval: 30000,
    enabled: !!tenant?.id,
  });

  // Cleanup single agent
  const cleanupMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const { data, error } = await supabase.rpc('cleanup_problematic_agent', {
        p_agent_id: agentId
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Computador "${data.agent_name}" limpo com sucesso`);
      queryClient.invalidateQueries({ queryKey: ['problematic-agents-unified'] });
      setAgentToCleanup(null);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao limpar: ${error.message}`);
    },
  });

  // Bulk cleanup
  const bulkCleanupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('cleanup_all_problematic_agents', {
        p_tenant_id: tenant?.id
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`${data.total_cleaned} computadores limpos com sucesso`);
      queryClient.invalidateQueries({ queryKey: ['problematic-agents-unified'] });
      setShowBulkCleanupDialog(false);
    },
    onError: (error: Error) => {
      toast.error(`Erro na limpeza em massa: ${error.message}`);
    },
  });

  const handleDownloadReinstallScript = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-reinstall-script`
      );

      if (!response.ok) {
        throw new Error('Falha ao baixar script de reinstalação');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reinstall-cybershield-agent.ps1';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Script de reinstalação baixado com sucesso');
    } catch (error) {
      toast.error(`Erro ao baixar script: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  };

  const getIssueInfo = (issueType: string | null) => {
    switch (issueType) {
      case 'no_heartbeat':
        return { label: 'Sem Comunicação', variant: 'destructive' as const, icon: WifiOff };
      case 'stale_heartbeat':
        return { label: 'Comunicação Desatualizada', variant: 'warning' as const, icon: Clock };
      case 'no_token':
        return { label: 'Credenciais Inválidas', variant: 'destructive' as const, icon: Key };
      case 'failed_jobs':
        return { label: 'Tarefas Falhando', variant: 'warning' as const, icon: AlertTriangle };
      default:
        return { label: 'Problema Desconhecido', variant: 'secondary' as const, icon: AlertCircle };
    }
  };

  const getIssueDescription = (agent: ProblematicAgent) => {
    switch (agent.issue_type) {
      case 'no_heartbeat':
        return 'O computador nunca enviou sinal de vida após a instalação';
      case 'stale_heartbeat':
        return `Último sinal de vida: ${agent.last_heartbeat ? formatRelativeTime(agent.last_heartbeat) : 'desconhecido'}`;
      case 'no_token':
        return 'O computador não possui credenciais válidas de autenticação';
      case 'failed_jobs':
        return `${agent.failed_jobs_24h || 0} tarefas falharam nas últimas 24 horas`;
      default:
        return 'Diagnóstico em andamento...';
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
          <Computer className="h-8 w-8" />
          Diagnóstico de Computadores
        </h1>
        <p className="text-muted-foreground mt-2">
          Identifique e resolva problemas de instalação e conectividade dos seus computadores protegidos
        </p>
      </div>

      <Tabs defaultValue="problematic" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="problematic" className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Computadores com Problema
            {problematicAgents && problematicAgents.length > 0 && (
              <Badge variant="destructive" className="ml-1">{problematicAgents.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="guides" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Guia de Soluções
          </TabsTrigger>
          <TabsTrigger value="tools" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Ferramentas
          </TabsTrigger>
        </TabsList>

        {/* Tab: Problematic Agents */}
        <TabsContent value="problematic" className="space-y-4 mt-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Com Problema</CardTitle>
                <AlertCircle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{problematicAgents?.length || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Requerem atenção imediata
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sem Comunicação</CardTitle>
                <WifiOff className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {problematicAgents?.filter(a => a.issue_type === 'no_heartbeat' || a.issue_type === 'stale_heartbeat').length || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Problemas de conectividade
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Credenciais Inválidas</CardTitle>
                <Key className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {problematicAgents?.filter(a => a.issue_type === 'no_token').length || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Precisam de reinstalação
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Bulk Cleanup Button */}
          {problematicAgents && problematicAgents.length > 0 && (
            <div className="flex justify-end">
              <Button
                variant="destructive"
                onClick={() => setShowBulkCleanupDialog(true)}
                disabled={bulkCleanupMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Limpar Todos ({problematicAgents.length})
              </Button>
            </div>
          )}

          {/* Agent List */}
          {!problematicAgents || problematicAgents.length === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Tudo Funcionando!</AlertTitle>
              <AlertDescription>
                Todos os seus computadores estão operando normalmente. Nenhum problema detectado.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {problematicAgents.map((agent) => {
                const issueInfo = getIssueInfo(agent.issue_type);
                const IssueIcon = issueInfo.icon;

                return (
                  <Card key={agent.id} className="border-l-4 border-l-destructive">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-destructive/10">
                            <IssueIcon className="h-5 w-5 text-destructive" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{agent.agent_name}</CardTitle>
                            <CardDescription>
                              {agent.hostname || 'Hostname desconhecido'} • {agent.os_type || 'SO desconhecido'}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant={issueInfo.variant}>{issueInfo.label}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {getIssueDescription(agent)}
                      </p>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Status:</span>
                          <div className="font-medium">{agent.status || 'Desconhecido'}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Cadastrado em:</span>
                          <div className="font-medium">
                            {agent.enrolled_at ? formatRelativeTime(agent.enrolled_at) : 'N/A'}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Credenciais:</span>
                          <div className="font-medium flex items-center gap-1">
                            {agent.has_active_token ? (
                              <><CheckCircle2 className="h-3 w-3 text-success" /> Válidas</>
                            ) : (
                              <><XCircle className="h-3 w-3 text-destructive" /> Inválidas</>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tarefas Falhando:</span>
                          <div className="font-medium">{agent.failed_jobs_24h || 0}</div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setAgentToCleanup(agent)}
                          disabled={cleanupMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Limpar e Resetar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/installer?agent_name=${encodeURIComponent(agent.agent_name)}&regenerated=true`)}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Gerar Novo Instalador
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab: Troubleshooting Guides */}
        <TabsContent value="guides" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Problemas Comuns e Soluções
              </CardTitle>
              <CardDescription>
                Guia rápido para resolver os problemas mais frequentes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <WifiOff className="h-4 w-4 text-destructive" />
                      Computador não aparece após instalação
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <p className="font-semibold">Possíveis Causas:</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Credenciais inválidas (Token ou HMAC expirado)</li>
                      <li>Firewall bloqueando conexão na porta 443</li>
                      <li>Proxy corporativo sem configuração adequada</li>
                      <li>Tarefa agendada não foi criada ou parou</li>
                    </ul>
                    <p className="font-semibold mt-4">Solução:</p>
                    <ol className="list-decimal pl-6 space-y-1">
                      <li>Verifique os logs: <code className="bg-muted px-2 py-1 rounded">C:\CyberShield\logs\agent.log</code></li>
                      <li>Teste a tarefa: <code className="bg-muted px-2 py-1 rounded">Get-ScheduledTask -TaskName "CyberShield Agent"</code></li>
                      <li>Teste conectividade: <code className="bg-muted px-2 py-1 rounded">Test-NetConnection -Port 443</code></li>
                      <li>Se necessário, reinstale com novo instalador</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-2">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-warning" />
                      Computador ficou offline após funcionar
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <p className="font-semibold">Possíveis Causas:</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Tarefa agendada foi parada manualmente</li>
                      <li>Servidor reiniciou e tarefa não iniciou</li>
                      <li>Rate limiting por envios excessivos</li>
                      <li>Atualização de agente falhou</li>
                    </ul>
                    <p className="font-semibold mt-4">Solução:</p>
                    <ol className="list-decimal pl-6 space-y-1">
                      <li>Reinicie a tarefa: <code className="bg-muted px-2 py-1 rounded">Start-ScheduledTask -TaskName "CyberShield Agent"</code></li>
                      <li>Verifique status: <code className="bg-muted px-2 py-1 rounded">Get-ScheduledTaskInfo -TaskName "CyberShield Agent"</code></li>
                      <li>Se falhar, reinicie o computador (carrega nova versão do agente)</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-3">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-destructive" />
                      Erro de autenticação (401/403)
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <p className="font-semibold">Possíveis Causas:</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Token de agente expirado ou inválido</li>
                      <li>HMAC Secret foi alterado no servidor</li>
                      <li>Instalação corrompida</li>
                    </ul>
                    <p className="font-semibold mt-4">Solução:</p>
                    <ol className="list-decimal pl-6 space-y-1">
                      <li>Limpe o agente problemático (botão "Limpar e Resetar")</li>
                      <li>Gere um novo instalador com as mesmas credenciais</li>
                      <li>Execute a reinstalação no computador afetado</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-4">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      Tarefas falhando constantemente
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <p className="font-semibold">Possíveis Causas:</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Permissões insuficientes no computador</li>
                      <li>Antivírus bloqueando ações do agente</li>
                      <li>Caminho de arquivo inválido na tarefa</li>
                    </ul>
                    <p className="font-semibold mt-4">Solução:</p>
                    <ol className="list-decimal pl-6 space-y-1">
                      <li>Verifique se o agente está rodando como SYSTEM</li>
                      <li>Adicione exceção no antivírus para C:\CyberShield</li>
                      <li>Revise os logs de tarefas no painel de Jobs</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Tools */}
        <TabsContent value="tools" className="space-y-4 mt-6">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Reinstall Script */}
            <Card className="border-destructive/20 bg-destructive/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Script de Reinstalação
                </CardTitle>
                <CardDescription>
                  Limpa instalação antiga e reinstala automaticamente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground space-y-2">
                  <p className="font-semibold">O que o script faz:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Para e remove a tarefa agendada antiga</li>
                    <li>Limpa o diretório C:\CyberShield</li>
                    <li>Baixa e instala a versão mais recente</li>
                    <li>Configura automaticamente o serviço</li>
                  </ul>
                </div>

                <Button
                  onClick={handleDownloadReinstallScript}
                  className="w-full gap-2"
                  variant="destructive"
                >
                  <Download className="h-4 w-4" />
                  Baixar Script
                </Button>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium">Como usar:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Baixe o script acima</li>
                    <li>Gere uma nova chave de instalação</li>
                    <li>Execute no PowerShell como Administrador</li>
                  </ol>
                </div>
              </CardContent>
            </Card>

            {/* Validation Script */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Script de Validação Local
                </CardTitle>
                <CardDescription>
                  Valide instaladores antes da instalação
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground space-y-2">
                  <p className="font-semibold">Verifica:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Encoding correto (UTF-8/ASCII)</li>
                    <li>Ausência de caracteres inválidos</li>
                    <li>Sintaxe PowerShell válida</li>
                    <li>Funções críticas presentes</li>
                  </ul>
                </div>

                <Button
                  onClick={() => {
                    toast.info(
                      "Script de validação disponível no repositório. Consulte a documentação.",
                      { duration: 5000 }
                    );
                  }}
                  className="w-full gap-2"
                >
                  <Shield className="h-4 w-4" />
                  Ver Script de Validação
                </Button>

                <p className="text-xs text-muted-foreground">
                  Execute: <code className="bg-muted px-1 py-0.5 rounded text-[10px]">.\verificar-installer.ps1 -ScriptPath "caminho.ps1"</code>
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Single Cleanup Dialog */}
      <AlertDialog open={!!agentToCleanup} onOpenChange={() => setAgentToCleanup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar Computador Problemático?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá invalidar as credenciais do computador "{agentToCleanup?.agent_name}" 
              e remover tarefas pendentes. Você precisará reinstalar o agente para que ele volte a funcionar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => agentToCleanup && cleanupMutation.mutate(agentToCleanup.id)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Confirmar Limpeza
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Cleanup Dialog */}
      <AlertDialog open={showBulkCleanupDialog} onOpenChange={setShowBulkCleanupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar Todos os Computadores Problemáticos?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá limpar {problematicAgents?.length || 0} computadores problemáticos.
              Todos precisarão de reinstalação para voltar a funcionar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkCleanupMutation.mutate()}
              className="bg-destructive hover:bg-destructive/90"
            >
              Confirmar Limpeza em Massa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}