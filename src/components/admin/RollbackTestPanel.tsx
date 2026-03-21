import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  RotateCcw, PlayCircle, CheckCircle2, XCircle, AlertTriangle, 
  Loader2, Clock, FlaskConical, History 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBrazilDateTime } from '@/lib/date-utils';

interface RollbackTestResult {
  test_id: string;
  status: string;
  dry_run: boolean;
  from_version: string;
  to_version: string;
  steps: Array<{
    step: number;
    name: string;
    status: string;
    detail: string;
  }>;
  duration_ms: number;
}

interface StoredTest {
  id: string;
  test_type: string;
  dry_run: boolean;
  from_version: string | null;
  to_version: string | null;
  test_status: string;
  steps_executed: unknown;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

function parseSteps(steps: unknown): Array<{ step: number; name: string; status: string; detail: string }> {
  if (Array.isArray(steps)) return steps;
  return [];
}

export function RollbackTestPanel() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [latestResult, setLatestResult] = useState<RollbackTestResult | null>(null);

  const { data: agents } = useQuery({
    queryKey: ['agents-for-rollback', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('id, hostname, agent_version, status')
        .eq('tenant_id', tenant!.id)
        .in('status', ['healthy', 'degraded', 'safe_mode', 'updating'])
        .order('hostname');
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: testHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['rollback-test-history', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rollback_test_results')
        .select('id, tenant_id, test_type, test_status, dry_run, from_version, to_version, duration_ms, error_message, steps_total, agent_id, created_at, completed_at')
        .eq('tenant_id', tenant!.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []) as StoredTest[];
    },
    enabled: !!tenant?.id,
  });

  const runTestMutation = useMutation({
    mutationFn: async ({ dryRun }: { dryRun: boolean }) => {
      const { data, error } = await supabase.rpc('execute_rollback_test', {
        p_tenant_id: tenant!.id,
        p_agent_id: selectedAgent === 'all' ? null : selectedAgent,
        p_dry_run: dryRun,
      });
      if (error) throw error;
      return data as unknown as RollbackTestResult;
    },
    onSuccess: (data) => {
      setLatestResult(data);
      queryClient.invalidateQueries({ queryKey: ['rollback-test-history'] });
      if (data.status === 'passed') {
        toast.success('Teste de rollback passou', {
          description: `${data.dry_run ? 'DRY RUN' : 'REAL'}: ${data.from_version} → ${data.to_version}`,
        });
      } else {
        toast.warning('Teste de rollback com problemas', {
          description: data.steps?.find(s => s.status === 'failed')?.detail || 'Verifique os detalhes',
        });
      }
    },
    onError: (error) => {
      toast.error('Erro ao executar teste', { description: error.message });
    },
  });

  const stepStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle2 className="h-4 w-4 text-primary" />;
      case 'failed': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-accent-foreground" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const testStatusBadge = (status: string) => {
    const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      passed: { variant: 'default', label: 'Aprovado' },
      failed: { variant: 'destructive', label: 'Falhou' },
      running: { variant: 'secondary', label: 'Executando' },
      pending: { variant: 'outline', label: 'Pendente' },
      skipped: { variant: 'outline', label: 'Pulado' },
    };
    const config = map[status] || map.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const displayResult = latestResult;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          Teste de Rollback (Dry-Run)
        </CardTitle>
        <CardDescription>
          Valide a capacidade de rollback sem afetar a produção. O teste verifica cache de builds, 
          máquina de estados, integridade de arquivos e cadeia de execução.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-sm font-medium mb-1.5 block">Agente</label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar agente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Qualquer agente online</SelectItem>
                {agents?.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.hostname} (v{a.agent_version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => runTestMutation.mutate({ dryRun: true })}
            disabled={runTestMutation.isPending || !tenant?.id}
            className="gap-2"
          >
            {runTestMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            Executar Dry-Run
          </Button>
        </div>

        {/* Latest Result */}
        {displayResult && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">
                  {displayResult.from_version} → {displayResult.to_version}
                </span>
                {displayResult.dry_run && (
                  <Badge variant="outline" className="text-[10px]">DRY RUN</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {testStatusBadge(displayResult.status)}
                <span className="text-xs text-muted-foreground">{displayResult.duration_ms}ms</span>
              </div>
            </div>

            <div className="space-y-2">
              {displayResult.steps?.map((step) => (
                <div key={step.step} className="flex items-start gap-2 text-sm">
                  {stepStatusIcon(step.status)}
                  <div>
                    <span className="font-mono text-xs text-muted-foreground mr-2">{step.name}</span>
                    <span className={cn(
                      step.status === 'failed' && 'text-destructive',
                      step.status === 'warning' && 'text-accent-foreground'
                    )}>
                      {step.detail}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        {testHistory && testHistory.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-medium mb-2">
              <History className="h-4 w-4" />
              Histórico de Testes
            </h4>
            <div className="space-y-1.5">
              {testHistory.map(test => (
                <div key={test.id} className="flex items-center justify-between text-sm p-2 rounded border">
                  <div className="flex items-center gap-2">
                    {testStatusBadge(test.test_status)}
                    <span className="text-xs">
                      {test.from_version} → {test.to_version}
                    </span>
                    {test.dry_run && (
                      <Badge variant="outline" className="text-[10px]">DRY RUN</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{test.duration_ms}ms</span>
                    <span>{formatBrazilDateTime(test.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
