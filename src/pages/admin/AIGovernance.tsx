import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, 
  Shield, 
  DollarSign, 
  Activity, 
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap
} from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

interface TenantAICosts {
  tenant_id: string;
  tenant_name: string;
  total_calls: number;
  total_tokens: number;
  estimated_cost_usd: number;
  success_rate: number;
  avg_latency_ms: number;
}

interface AIModelUsage {
  model: string;
  total_calls: number;
  total_tokens: number;
  success_rate: number;
  avg_latency_ms: number;
}

interface PromptVersion {
  id: string;
  version: string;
  hash: string;
  description: string;
  usage_count: number;
}

export default function AIGovernance() {
  const adaptiveInterval = useAdaptivePolling(300000);
  // Fetch AI metrics summary
  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['ai-governance-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_inference_metrics')
        .select('id, function_name, model, provider, success, latency_ms, tokens_total, tokens_prompt, tokens_completion, cost_usd, error, used_fallback, circuit_breaker_state, tenant_id, created_at')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: adaptiveInterval,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Calculate aggregated metrics
  const aggregatedMetrics = React.useMemo(() => {
    if (!metricsData || metricsData.length === 0) {
      return {
        totalCalls: 0,
        successRate: 0,
        avgLatency: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        byModel: [] as AIModelUsage[],
        byTenant: [] as TenantAICosts[],
        circuitBreakerTrips: 0
      };
    }

    const totalCalls = metricsData.length;
    const successCount = metricsData.filter(m => m.success).length;
    const successRate = (successCount / totalCalls) * 100;
    const avgLatency = metricsData.reduce((sum, m) => sum + m.latency_ms, 0) / totalCalls;
    const totalTokens = metricsData.reduce((sum, m) => sum + (m.tokens_total || 0), 0);
    
    // Estimate cost (simplified: $0.001 per 1K tokens)
    const estimatedCostUsd = (totalTokens / 1000) * 0.001;

    // Circuit breaker trips
    const circuitBreakerTrips = metricsData.filter(m => m.circuit_breaker_state === 'open').length;

    // Aggregate by model
    const modelMap = new Map<string, { calls: number; tokens: number; success: number; latency: number }>();
    metricsData.forEach(m => {
      const existing = modelMap.get(m.model) || { calls: 0, tokens: 0, success: 0, latency: 0 };
      modelMap.set(m.model, {
        calls: existing.calls + 1,
        tokens: existing.tokens + (m.tokens_total || 0),
        success: existing.success + (m.success ? 1 : 0),
        latency: existing.latency + m.latency_ms
      });
    });
    
    const byModel: AIModelUsage[] = Array.from(modelMap.entries()).map(([model, data]) => ({
      model,
      total_calls: data.calls,
      total_tokens: data.tokens,
      success_rate: (data.success / data.calls) * 100,
      avg_latency_ms: data.latency / data.calls
    }));

    // Aggregate by tenant
    const tenantMap = new Map<string, { calls: number; tokens: number; success: number; latency: number }>();
    metricsData.forEach(m => {
      const tenantId = m.tenant_id || 'unknown';
      const existing = tenantMap.get(tenantId) || { calls: 0, tokens: 0, success: 0, latency: 0 };
      tenantMap.set(tenantId, {
        calls: existing.calls + 1,
        tokens: existing.tokens + (m.tokens_total || 0),
        success: existing.success + (m.success ? 1 : 0),
        latency: existing.latency + m.latency_ms
      });
    });
    
    const byTenant: TenantAICosts[] = Array.from(tenantMap.entries()).map(([tenant_id, data]) => ({
      tenant_id,
      tenant_name: tenant_id.substring(0, 8) + '...',
      total_calls: data.calls,
      total_tokens: data.tokens,
      estimated_cost_usd: (data.tokens / 1000) * 0.001,
      success_rate: (data.success / data.calls) * 100,
      avg_latency_ms: data.latency / data.calls
    }));

    return {
      totalCalls,
      successRate,
      avgLatency,
      totalTokens,
      estimatedCostUsd,
      byModel,
      byTenant,
      circuitBreakerTrips
    };
  }, [metricsData]);

  // Prompt registry (static for now)
  const prompts: PromptVersion[] = [
    { id: 'agent-analyzer', version: '1.0.0', hash: 'sha256:a1b2c3...', description: 'Análise de agentes individuais', usage_count: 0 },
    { id: 'system-analyzer', version: '1.0.0', hash: 'sha256:d4e5f6...', description: 'Análise de sistema global', usage_count: 0 },
    { id: 'network-anomaly', version: '1.0.0', hash: 'sha256:g7h8i9...', description: 'Detecção de anomalias de rede', usage_count: 0 },
    { id: 'action-executor', version: '1.0.0', hash: 'sha256:j0k1l2...', description: 'Executor de ações aprovadas', usage_count: 0 }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Brain className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Governança de IA</h1>
          <p className="text-muted-foreground">Monitoramento, custos e compliance</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de Chamadas (24h)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{aggregatedMetrics.totalCalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Inferências de IA</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{aggregatedMetrics.successRate.toFixed(1)}%</div>
            <Progress value={aggregatedMetrics.successRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Latência Média</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(aggregatedMetrics.avgLatency)}ms</div>
            <p className="text-xs text-muted-foreground">SLO: &lt; 5000ms</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Custo Estimado (24h)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${aggregatedMetrics.estimatedCostUsd.toFixed(4)}</div>
            <p className="text-xs text-muted-foreground">{aggregatedMetrics.totalTokens.toLocaleString()} tokens</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {aggregatedMetrics.circuitBreakerTrips > 0 && (
        <Card className="border-destructive">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">Alertas de Circuit Breaker</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{aggregatedMetrics.circuitBreakerTrips} trips nas últimas 24h. Verifique os logs para mais detalhes.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Model Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Uso por Modelo
            </CardTitle>
            <CardDescription>Performance e consumo por modelo de IA</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Chamadas</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Sucesso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregatedMetrics.byModel.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Nenhum dado disponível
                    </TableCell>
                  </TableRow>
                ) : (
                  aggregatedMetrics.byModel.map((model) => (
                    <TableRow key={model.model}>
                      <TableCell className="font-medium">{model.model}</TableCell>
                      <TableCell className="text-right">{model.total_calls}</TableCell>
                      <TableCell className="text-right">{model.total_tokens.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={model.success_rate >= 95 ? 'default' : 'destructive'}>
                          {model.success_rate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Prompt Registry */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Registro de Prompts
            </CardTitle>
            <CardDescription>Versionamento e integridade dos prompts</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>Descrição</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prompts.map((prompt) => (
                  <TableRow key={prompt.id}>
                    <TableCell className="font-mono text-sm">{prompt.id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{prompt.version}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {prompt.hash.substring(0, 16)}...
                    </TableCell>
                    <TableCell className="text-sm">{prompt.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Costs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Custos por Tenant
          </CardTitle>
          <CardDescription>Consumo de IA por cliente nas últimas 24h</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant ID</TableHead>
                <TableHead className="text-right">Chamadas</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Custo Est.</TableHead>
                <TableHead className="text-right">Taxa Sucesso</TableHead>
                <TableHead className="text-right">Latência Média</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aggregatedMetrics.byTenant.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum dado disponível
                  </TableCell>
                </TableRow>
              ) : (
                aggregatedMetrics.byTenant.map((tenant) => (
                  <TableRow key={tenant.tenant_id}>
                    <TableCell className="font-mono text-sm">{tenant.tenant_name}</TableCell>
                    <TableCell className="text-right">{tenant.total_calls}</TableCell>
                    <TableCell className="text-right">{tenant.total_tokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${tenant.estimated_cost_usd.toFixed(4)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={tenant.success_rate >= 95 ? 'default' : 'destructive'}>
                        {tenant.success_rate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{Math.round(tenant.avg_latency_ms)}ms</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Compliance Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Checklist de Compliance
          </CardTitle>
          <CardDescription>Status dos controles de governança</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium">Segurança</h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Sanitização de inputs</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Circuit breakers ativos</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Rate limiting configurado</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Prompt injection prevention</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Privacidade</h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Anonimização de dados</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Isolamento por tenant</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Logs sem PII</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Retenção 30 dias</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Auditoria</h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Versionamento de prompts</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Logs estruturados</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Métricas persistidas</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Rastreabilidade completa</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
