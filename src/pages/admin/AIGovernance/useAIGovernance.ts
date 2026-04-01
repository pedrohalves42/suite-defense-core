import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AIModelUsage {
  model: string;
  total_calls: number;
  total_tokens: number;
  success_rate: number;
  avg_latency_ms: number;
}

export interface TenantAICosts {
  tenant_id: string;
  tenant_name: string;
  total_calls: number;
  total_tokens: number;
  estimated_cost_usd: number;
  success_rate: number;
  avg_latency_ms: number;
}

export interface PromptVersion {
  id: string;
  version: string;
  hash: string;
  description: string;
  usage_count: number;
}

export function useAIGovernance() {
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
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });

  const aggregatedMetrics = useMemo(() => {
    if (!metricsData || metricsData.length === 0) {
      return {
        totalCalls: 0, successRate: 0, avgLatency: 0,
        totalTokens: 0, estimatedCostUsd: 0,
        byModel: [] as AIModelUsage[], byTenant: [] as TenantAICosts[],
        circuitBreakerTrips: 0,
      };
    }

    const totalCalls = metricsData.length;
    const successCount = metricsData.filter(m => m.success).length;
    const successRate = (successCount / totalCalls) * 100;
    const avgLatency = metricsData.reduce((sum, m) => sum + m.latency_ms, 0) / totalCalls;
    const totalTokens = metricsData.reduce((sum, m) => sum + (m.tokens_total || 0), 0);
    const estimatedCostUsd = (totalTokens / 1000) * 0.001;
    const circuitBreakerTrips = metricsData.filter(m => m.circuit_breaker_state === 'open').length;

    const modelMap = new Map<string, { calls: number; tokens: number; success: number; latency: number }>();
    metricsData.forEach(m => {
      const existing = modelMap.get(m.model) || { calls: 0, tokens: 0, success: 0, latency: 0 };
      modelMap.set(m.model, {
        calls: existing.calls + 1,
        tokens: existing.tokens + (m.tokens_total || 0),
        success: existing.success + (m.success ? 1 : 0),
        latency: existing.latency + m.latency_ms,
      });
    });
    const byModel: AIModelUsage[] = Array.from(modelMap.entries()).map(([model, d]) => ({
      model, total_calls: d.calls, total_tokens: d.tokens,
      success_rate: (d.success / d.calls) * 100,
      avg_latency_ms: d.latency / d.calls,
    }));

    const tenantMap = new Map<string, { calls: number; tokens: number; success: number; latency: number }>();
    metricsData.forEach(m => {
      const tid = m.tenant_id || 'unknown';
      const existing = tenantMap.get(tid) || { calls: 0, tokens: 0, success: 0, latency: 0 };
      tenantMap.set(tid, {
        calls: existing.calls + 1,
        tokens: existing.tokens + (m.tokens_total || 0),
        success: existing.success + (m.success ? 1 : 0),
        latency: existing.latency + m.latency_ms,
      });
    });
    const byTenant: TenantAICosts[] = Array.from(tenantMap.entries()).map(([tenant_id, d]) => ({
      tenant_id, tenant_name: tenant_id.substring(0, 8) + '...',
      total_calls: d.calls, total_tokens: d.tokens,
      estimated_cost_usd: (d.tokens / 1000) * 0.001,
      success_rate: (d.success / d.calls) * 100,
      avg_latency_ms: d.latency / d.calls,
    }));

    return { totalCalls, successRate, avgLatency, totalTokens, estimatedCostUsd, byModel, byTenant, circuitBreakerTrips };
  }, [metricsData]);

  const prompts: PromptVersion[] = [
    { id: 'agent-analyzer', version: '1.0.0', hash: 'sha256:a1b2c3...', description: 'Análise de agentes individuais', usage_count: 0 },
    { id: 'system-analyzer', version: '1.0.0', hash: 'sha256:d4e5f6...', description: 'Análise de sistema global', usage_count: 0 },
    { id: 'network-anomaly', version: '1.0.0', hash: 'sha256:g7h8i9...', description: 'Detecção de anomalias de rede', usage_count: 0 },
    { id: 'action-executor', version: '1.0.0', hash: 'sha256:j0k1l2...', description: 'Executor de ações aprovadas', usage_count: 0 },
  ];

  return { aggregatedMetrics, metricsLoading, prompts };
}
