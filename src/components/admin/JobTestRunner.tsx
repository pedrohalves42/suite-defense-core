import { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/hooks/useTenant";
import { formatBrazilDateTime } from '@/lib/date-utils';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RpcAgentRow } from '@/types/rpc';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { prepareJobForInsert } from "@/lib/job-utils";
import { logger } from '@/lib/logger';
import { 
  FlaskConical, 
  Play, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Loader2,
  AlertTriangle,
  RefreshCw,
  Zap
} from "lucide-react";

interface Agent {
  id: string;
  agent_name: string;
  hostname: string | null;
  last_heartbeat: string | null;
  status: string;
}

interface TestJob {
  id: string;
  status: string;
  created_at: string;
  delivered_at: string | null;
  completed_at: string | null;
  output: unknown;
  error_message: string | null;
}

type TestState = 'idle' | 'creating' | 'polling' | 'completed' | 'failed' | 'timeout';

const STATUS_STEPS = ['queued', 'delivered', 'completed'];

export default function JobTestRunner() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [testState, setTestState] = useState<TestState>('idle');
  const [testJobId, setTestJobId] = useState<string | null>(null);
  const [testJob, setTestJob] = useState<TestJob | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [executionTime, setExecutionTime] = useState<number | null>(null);

  // Fetch active agents with recent heartbeat
  const { data: agents, isLoading: loadingAgents } = useQuery({
    queryKey: ["job-test-agents", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      // ADR-026 Zero-Gap: Use RPC with explicit tenant_id
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      
      if (error) throw error;
      return ((data || []) as unknown as RpcAgentRow[])
        .filter((a) => a.status === 'active' && a.last_heartbeat && a.last_heartbeat >= fiveMinutesAgo)
        .map((a): Agent => ({ id: a.id, agent_name: a.agent_name, hostname: a.hostname, last_heartbeat: a.last_heartbeat, status: a.status }))
        .sort((a: Agent, b: Agent) => a.agent_name.localeCompare(b.agent_name));
    },
    enabled: !!tenant?.id,
    refetchInterval: 300000, // COST-OPT: 30s → 5min
  });

  // Create test job mutation
  const createTestJob = useMutation({
    mutationFn: async (agentId: string) => {
      const agent = agents?.find(a => a.id === agentId);
      if (!agent) throw new Error("Agente não encontrado");

      // Get tenant_id from active tenant context
      if (!tenant) throw new Error("Tenant não selecionado");

      const jobData = await prepareJobForInsert({
        agent_name: agent.agent_name,
        tenant_id: tenant.id,
        type: "integration_test_v3",
        status: "queued",
        approved: true,
        payload: { 
          test_id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          purpose: "validation_test"
        }
      });

      const { data, error } = await supabase
        .from("jobs")
        .insert(jobData)
        .select("id")
        .single();
      
      if (error) throw error;
      return data.id;
    },
    onSuccess: (jobId) => {
      setTestJobId(jobId);
      setTestState('polling');
      setPollCount(0);
      toast.info("Job de teste criado! Monitorando status...");
    },
    onError: (error) => {
      toast.error(`Falha ao criar job: ${error.message}`);
      setTestState('idle');
    }
  });

  // Poll job status
  const pollJobStatus = useCallback(async () => {
    if (!testJobId || testState !== 'polling') return;

    const { data, error } = await supabase
      .from("jobs")
      .select("id, status, created_at, delivered_at, completed_at, output, error_message")
      .eq("id", testJobId)
      .single();

    if (error) {
      logger.error("Poll error:", error);
      return;
    }

    setTestJob(data as TestJob);
    setPollCount(prev => prev + 1);

    // Calculate execution time
    if (data.completed_at && data.created_at) {
      const start = new Date(data.created_at).getTime();
      const end = new Date(data.completed_at).getTime();
      setExecutionTime((end - start) / 1000);
    }

    // Check final states
    if (data.status === 'completed') {
      setTestState('completed');
      toast.success("Job de teste concluído com sucesso!");
    } else if (data.status === 'failed') {
      setTestState('failed');
      toast.error(`Job falhou: ${data.error_message || 'Erro desconhecido'}`);
    }
  }, [testJobId, testState]);

  // Polling effect
  useEffect(() => {
    if (testState !== 'polling') return;

    // Timeout after 24 polls (2 minutes at 5s intervals)
    if (pollCount >= 24) {
      setTestState('timeout');
      toast.error("Timeout: Job não completou em 2 minutos");
      return;
    }

    const interval = setInterval(pollJobStatus, 5000);
    // Initial poll immediately
    pollJobStatus();

    return () => clearInterval(interval);
  }, [testState, pollCount, pollJobStatus]);

  const handleStartTest = () => {
    if (!selectedAgentId) {
      toast.warning("Selecione um agente primeiro");
      return;
    }
    setTestState('creating');
    setTestJob(null);
    setExecutionTime(null);
    createTestJob.mutate(selectedAgentId);
  };

  const handleReset = () => {
    setTestState('idle');
    setTestJobId(null);
    setTestJob(null);
    setPollCount(0);
    setExecutionTime(null);
    queryClient.invalidateQueries({ queryKey: ["system-health-jobs"] });
  };

  const getStepStatus = (step: string) => {
    if (!testJob) return 'pending';
    
    const statusIndex = STATUS_STEPS.indexOf(testJob.status);
    const stepIndex = STATUS_STEPS.indexOf(step);
    
    if (testJob.status === 'failed') {
      return stepIndex <= statusIndex ? 'error' : 'pending';
    }
    
    if (stepIndex < statusIndex) return 'complete';
    if (stepIndex === statusIndex) return 'current';
    return 'pending';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'current':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getResultBadge = () => {
    switch (testState) {
      case 'completed':
        return <Badge className="bg-green-500">Sucesso</Badge>;
      case 'failed':
        return <Badge variant="destructive">Falhou</Badge>;
      case 'timeout':
        return <Badge variant="secondary">Timeout</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Validar Fluxo de Jobs</CardTitle>
          </div>
          {getResultBadge()}
        </div>
        <CardDescription>
          Cria um job de teste e monitora o fluxo completo: queued → delivered → completed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Agent Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Agente (online)</label>
          <Select 
            value={selectedAgentId} 
            onValueChange={setSelectedAgentId}
            disabled={testState !== 'idle'}
          >
            <SelectTrigger>
              <SelectValue placeholder={
                loadingAgents ? "Carregando..." : 
                agents?.length === 0 ? "Nenhum agente online" : 
                "Selecione um agente"
              } />
            </SelectTrigger>
            <SelectContent>
              {agents?.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  <div className="flex items-center gap-2">
                    <Zap className="h-3 w-3 text-green-500" />
                    <span>{agent.agent_name}</span>
                    {agent.hostname && (
                      <span className="text-muted-foreground text-xs">({agent.hostname})</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Action Button */}
        <div className="flex gap-2">
          {testState === 'idle' ? (
            <Button 
              onClick={handleStartTest}
              disabled={!selectedAgentId || loadingAgents}
              className="flex-1"
            >
              <Play className="h-4 w-4 mr-2" />
              Criar Job de Teste
            </Button>
          ) : (
            <Button 
              onClick={handleReset}
              variant="outline"
              className="flex-1"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Novo Teste
            </Button>
          )}
        </div>

        {/* Status Pipeline */}
        {testJob && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 py-2">
              {STATUS_STEPS.map((step, index) => (
                <div key={step} className="flex items-center gap-1 flex-1">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(getStepStatus(step))}
                    <span className="text-sm capitalize">{step}</span>
                  </div>
                  {index < STATUS_STEPS.length - 1 && (
                    <div className="flex-1 h-px bg-border mx-2" />
                  )}
                </div>
              ))}
            </div>

            {/* Results */}
            <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant={testJob.status === 'completed' ? 'default' : 'secondary'}>
                  {testJob.status}
                </Badge>
              </div>
              
              {executionTime !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tempo de execução:</span>
                  <span className="font-mono">{executionTime.toFixed(2)}s</span>
                </div>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Output v3:</span>
                <span className={testJob.output ? "text-green-600" : "text-muted-foreground"}>
                  {testJob.output ? "✅ Preenchido" : "⏳ Aguardando"}
                </span>
              </div>

              {testJob.created_at && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Criado:</span>
                  <span className="font-mono text-xs">
                    {formatBrazilDateTime(testJob.created_at, 'full')}
                  </span>
                </div>
              )}

              {testJob.delivered_at && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Entregue:</span>
                  <span className="font-mono text-xs">
                    {formatBrazilDateTime(testJob.delivered_at, 'full')}
                  </span>
                </div>
              )}

              {testJob.completed_at && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Concluído:</span>
                  <span className="font-mono text-xs">
                    {formatBrazilDateTime(testJob.completed_at, 'full')}
                  </span>
                </div>
              )}
            </div>

            {/* Error Message */}
            {testJob.error_message && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{testJob.error_message}</AlertDescription>
              </Alert>
            )}

            {/* Polling indicator */}
            {testState === 'polling' && (
              <div className="text-center text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                Verificando status... ({pollCount}/24)
              </div>
            )}

            {/* Timeout warning */}
            {testState === 'timeout' && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  O job não completou em 2 minutos. Verifique se o agente está processando jobs corretamente.
                </AlertDescription>
              </Alert>
            )}

            {/* Success message */}
            {testState === 'completed' && (
              <Alert className="border-green-500 bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700">
                  Fluxo de jobs v3 funcionando corretamente!
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* No agents warning */}
        {!loadingAgents && agents?.length === 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Nenhum agente online nos últimos 5 minutos. O teste requer um agente ativo.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
