/**
 * DiagnosticTestRunner - Bateria de testes de diagnóstico
 * 
 * Executa uma sequência de testes em um computador para verificar
 * as ferramentas de diagnóstico.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { 
  Play, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Wifi, 
  FileText, 
  Activity, 
  Settings,
  Clock,
  Stethoscope
} from 'lucide-react';
import { toast } from 'sonner';
import { SimpleStatusIndicator, StatusType } from '@/components/ui/simple-status-indicator';
import { prepareJobForInsert } from '@/lib/job-utils';
import { useSimplifiedMessage } from '@/hooks/useSimplifiedMessage';

interface DiagnosticTestRunnerProps {
  agentId: string | null;
  agentName?: string;
  onComplete?: (results: TestResult[]) => void;
  className?: string;
}

interface TestResult {
  type: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  jobId?: string;
}

type DiagnosticTestConfig = {
  type: string;
  jobType: string;
  label: string;
  icon: typeof Wifi;
  description: string;
};

const DIAGNOSTIC_TESTS: DiagnosticTestConfig[] = [
  { type: 'ping', jobType: 'network_diagnostics', label: 'Testar conexão', icon: Wifi, description: 'Verifica se o computador responde' },
  { type: 'collect_logs', jobType: 'collect_info', label: 'Coletar registros', icon: FileText, description: 'Obtém logs do sistema' },
  { type: 'health_report', jobType: 'scan', label: 'Relatório de saúde', icon: Activity, description: 'Verifica estado geral' },
  { type: 'check_services', jobType: 'service_health_check', label: 'Verificar serviços', icon: Settings, description: 'Checa serviços importantes' },
];

function toErrorMessage(value: unknown): string {
  if (!value) return 'Erro desconhecido';
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;

  if (typeof value === 'object') {
    const obj = value as any;
    const nested = obj.message ?? obj.description ?? obj.error ?? obj.details ?? obj.hint;
    if (nested && nested !== value) {
      return toErrorMessage(nested);
    }

    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }

  return String(value);
}

export function DiagnosticTestRunner({ 
  agentId, 
  agentName,
  onComplete, 
  className 
}: DiagnosticTestRunnerProps) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const { formatError } = useSimplifiedMessage();
  const [isRunning, setIsRunning] = useState(false);
  const [currentTestIndex, setCurrentTestIndex] = useState(-1);
  const [results, setResults] = useState<TestResult[]>([]);
  
  const progress = results.length > 0 
    ? Math.round((results.filter(r => r.status === 'completed' || r.status === 'failed').length / DIAGNOSTIC_TESTS.length) * 100)
    : 0;

  const createJobMutation = useMutation({
    mutationFn: async ({ jobType, jobAgentName }: { jobType: string; jobAgentName: string }) => {
      if (!tenant?.id || !agentId) throw new Error('Dados incompletos');
      
      // Cancel any stale active jobs of the same type for this agent to avoid dedup constraint
      // V-1058 FIX: Add tenant_id filter to prevent cross-tenant job cancellation
      await supabase
        .from('jobs')
        .update({ 
          status: 'cancelled', 
          result_data: { cancelled_reason: 'superseded_by_diagnostic_test' } 
        })
        .eq('agent_id', agentId)
        .eq('tenant_id', tenant.id)
        .eq('type', jobType)
        .in('status', ['pending', 'queued', 'delivered']);
      
      const job = await prepareJobForInsert({
        tenant_id: tenant.id,
        agent_id: agentId,
        agent_name: jobAgentName,
        type: jobType,
        payload: { 
          test_mode: true,
          source: 'diagnostic_test_runner' 
        },
      });
      
      const { data, error } = await supabase
        .from('jobs')
        .insert([job])
        .select('id')
        .single();
        
      if (error) throw error;
      return data;
    },
  });

  const runTests = async () => {
    if (!agentId) {
      toast.error('Selecione um computador primeiro');
      return;
    }

    setIsRunning(true);
    setResults([]);
    setCurrentTestIndex(0);

    const testResults: TestResult[] = [];
    const currentAgentName = agentName || 'Unknown';

    for (let i = 0; i < DIAGNOSTIC_TESTS.length; i++) {
      const test = DIAGNOSTIC_TESTS[i];
      setCurrentTestIndex(i);

      // Mark as running
      setResults(prev => [
        ...prev.filter(r => r.type !== test.type),
        { type: test.type, label: test.label, status: 'running' }
      ]);

      try {
        const job = await createJobMutation.mutateAsync({ 
          jobType: test.jobType,
          jobAgentName: currentAgentName 
        });
        
        // Mark as completed (job created successfully)
        const result: TestResult = {
          type: test.type,
          label: test.label,
          status: 'completed',
          jobId: job.id,
        };
        testResults.push(result);
        setResults(prev => [
          ...prev.filter(r => r.type !== test.type),
          result
        ]);
      } catch (error) {
        // Mark as failed with simplified error
        const errorMessage = toErrorMessage(error);
        const result: TestResult = {
          type: test.type,
          label: test.label,
          status: 'failed',
          error: errorMessage,
        };
        testResults.push(result);
        setResults(prev => [
          ...prev.filter(r => r.type !== test.type),
          result
        ]);
      }

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setIsRunning(false);
    setCurrentTestIndex(-1);
    
    // Invalidate jobs query to show new jobs in JobLiveMonitor
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    
    const successCount = testResults.filter(r => r.status === 'completed').length;
    if (successCount === testResults.length) {
      toast.success(`✅ Todos os ${successCount} testes enviados com sucesso!`);
    } else {
      toast.info(`${successCount} de ${testResults.length} testes enviados`);
    }
    
    onComplete?.(testResults);
  };

  const getTestStatus = (testType: string): StatusType => {
    const result = results.find(r => r.type === testType);
    if (!result) return 'pending';
    if (result.status === 'running') return 'running';
    if (result.status === 'completed') return 'completed';
    if (result.status === 'failed') return 'failed';
    return 'pending';
  };

  const isTestRunning = (testType: string) => {
    const result = results.find(r => r.type === testType);
    return result?.status === 'running';
  };

  if (!agentId) {
    return (
      <div className={cn("text-center py-6 text-muted-foreground", className)}>
        <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Selecione um computador para executar testes</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {agentName ? `Testando: ${agentName}` : 'Computador selecionado'}
          </p>
        </div>
        <Button
          onClick={runTests}
          disabled={isRunning || !agentId}
          size="sm"
          className="gap-2"
        >
          {isRunning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Testando...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Iniciar Testes
            </>
          )}
        </Button>
      </div>

      {/* Progress */}
      {isRunning && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progresso</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {/* Test List */}
      <div className="space-y-2">
        {DIAGNOSTIC_TESTS.map((test, index) => {
          const Icon = test.icon;
          const status = getTestStatus(test.type);
          const running = isTestRunning(test.type);
          const result = results.find(r => r.type === test.type);
          
          return (
            <div
              key={test.type}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                running && "bg-blue-500/5 border-blue-500/30",
                status === 'completed' && "bg-green-500/5 border-green-500/30",
                status === 'failed' && "bg-red-500/5 border-red-500/30",
                status === 'pending' && "bg-muted/30 border-border/50"
              )}
            >
              {/* Icon */}
              <div className={cn(
                "p-2 rounded-full",
                running && "bg-blue-500/10",
                status === 'completed' && "bg-green-500/10",
                status === 'failed' && "bg-red-500/10",
                status === 'pending' && "bg-muted/50"
              )}>
                {running ? (
                  <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                ) : status === 'completed' ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : status === 'failed' ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <Icon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm font-medium",
                  running && "text-blue-600 dark:text-blue-400",
                  status === 'completed' && "text-green-600 dark:text-green-400",
                  status === 'failed' && "text-red-600 dark:text-red-400"
                )}>
                  {test.label}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {result?.error || test.description}
                </p>
              </div>

              {/* Status Badge */}
              <div className="flex-shrink-0">
                {status !== 'pending' && (
                  <SimpleStatusIndicator 
                    status={status} 
                    size="sm" 
                    showLabel={false}
                    showPulse={running}
                  />
                )}
                {status === 'pending' && !isRunning && (
                  <Clock className="h-4 w-4 text-muted-foreground/50" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Results Summary */}
      {!isRunning && results.length > 0 && (
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Resultado:</span>
            <span className={cn(
              "font-medium",
              results.every(r => r.status === 'completed') && "text-green-600",
              results.some(r => r.status === 'failed') && "text-amber-600"
            )}>
              {results.filter(r => r.status === 'completed').length} de {results.length} tarefas enviadas
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Os resultados aparecerão no monitor de tarefas acima conforme são executados.
          </p>
        </div>
      )}
    </div>
  );
}
