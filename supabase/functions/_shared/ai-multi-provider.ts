/**
 * AI Multi-Provider System v3.0 — Orchestrator
 * 
 * Decomposed into:
 *  - ai-multi-provider-types.ts (types)
 *  - ai-provider-configs.ts (provider definitions)
 *  - ai-provider-routing.ts (circuit breaker + routing)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { createMetricsLogger, extractTokenUsage } from './ai-metrics.ts';
import { SupabaseAICacheAdapter } from './hexagonal/ai-cache-adapter.ts';
import { AICacheUseCase } from './hexagonal/ai-cache-use-case.ts';
import { logger } from './logger.ts';
import { PROVIDERS } from './ai-provider-configs.ts';
import {
  providerCircuits, providerStats,
  recordProviderSuccess, recordProviderFailure,
  recordStatsSuccess, recordStatsFailure,
  calculateProviderScore, getAvailableProviders,
  selectSmartProvider, setScoreBasedRouting,
  isProviderAvailable,
} from './ai-provider-routing.ts';

import type {
  AIProviderName, AIProviderConfig, AIMessage,
  AICompletionRequest, AICompletionResponse,
} from './ai-multi-provider-types.ts';

// Re-export types and helpers for backward compatibility
export type { AIProviderName, AIProviderConfig, AIMessage, AICompletionRequest, AICompletionResponse };
export { setScoreBasedRouting };

// ============ PROVIDER-SPECIFIC API CALLS ============

async function callGoogleGemini(
  config: AIProviderConfig, messages: AIMessage[], maxTokens: number
): Promise<{ content: string; tokens?: { prompt?: number; completion?: number; total?: number } }> {
  const apiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  const systemMsg = messages.find(m => m.role === 'system');
  const contents = messages.filter(m => m.role !== 'system').map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));
  const requestBody: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  };
  if (systemMsg) requestBody.systemInstruction = { parts: [{ text: systemMsg.content }] };

  const response = await fetch(`${config.baseUrl}/${config.model}:generateContent?key=${apiKey}`, {
    method: 'POST', headers: config.headers(), body: JSON.stringify(requestBody),
  });
  if (!response.ok) { const errorText = await response.text(); throw new Error(`Gemini API error ${response.status}: ${errorText}`); }
  const data = await response.json();
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    tokens: { prompt: data.usageMetadata?.promptTokenCount, completion: data.usageMetadata?.candidatesTokenCount, total: data.usageMetadata?.totalTokenCount },
  };
}

async function callOpenAICompatible(
  config: AIProviderConfig, messages: AIMessage[], maxTokens: number
): Promise<{ content: string; tokens?: { prompt?: number; completion?: number; total?: number } }> {
  const response = await fetch(config.baseUrl, {
    method: 'POST', headers: config.headers(),
    body: JSON.stringify({ model: config.model, messages, max_tokens: maxTokens, temperature: 0.7 }),
  });
  if (!response.ok) { const errorText = await response.text(); throw new Error(`${config.displayName} API error ${response.status}: ${errorText}`); }
  const data = await response.json();
  return { content: data.choices?.[0]?.message?.content || '', tokens: extractTokenUsage(data) };
}

async function callProvider(
  config: AIProviderConfig, messages: AIMessage[], maxTokens: number
): Promise<{ content: string; tokens?: { prompt?: number; completion?: number; total?: number } }> {
  if (config.name === 'google-gemini') return callGoogleGemini(config, messages, maxTokens);
  return callOpenAICompatible(config, messages, maxTokens);
}

// ============ METRICS PERSISTENCE ============

async function persistAIMetricsWithProvider(data: {
  function_name: string; model: string; provider: AIProviderName; latency_ms: number;
  success: boolean; tokens_total?: number; tokens_prompt?: number; tokens_completion?: number;
  tenant_id?: string; used_fallback: boolean; cost_usd?: number; error?: string;
}): Promise<void> {
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await supabase.from('ai_inference_metrics').insert({
      function_name: data.function_name, model: data.model, provider: data.provider,
      latency_ms: data.latency_ms, success: data.success,
      tokens_total: data.tokens_total || null, tokens_prompt: data.tokens_prompt || null,
      tokens_completion: data.tokens_completion || null, tenant_id: data.tenant_id || null,
      used_fallback: data.used_fallback, cost_usd: data.cost_usd || 0,
      error: data.error || null, created_at: new Date().toISOString(),
    });
  } catch (err) { logger.warn('[AI Metrics] Failed to persist:', err); }
}

// ============ MAIN COMPLETION FUNCTION ============

export async function aiComplete(request: AICompletionRequest): Promise<AICompletionResponse> {
  const startTime = Date.now();
  const { messages, maxTokens = 1024, functionName = 'unknown', tenantId } = request;
  const metrics = createMetricsLogger(functionName, 'multi-provider');
  metrics.logStart(tenantId);

  // Cache Lookup
  let cacheUseCase: AICacheUseCase | null = null;
  let cacheResult: Awaited<ReturnType<AICacheUseCase['lookup']>> | null = null;
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && serviceRoleKey) {
      const cacheClient = createClient(supabaseUrl, serviceRoleKey);
      cacheUseCase = new AICacheUseCase(new SupabaseAICacheAdapter(cacheClient));
      cacheResult = await cacheUseCase.lookup(messages, functionName, tenantId);
      if (cacheResult.hit && cacheResult.cached) {
        const latencyMs = Date.now() - startTime;
        logger.info(`[AI Router] Cache HIT for ${functionName} (${latencyMs}ms)`);
        persistAIMetricsWithProvider({ function_name: functionName, model: cacheResult.cached.model, provider: cacheResult.cached.provider as AIProviderName, latency_ms: latencyMs, success: true, tokens_total: 0, tenant_id: tenantId, used_fallback: false, cost_usd: 0 });
        return { content: cacheResult.cached.responseContent, provider: cacheResult.cached.provider as AIProviderName, model: cacheResult.cached.model, tokensUsed: { total: 0 }, latencyMs, usedFallback: false };
      }
    }
  } catch (cacheErr) { logger.warn('[AI Router] Cache lookup failed:', cacheErr); }

  // Provider Routing with Failover
  let provider = await selectSmartProvider(functionName, messages);
  let usedFallback = false;
  let lastError: string | undefined;
  const attemptedProviders: Set<AIProviderName> = new Set();

  while (provider && attemptedProviders.size < PROVIDERS.length) {
    attemptedProviders.add(provider.name);
    try {
      const score = calculateProviderScore(provider);
      logger.info(`[AI Router] Trying ${provider.displayName} (score: ${score}, weight: ${provider.weight})`);
      const result = await callProvider(provider, messages, Math.min(maxTokens, provider.maxTokens));
      const latencyMs = Date.now() - startTime;
      recordProviderSuccess(provider.name);
      recordStatsSuccess(provider.name, latencyMs);
      const tokensUsed = result.tokens?.total || 0;
      const costUsd = (tokensUsed / 1_000_000) * provider.costPerMToken;

      persistAIMetricsWithProvider({ function_name: functionName, model: provider.model, provider: provider.name, latency_ms: latencyMs, success: true, tokens_total: tokensUsed, tokens_prompt: result.tokens?.prompt, tokens_completion: result.tokens?.completion, tenant_id: tenantId, used_fallback: usedFallback, cost_usd: costUsd });

      if (cacheUseCase && cacheResult && result.content) {
        cacheUseCase.store({ promptHash: cacheResult.promptHash, taskCategory: cacheResult.taskCategory, ttlMinutes: cacheResult.ttlMinutes, responseContent: result.content, provider: provider.name, model: provider.model, tokensUsed, costUsd, tenantId, functionName, latencyMs }).catch(err => logger.warn('[AI Router] Cache store failed:', err));
      }

      return { content: result.content, provider: provider.name, model: provider.model, tokensUsed: result.tokens, latencyMs, usedFallback };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      recordProviderFailure(provider.name, lastError);
      recordStatsFailure(provider.name);
      logger.warn(`[AI Router] ${provider.displayName} failed: ${lastError}`);
      const remaining = getAvailableProviders().filter(p => !attemptedProviders.has(p.name)).sort((a, b) => calculateProviderScore(a) - calculateProviderScore(b));
      provider = remaining.length > 0 ? remaining[0] : null;
      if (provider) usedFallback = true;
    }
  }

  const finalLatencyMs = Date.now() - startTime;
  persistAIMetricsWithProvider({ function_name: functionName, model: 'none', provider: 'lovable', latency_ms: finalLatencyMs, success: false, tenant_id: tenantId, used_fallback: true, error: lastError });
  return { content: '', provider: 'lovable', model: 'none', latencyMs: finalLatencyMs, usedFallback: true, error: `All AI providers failed. Last error: ${lastError}` };
}

// ============ HELPER FUNCTIONS ============

export function getProviderStatus(): Record<AIProviderName, { enabled: boolean; circuitOpen: boolean; failures: number }> {
  const status: Record<string, { enabled: boolean; circuitOpen: boolean; failures: number }> = {};
  for (const provider of PROVIDERS) {
    const circuit = providerCircuits[provider.name];
    status[provider.name] = { enabled: provider.enabled(), circuitOpen: circuit.isOpen, failures: circuit.failures };
  }
  return status as Record<AIProviderName, { enabled: boolean; circuitOpen: boolean; failures: number }>;
}

export function resetProviderCircuit(provider: AIProviderName): void {
  const circuit = providerCircuits[provider];
  if (!circuit) { logger.warn(`[multi-provider] Unknown provider: ${provider}`); return; }
  circuit.failures = 0; circuit.isOpen = false; circuit.lastFailure = 0;
  logger.info(`[multi-provider] ${provider} circuit manually reset`);
}

export function getActiveProviders(): AIProviderName[] {
  return getAvailableProviders().map(p => p.name);
}

export function getProviderScores(): Array<{
  provider: AIProviderName; displayName: string; score: number; avgLatencyMs: number;
  requests: number; failures: number; failureRate: number; circuitOpen: boolean; enabled: boolean; weight: number;
}> {
  return PROVIDERS.map(p => {
    const stats = providerStats[p.name];
    const circuit = providerCircuits[p.name];
    const failureRate = stats.requests > 0 ? stats.failures / stats.requests : 0;
    return {
      provider: p.name, displayName: p.displayName, score: calculateProviderScore(p),
      avgLatencyMs: stats.avgLatencyMs, requests: stats.requests, failures: stats.failures,
      failureRate: Math.round(failureRate * 100) / 100, circuitOpen: circuit.isOpen,
      enabled: p.enabled(), weight: p.weight,
    };
  }).sort((a, b) => a.score - b.score);
}

// ============ CONVENIENCE WRAPPERS ============

export async function aiSimpleComplete(
  systemPrompt: string, userPrompt: string,
  options?: { maxTokens?: number; functionName?: string; tenantId?: string }
): Promise<AICompletionResponse> {
  return aiComplete({
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    maxTokens: options?.maxTokens, functionName: options?.functionName, tenantId: options?.tenantId,
  });
}

export async function aiJsonComplete<T>(
  systemPrompt: string, userPrompt: string,
  options?: { maxTokens?: number; functionName?: string; tenantId?: string }
): Promise<{ data: T | null; response: AICompletionResponse }> {
  const response = await aiSimpleComplete(systemPrompt, userPrompt, options);
  if (response.error || !response.content) return { data: null, response };
  try {
    let jsonStr = response.content;
    const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) { jsonStr = jsonMatch[1]; } else { const objMatch = response.content.match(/\{[\s\S]*\}/); if (objMatch) jsonStr = objMatch[0]; }
    return { data: JSON.parse(jsonStr) as T, response };
  } catch (parseError) {
    logger.warn('[multi-provider] Failed to parse JSON response:', parseError);
    return { data: null, response: { ...response, error: `JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}` } };
  }
}
