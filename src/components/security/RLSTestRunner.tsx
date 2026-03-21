import { formatBrazilDateTime } from '@/lib/date-utils';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MetricDisplay } from '@/components/ui/metric-display';
import { Play, CheckCircle, XCircle, Clock, RefreshCw, Shield, AlertTriangle } from 'lucide-react';

interface RLSTestResult {
  id: string;
  test_name: string;
  passed: boolean;
  details: Record<string, unknown> | null;
  tested_at: string;
  table_name: string;
  test_run_id: string;
  failure_reason: string | null;
}

export function RLSTestRunner() {
  const queryClient = useQueryClient();
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);

  // Buscar resultados recentes dos testes RLS
  const { data: testResults, isLoading: isLoadingResults } = useQuery({
    queryKey: ['rls-test-results'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rls_test_results')
        .select('id, test_name, test_run_id, table_name, passed, failure_reason, tested_at')
        .order('tested_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as RLSTestResult[];
    },
    refetchInterval: 300000, // COST-OPT: 30s → 5min
  });

  // Mutation para executar testes RLS
  const runTestsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('run-rls-tests', {
        body: { test_type: 'cross_tenant_isolation' }
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setLastRunTime(new Date().toISOString());
      queryClient.invalidateQueries({ queryKey: ['rls-test-results'] });
    },
  });

  // Calcular metricas
  const totalTests = testResults?.length || 0;
  const passedTests = testResults?.filter(t => t.passed).length || 0;
  const failedTests = totalTests - passedTests;
  const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

  const latestResult = testResults?.[0];

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">RLS Cross-Tenant Isolation Tests</CardTitle>
          </div>
          <Badge variant={latestResult?.passed ? 'success' : latestResult ? 'destructive' : 'secondary'}>
            {latestResult?.passed ? 'PROVADO' : latestResult ? 'REFUTADO' : 'NAO TESTADO'}
          </Badge>
        </div>
        <CardDescription>
          Metodologia Nullmann: Prova empírica de isolamento entre tenants via RLS
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Botao de Execucao */}
        <div className="flex items-center gap-4">
          <Button 
            onClick={() => runTestsMutation.mutate()}
            disabled={runTestsMutation.isPending}
            className="gap-2"
          >
            {runTestsMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Executar Testes RLS
          </Button>
          
          {lastRunTime && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Última execução: {formatBrazilDateTime(lastRunTime, 'time')}
            </span>
          )}
        </div>

        {/* Metricas */}
        <div className="grid grid-cols-4 gap-4">
          <MetricDisplay
            value={totalTests}
            label="Total de Testes"
            size="sm"
          />
          <MetricDisplay
            value={passedTests}
            label="Aprovados"
            size="sm"
            trend={passedTests > 0 ? 'up' : 'neutral'}
          />
          <MetricDisplay
            value={failedTests}
            label="Reprovados"
            size="sm"
            trend={failedTests > 0 ? 'down' : 'neutral'}
          />
          <MetricDisplay
            value={`${passRate}%`}
            label="Taxa de Sucesso"
            size="sm"
            trend={passRate >= 80 ? 'up' : passRate >= 50 ? 'neutral' : 'down'}
          />
        </div>

        {/* Resultado Mais Recente */}
        {latestResult && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium flex items-center gap-2">
                {latestResult.passed ? (
                  <CheckCircle className="h-4 w-4 text-success" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                Último Teste: {latestResult.test_name}
              </h4>
              <span className="text-xs text-muted-foreground">
                {formatBrazilDateTime(latestResult.tested_at, 'short')}
              </span>
            </div>
            
            {latestResult.details && (
              <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
                {JSON.stringify(latestResult.details, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Historico */}
        {isLoadingResults ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : testResults && testResults.length > 1 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Histórico Recente</h4>
            <div className="space-y-1">
              {testResults.slice(1, 5).map((result) => (
                <div 
                  key={result.id}
                  className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {result.passed ? (
                      <CheckCircle className="h-3 w-3 text-success" />
                    ) : (
                      <XCircle className="h-3 w-3 text-destructive" />
                    )}
                    <span>{result.test_name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatBrazilDateTime(result.tested_at, 'date')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Nota Nullmann */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <strong className="text-foreground">Metodologia Nullmann:</strong> Este teste verifica empiricamente 
            se usuários de diferentes tenants veem dados isolados. Status "PROVADO" requer pelo menos 
            1 execução bem-sucedida com evidência de contagens diferentes entre tenants.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
