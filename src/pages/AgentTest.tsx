import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  PlayCircle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Server, 
  Activity,
  AlertCircle,
  Trash2
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { formatBrazilTime } from '@/lib/date-utils';

interface TestResult {
  step: string;
  status: "pending" | "running" | "success" | "error";
  message: string;
  timestamp: string;
  data?: any;
}

export default function AgentTest() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // Mutation para limpar dados de teste
  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const response = await supabase.functions.invoke('system-maintenance', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Dados de teste limpos com sucesso',
        description: `${data.results.agents} agentes, ${data.results.agent_tokens} tokens, ${data.results.installation_analytics} eventos removidos`,
      });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setSelectedAgent(null);
      setTestResults([]);
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao limpar dados',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Fetch agents - filtered by tenant
  const { data: agents } = useQuery({
    queryKey: ["agents", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false
      });
      
      if (error) throw error;
      return ((data || []) as unknown[]).sort((a: any, b: any) => a.agent_name.localeCompare(b.agent_name));
    },
    enabled: !!tenant?.id
  });

  const addTestResult = (result: Omit<TestResult, "timestamp">) => {
    setTestResults(prev => [...prev, {
      ...result,
      timestamp: new Date().toISOString()
    }]);
  };

  const runIntegrationTest = useMutation({
    mutationFn: async (agentName: string) => {
      if (!tenant) {
        throw new Error("Tenant nao encontrado");
      }

      setTestResults([]);
      
      // Step 1: Create test job
      addTestResult({
        step: "1. Criar Job de Teste",
        status: "running",
        message: "Criando job de teste tipo 'report'..."
      });

      const { data: jobResponse, error: jobError } = await supabase.functions.invoke('create-job', {
        body: {
          agentName,
          type: "report",
          payload: { test: true, timestamp: new Date().toISOString() },
          approved: true
        }
      });

      if (jobError) {
        const errorData = typeof jobError === 'object' && 'error' in jobError ? jobError.error : jobError;
        const errorCode = errorData?.code;
        const errorMessage = errorData?.message || jobError.message || "Erro ao criar job";

        if (errorCode === 'FORBIDDEN') {
          throw new Error("Acesso negado. E necessario ter papel admin, operator ou super_admin.");
        } else if (errorCode === 'AGENT_NOT_FOUND') {
          throw new Error("Agente nao encontrado ou nao pertence ao tenant selecionado.");
        } else {
          throw new Error(`Erro ao criar job: ${errorMessage}`);
        }
      }

      const job = { id: jobResponse.id, created_at: new Date().toISOString(), ...jobResponse };

      addTestResult({
        step: "1. Criar Job de Teste",
        status: "success",
        message: `Job criado com sucesso: ${job.id}`,
        data: job
      });

      // Step 2: Wait for agent to poll
      addTestResult({
        step: "2. Aguardar Polling do Agent",
        status: "running",
        message: "Aguardando agent fazer polling (max 120s)..."
      });

      let polled = false;
      let attempts = 0;
      const maxAttempts = 24; // 24 * 5s = 120s

      while (!polled && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;

        const { data: updatedJob } = await supabase
          .from("jobs")
          .select("status, delivered_at")
          .eq("id", job.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (updatedJob?.status === "delivered" || updatedJob?.delivered_at) {
          polled = true;
          addTestResult({
            step: "2. Aguardar Polling do Agent",
            status: "success",
            message: `Agent fez polling apos ${attempts * 5}s`,
            data: updatedJob
          });
        }
      }

      if (!polled) {
        throw new Error("Agent nao fez polling apos 120s. Verifique se o agent esta rodando.");
      }

      // Step 3: Wait for job completion with output
      addTestResult({
        step: "3. Aguardar Conclusao do Job",
        status: "running",
        message: "Aguardando agent executar e retornar output (max 60s)..."
      });

      let jobCompleted = false;
      attempts = 0;
      const maxCompletionAttempts = 12; // 12 * 5s = 60s

      while (!jobCompleted && attempts < maxCompletionAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;

        const { data: updatedJob } = await supabase
          .from("jobs")
          .select("status, output, completed_at")
          .eq("id", job.id)
          .maybeSingle();

        if (updatedJob?.status === "completed" && updatedJob?.output) {
          jobCompleted = true;
          addTestResult({
            step: "3. Aguardar Conclusao do Job",
            status: "success",
            message: `Job completado com output apos ${attempts * 5}s`,
            data: { status: updatedJob.status, output: updatedJob.output }
          });
        }
      }

      if (!jobCompleted) {
        throw new Error("Agent nao completou job com output apos 60s. Verifique os logs do agent.");
      }

      // Step 4: Wait for ACK
      addTestResult({
        step: "4. Aguardar ACK do Job",
        status: "running",
        message: "Aguardando agent confirmar job (max 30s)..."
      });

      let acked = false;
      attempts = 0;
      const maxAckAttempts = 6; // 6 * 5s = 30s

      while (!acked && attempts < maxAckAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;

        const { data: updatedJob } = await supabase
          .from("jobs")
          .select("status, completed_at")
          .eq("id", job.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (updatedJob?.status === "completed" && updatedJob?.completed_at) {
          acked = true;
          addTestResult({
            step: "4. Aguardar ACK do Job",
            status: "success",
            message: `Job confirmado apos ${attempts * 5}s`,
            data: updatedJob
          });
        }
      }

      if (!acked) {
        throw new Error("Agent nao confirmou job apos 30s. Verifique os logs do agent.");
      }

      // Success!
      addTestResult({
        step: "5. Teste Completo",
        status: "success",
        message: "[OK]  Fluxo completo funcionando corretamente!"
      });

      return { success: true };
    },
    onError: (error: Error) => {
      addTestResult({
        step: "Erro",
        status: "error",
        message: error.message
      });
      
      toast({
        title: "Erro no Teste",
        description: error.message,
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Teste Completo",
        description: "Fluxo de integracao validado com sucesso!",
      });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  const getStatusIcon = (status: TestResult["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case "error":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "running":
        return <Clock className="h-5 w-5 text-primary animate-pulse" />;
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: TestResult["status"]) => {
    const variants = {
      success: "default",
      error: "destructive",
      running: "secondary",
      pending: "outline"
    } as const;
    
    return (
      <Badge variant={variants[status]}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Teste de Integração de Computadores</h1>
          <p className="text-muted-foreground mt-2">
            Valide o fluxo completo: criar verificação, polling, execução, relatório e confirmação
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="w-4 h-4 mr-2" />
              Limpar Dados de Teste
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Limpeza de Dados</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>Esta acao ira remover permanentemente:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Todos os computadores</li>
                    <li>Todas as credenciais de acesso</li>
                    <li>Todos os eventos de telemetria</li>
                    <li>Todas as métricas de sistema</li>
                    <li>Chaves de cadastro usadas</li>
                  </ul>
                  <p className="font-semibold mt-4">Os usuarios serao mantidos.</p>
                  <p className="text-destructive">Esta acao nao pode ser desfeita.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => cleanupMutation.mutate()}
                disabled={cleanupMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {cleanupMutation.isPending && <Clock className="w-4 h-4 mr-2 animate-spin" />}
                Confirmar Limpeza
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Agent Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Selecionar Computador para Teste
            </CardTitle>
            <CardDescription>
              Escolha um computador ativo para executar o teste de integração
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {agents?.map((agent: any) => (
                  <Button
                    key={agent.id}
                    variant={selectedAgent === agent.agent_name ? "default" : "outline"}
                    className="w-full justify-start"
                    onClick={() => setSelectedAgent(agent.agent_name)}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <Activity className="h-4 w-4" />
                      <div className="flex-1 text-left">
                        <div className="font-medium">{agent.agent_name}</div>
                        <div className="text-xs text-muted-foreground">
                          Status: {agent.status}
                        </div>
                      </div>
                      <Badge variant={agent.status === "active" ? "default" : "secondary"}>
                        {agent.status}
                      </Badge>
                    </div>
                  </Button>
                ))}
              </div>
            </ScrollArea>

            <Separator className="my-4" />

            <Button
              onClick={() => selectedAgent && runIntegrationTest.mutate(selectedAgent)}
              disabled={!selectedAgent || runIntegrationTest.isPending}
              className="w-full"
              size="lg"
            >
              <PlayCircle className="h-5 w-5 mr-2" />
              {runIntegrationTest.isPending ? "Executando Teste..." : "Iniciar Teste de Integracao"}
            </Button>
          </CardContent>
        </Card>

        {/* Test Results */}
        <Card>
          <CardHeader>
            <CardTitle>Resultados do Teste</CardTitle>
            <CardDescription>
              Linha do tempo da execução do fluxo de integração
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[380px]">
              {testResults.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Selecione um computador e inicie o teste</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {testResults.map((result, index) => (
                    <div key={index} className="flex gap-3 items-start">
                      <div className="mt-0.5">
                        {getStatusIcon(result.status)}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{result.step}</span>
                          {getStatusBadge(result.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">{result.message}</p>
                        {result.data && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                              Ver dados
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                              {JSON.stringify(result.data, null, 2)}
                            </pre>
                          </details>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {formatBrazilTime(result.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Documentation */}
      <Card>
        <CardHeader>
          <CardTitle>Como Funciona o Teste</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none dark:prose-invert">
          <ol className="space-y-2">
            <li>
              <strong>Criar Verificação de Teste:</strong> Sistema cria uma verificação tipo "report" para o computador selecionado
            </li>
            <li>
              <strong>Polling do Computador:</strong> Aguarda até 120s para o computador buscar e receber a verificação
            </li>
            <li>
              <strong>Upload de Relatório:</strong> Aguarda até 60s para o computador executar a verificação e enviar o relatório
            </li>
            <li>
              <strong>Confirmação:</strong> Aguarda até 30s para o computador confirmar a conclusão da verificação
            </li>
            <li>
              <strong>Validação:</strong> Se todas as etapas completarem com sucesso, o fluxo está funcionando corretamente
            </li>
          </ol>

          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">Troubleshooting:</p>
            <ul className="text-sm space-y-1">
              <li>? Se o polling falhar: Verifique se o agent esta rodando e conectado</li>
              <li>? Se o report falhar: Verifique os logs do agent para erros de execucao</li>
              <li>? Se o ACK falhar: Verifique a conectividade do agent com o servidor</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
