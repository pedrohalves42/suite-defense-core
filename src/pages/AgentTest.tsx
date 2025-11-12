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
  AlertCircle
} from "lucide-react";

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

  // Fetch agents
  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .order("agent_name");
      
      if (error) throw error;
      return data;
    },
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
        throw new Error("Tenant não encontrado");
      }

      setTestResults([]);
      
      // Step 1: Create test job
      addTestResult({
        step: "1. Criar Job de Teste",
        status: "running",
        message: "Criando job de teste tipo 'report'..."
      });

      const { data: job, error: jobError } = await supabase
        .from("jobs")
        .insert([{
          agent_name: agentName,
          type: "report",
          status: "queued",
          tenant_id: tenant.id,
          payload: { test: true, timestamp: new Date().toISOString() }
        }])
        .select()
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (jobError) throw new Error(`Erro ao criar job: ${jobError.message}`);

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
        message: "Aguardando agent fazer polling (máx 120s)..."
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
            message: `Agent fez polling após ${attempts * 5}s`,
            data: updatedJob
          });
        }
      }

      if (!polled) {
        throw new Error("Agent não fez polling após 120s. Verifique se o agent está rodando.");
      }

      // Step 3: Wait for report upload
      addTestResult({
        step: "3. Aguardar Report Upload",
        status: "running",
        message: "Aguardando agent enviar report (máx 60s)..."
      });

      let reportUploaded = false;
      attempts = 0;
      const maxReportAttempts = 12; // 12 * 5s = 60s

      while (!reportUploaded && attempts < maxReportAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;

        const { data: reports } = await supabase
          .from("reports")
          .select("*")
          .eq("agent_name", agentName)
          .order("created_at", { ascending: false })
          .limit(1);

        if (reports && reports.length > 0) {
          const latestReport = reports[0];
          const reportTime = new Date(latestReport.created_at).getTime();
          const jobTime = new Date(job.created_at).getTime();
          
          if (reportTime > jobTime) {
            reportUploaded = true;
            addTestResult({
              step: "3. Aguardar Report Upload",
              status: "success",
              message: `Report enviado após ${attempts * 5}s`,
              data: latestReport
            });
          }
        }
      }

      if (!reportUploaded) {
        throw new Error("Agent não enviou report após 60s. Verifique os logs do agent.");
      }

      // Step 4: Wait for ACK
      addTestResult({
        step: "4. Aguardar ACK do Job",
        status: "running",
        message: "Aguardando agent confirmar job (máx 30s)..."
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
            message: `Job confirmado após ${attempts * 5}s`,
            data: updatedJob
          });
        }
      }

      if (!acked) {
        throw new Error("Agent não confirmou job após 30s. Verifique os logs do agent.");
      }

      // Success!
      addTestResult({
        step: "5. Teste Completo",
        status: "success",
        message: "✅ Fluxo completo funcionando corretamente!"
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
        description: "Fluxo de integração validado com sucesso!",
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
          <h1 className="text-3xl font-bold">Teste de Integração de Agentes</h1>
          <p className="text-muted-foreground mt-2">
            Valide o fluxo completo: criar job → polling → execução → report → ACK
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Agent Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Selecionar Agent para Teste
            </CardTitle>
            <CardDescription>
              Escolha um agent ativo para executar o teste de integração
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {agents?.map((agent) => (
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
              {runIntegrationTest.isPending ? "Executando Teste..." : "Iniciar Teste de Integração"}
            </Button>
          </CardContent>
        </Card>

        {/* Test Results */}
        <Card>
          <CardHeader>
            <CardTitle>Resultados do Teste</CardTitle>
            <CardDescription>
              Timeline de execução do fluxo de integração
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[380px]">
              {testResults.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Selecione um agent e inicie o teste</p>
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
                          {new Date(result.timestamp).toLocaleTimeString()}
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
              <strong>Criar Job de Teste:</strong> Sistema cria um job tipo "report" para o agent selecionado
            </li>
            <li>
              <strong>Polling do Agent:</strong> Aguarda até 120s para o agent fazer polling e receber o job
            </li>
            <li>
              <strong>Upload de Report:</strong> Aguarda até 60s para o agent executar o job e enviar o report
            </li>
            <li>
              <strong>ACK do Job:</strong> Aguarda até 30s para o agent confirmar a conclusão do job
            </li>
            <li>
              <strong>Validação:</strong> Se todas as etapas completarem com sucesso, o fluxo está funcionando corretamente
            </li>
          </ol>

          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">Troubleshooting:</p>
            <ul className="text-sm space-y-1">
              <li>• Se o polling falhar: Verifique se o agent está rodando e conectado</li>
              <li>• Se o report falhar: Verifique os logs do agent para erros de execução</li>
              <li>• Se o ACK falhar: Verifique a conectividade do agent com o servidor</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
