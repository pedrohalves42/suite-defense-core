/**
 * Hexagonal Adapter: Smart Router Metrics from DB
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import type { SmartRouterPort, ProviderCapability, RoutingDecision } from './smart-router-port.ts';
import { TaskComplexity } from './smart-router-port.ts';
import type { AIProviderName } from '../ai-multi-provider.ts';
import { logger } from '../logger.ts';

// Provider ? supported complexity tiers (static config)
const PROVIDER_TIERS: Record<AIProviderName, TaskComplexity[]> = {
  'cerebras': [TaskComplexity.SIMPLE, TaskComplexity.MODERATE],
  'groq': [TaskComplexity.SIMPLE, TaskComplexity.MODERATE, TaskComplexity.COMPLEX],
  'mistral': [TaskComplexity.SIMPLE, TaskComplexity.MODERATE],
  'openrouter': [TaskComplexity.SIMPLE, TaskComplexity.MODERATE, TaskComplexity.COMPLEX],
  'google-gemini': [TaskComplexity.MODERATE, TaskComplexity.COMPLEX],
  'lovable': [TaskComplexity.MODERATE, TaskComplexity.COMPLEX],
};

const PROVIDER_MAX_CONTEXT: Record<AIProviderName, number> = {
  'cerebras': 8192,
  'groq': 8000,
  'mistral': 8192,
  'openrouter': 8192,
  'google-gemini': 32000,
  'lovable': 32000,
};

export class SupabaseSmartRouterAdapter implements SmartRouterPort {
  constructor(private readonly client: SupabaseClient) {}

  async fetchProviderMetrics(): Promise<ProviderCapability[]> {
    try {
      // Get last 1 hour of metrics per provider
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      const { data, error } = await this.client
        .from('ai_inference_metrics')
        .select('provider, latency_ms, success')
        .gte('created_at', oneHourAgo)
        .not('provider', 'is', null);

      if (error || !data) {
        logger.warn('[SmartRouterAdapter] Failed to fetch metrics', { error: error?.message });
        return this.getDefaultCapabilities();
      }

      // Aggregate per provider
      const byProvider: Record<string, { latencies: number[]; failures: number; total: number }> = {};

      for (const row of data) {
        const p = row.provider as string;
        if (!byProvider[p]) {
          byProvider[p] = { latencies: [], failures: 0, total: 0 };
        }
        byProvider[p].total++;
        if (row.success) {
          byProvider[p].latencies.push(row.latency_ms || 0);
        } else {
          byProvider[p].failures++;
        }
      }

      const providers = Object.keys(PROVIDER_TIERS) as AIProviderName[];
      return providers.map((name) => {
        const stats = byProvider[name];
        const avgLatency = stats?.latencies.length
          ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
          : 1000;
        const failureRate = stats?.total ? stats.failures / stats.total : 0;

        return {
          provider: name,
          supportedTiers: PROVIDER_TIERS[name],
          avgLatencyMs: Math.round(avgLatency),
          failureRate: Math.round(failureRate * 100) / 100,
          costPerMToken: 0, // enriched by caller
          maxContextTokens: PROVIDER_MAX_CONTEXT[name],
        };
      });
    } catch (err) {
      logger.warn('[SmartRouterAdapter] Exception', { error: (err as Error).message });
      return this.getDefaultCapabilities();
    }
  }

  async logRoutingDecision(decision: RoutingDecision, functionName: string): Promise<void> {
    logger.info('[SmartRouter] Decision', {
      provider: decision.selectedProvider,
      complexity: decision.complexity,
      reason: decision.reason,
      score: decision.score,
      functionName,
    });
  }

  private getDefaultCapabilities(): ProviderCapability[] {
    return (Object.keys(PROVIDER_TIERS) as AIProviderName[]).map((name) => ({
      provider: name,
      supportedTiers: PROVIDER_TIERS[name],
      avgLatencyMs: 1000,
      failureRate: 0,
      costPerMToken: 0,
      maxContextTokens: PROVIDER_MAX_CONTEXT[name],
    }));
  }
}
