/**
 * AI Multi-Provider System v3.0
 * 
 * Weighted round-robin load balancing across 6 AI providers:
 * - Groq (Llama 3.3-70B) — 30% weight, fastest, free
 * - Cerebras (Llama 3.3-70B) — 20% weight, ultra-fast, free
 * - OpenRouter (Gemini 2.0 Flash) — 15% weight, free
 * - Google Gemini (2.5 Flash) — 15% weight, free tier
  * - Mistral (Small 3.1) — 10% weight, free tier 1B tokens/month
  * - Platform AI (Gemini 3 Flash) — 0% weight, emergency-only fallback
 * 
 * Features:
 * - Weighted round-robin distribution for cost optimization
 * - Score-based routing with automatic failover
 * - Per-provider circuit breakers
 * - Unified response format
 * - Detailed metrics logging
 */

import { createMetricsLogger, extractTokenUsage } from './ai-metrics.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { SupabaseAICacheAdapter } from './hexagonal/ai-cache-adapter.ts';
import { AICacheUseCase } from './hexagonal/ai-cache-use-case.ts';
import { SupabaseSmartRouterAdapter } from './hexagonal/smart-router-adapter.ts';
import { SmartRouterUseCase } from './hexagonal/smart-router-use-case.ts';
import { logger } from './logger.ts';

// ============ PROVIDER CONFIGURATION ============

export type AIProviderName = 
  | 'google-gemini' 
  | 'groq' 
  | 'openrouter' 
  | 'cerebras'
  | 'mistral'
  | 'lovable';

export interface AIProviderConfig {
  name: AIProviderName;
  displayName: string;
  baseUrl: string;
  model: string;
  headers: () => Record<string, string>;
  enabled: () => boolean;
  priority: number;
  maxTokens: number;
  costPerMToken: number;
  weight: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  functionName?: string;
  tenantId?: string;
}

export interface AICompletionResponse {
  content: string;
  provider: AIProviderName;
  model: string;
  tokensUsed?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  latencyMs: number;
  usedFallback: boolean;
  error?: string;
}

// Provider-specific circuit breaker states
const providerCircuits: Record<AIProviderName, {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}> = {
  'google-gemini': { failures: 0, lastFailure: 0, isOpen: false },
  'groq': { failures: 0, lastFailure: 0, isOpen: false },
  'openrouter': { failures: 0, lastFailure: 0, isOpen: false },
  'cerebras': { failures: 0, lastFailure: 0, isOpen: false },
  'mistral': { failures: 0, lastFailure: 0, isOpen: false },
  'lovable': { failures: 0, lastFailure: 0, isOpen: false },
};

// ============ PROVIDER STATS FOR SCORE-BASED ROUTING ============
interface ProviderStats {
  avgLatencyMs: number;
  requests: number;
  failures: number;
  lastUpdated: number;
}

const providerStats: Record<AIProviderName, ProviderStats> = {
  'google-gemini': { avgLatencyMs: 0, requests: 0, failures: 0, lastUpdated: 0 },
  'groq': { avgLatencyMs: 0, requests: 0, failures: 0, lastUpdated: 0 },
  'openrouter': { avgLatencyMs: 0, requests: 0, failures: 0, lastUpdated: 0 },
  'cerebras': { avgLatencyMs: 0, requests: 0, failures: 0, lastUpdated: 0 },
  'mistral': { avgLatencyMs: 0, requests: 0, failures: 0, lastUpdated: 0 },
  'lovable': { avgLatencyMs: 0, requests: 0, failures: 0, lastUpdated: 0 },
};

// Score weights
const SCORE_LATENCY_WEIGHT = 0.5;
const SCORE_COST_WEIGHT = 0.3;
const SCORE_ERROR_WEIGHT = 0.2;
const HIGH_LATENCY_THRESHOLD_MS = 10000;
const HIGH_LATENCY_PENALTY = 5000;

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 60000;

// Weighted round-robin state
let weightedCounter = 0;
let useScoreBasedRouting = true;

// Smart router singleton (lazy init)
let smartRouterInstance: SmartRouterUseCase | null = null;

function getSmartRouter(): SmartRouterUseCase | null {
  if (smartRouterInstance) return smartRouterInstance;
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (url && key) {
      const client = createClient(url, key);
      smartRouterInstance = new SmartRouterUseCase(new SupabaseSmartRouterAdapter(client));
    }
  } catch (e) { logger.warn('[ai-multi-provider] SmartRouter init failed:', e); }
  return smartRouterInstance;
}

// ============ PROVIDER DEFINITIONS ============

const PROVIDERS: AIProviderConfig[] = [
  {
    name: 'groq',
    displayName: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    headers: () => ({
      'Authorization': `Bearer ${Deno.env.get('GROQ_API_KEY')}`,
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('GROQ_API_KEY'),
    priority: 1,
    maxTokens: 8000,
    costPerMToken: 0,
    weight: 30,
  },
  {
    name: 'cerebras',
    displayName: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1/chat/completions',
    model: 'llama-3.3-70b',
    headers: () => ({
      'Authorization': `Bearer ${Deno.env.get('CEREBRAS_API_KEY')}`,
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('CEREBRAS_API_KEY'),
    priority: 2,
    maxTokens: 8192,
    costPerMToken: 0,
    weight: 20,
  },
  {
    name: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'google/gemini-2.0-flash-exp:free',
    headers: () => ({
      'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://cybershield.app',
      'X-Title': 'CyberShield',
    }),
    enabled: () => !!Deno.env.get('OPENROUTER_API_KEY'),
    priority: 3,
    maxTokens: 8192,
    costPerMToken: 0,
    weight: 15,
  },
  {
    name: 'google-gemini',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.5-flash',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('GOOGLE_GEMINI_API_KEY'),
    priority: 4,
    maxTokens: 8192,
    costPerMToken: 0.075,
    weight: 15,
  },
  {
    name: 'mistral',
    displayName: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-small-latest',
    headers: () => ({
      'Authorization': `Bearer ${Deno.env.get('MISTRAL_API_KEY')}`,
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('MISTRAL_API_KEY'),
    priority: 5,
    maxTokens: 8192,
    costPerMToken: 0,
    weight: 10,
  },
  {
    name: 'lovable',
    displayName: 'Platform AI',
    baseUrl: 'https://ai.gateway.lovable.dev/v1/chat/completions',
    model: 'google/gemini-3-flash-preview',
    headers: () => ({
      'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('LOVABLE_API_KEY'),
    priority: 6,
    maxTokens: 8192,
    costPerMToken: 0.10,
    weight: 0, // Emergency-only: never selected by round-robin, used only when all others fail
  },
];

// ============ CIRCUIT BREAKER PER PROVIDER ============

function isProviderAvailable(provider: AIProviderName): boolean {
  const circuit = providerCircuits[provider];
  if (!circuit.isOpen) return true;
  
  if (Date.now() - circuit.lastFailure > CIRCUIT_RESET_MS) {
    logger.info(`[multi-provider] ${provider} circuit entering half-open state`);
    return true;
  }
  
  return false;
}

function recordProviderSuccess(provider: AIProviderName): void {
  const circuit = providerCircuits[provider];
  if (circuit.isOpen) {
    logger.info(`[multi-provider] ${provider} circuit CLOSED after success`);
  }
  circuit.failures = 0;
  circuit.isOpen = false;
}

function recordProviderFailure(provider: AIProviderName, error: string): void {
  const circuit = providerCircuits[provider];
  circuit.failures++;
  circuit.lastFailure = Date.now();
  
  if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuit.isOpen = true;
    logger.warn(`[multi-provider] ${provider} circuit OPENED after ${circuit.failures} failures: ${error}`);
  } else {
    logger.warn(`[multi-provider] ${provider} failure ${circuit.failures}/${CIRCUIT_FAILURE_THRESHOLD}: ${error}`);
  }
}

// ============ PROVIDER-SPECIFIC API CALLS ============

async function callGoogleGemini(
  config: AIProviderConfig,
  messages: AIMessage[],
  maxTokens: number
): Promise<{ content: string; tokens?: { prompt?: number; completion?: number; total?: number } }> {
  const apiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  
  // Extract system instruction separately (Gemini native support)
  const systemMsg = messages.find(m => m.role === 'system');
  
  // Build contents array — only user and model roles, excluding system messages
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));
  
  // Build request body with proper system_instruction field
  const requestBody: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.7,
    },
  };
  
  // Use Gemini's native systemInstruction field to preserve context
  if (systemMsg) {
    requestBody.systemInstruction = {
      parts: [{ text: systemMsg.content }],
    };
  }
  
  const response = await fetch(
    `${config.baseUrl}/${config.model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: config.headers(),
      body: JSON.stringify(requestBody),
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  return {
    content,
    tokens: {
      prompt: data.usageMetadata?.promptTokenCount,
      completion: data.usageMetadata?.candidatesTokenCount,
      total: data.usageMetadata?.totalTokenCount,
    },
  };
}

async function callOpenAICompatible(
  config: AIProviderConfig,
  messages: AIMessage[],
  maxTokens: number
): Promise<{ content: string; tokens?: { prompt?: number; completion?: number; total?: number } }> {
  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers: config.headers(),
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${config.displayName} API error ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  
  return {
    content: data.choices?.[0]?.message?.content || '',
    tokens: extractTokenUsage(data),
  };
}

// ============ UNIFIED PROVIDER CALLER ============

async function callProvider(
  config: AIProviderConfig,
  messages: AIMessage[],
  maxTokens: number
): Promise<{ content: string; tokens?: { prompt?: number; completion?: number; total?: number } }> {
  if (config.name === 'google-gemini') {
    return callGoogleGemini(config, messages, maxTokens);
  }
  // Groq, Cerebras, OpenRouter, Mistral, and Lovable all use OpenAI-compatible API
  return callOpenAICompatible(config, messages, maxTokens);
}

// ============ SCORE-BASED PROVIDER SELECTION ============

function calculateProviderScore(provider: AIProviderConfig): number {
  const stats = providerStats[provider.name];
  const circuit = providerCircuits[provider.name];

  const defaultLatency = 1000;
  const avgLatency = stats.avgLatencyMs || defaultLatency;
  const failureRate = stats.requests > 0 ? stats.failures / stats.requests : 0;
  const circuitPenalty = circuit.isOpen ? 10000 : 0;
  const latencyPenalty = avgLatency > HIGH_LATENCY_THRESHOLD_MS ? HIGH_LATENCY_PENALTY : 0;
  
  const score = 
    avgLatency * SCORE_LATENCY_WEIGHT +
    provider.costPerMToken * 1000 * SCORE_COST_WEIGHT +
    failureRate * 1000 * SCORE_ERROR_WEIGHT +
    circuitPenalty +
    latencyPenalty;
  
  return Math.round(score);
}

function selectBestProviderByScore(): AIProviderConfig | null {
  const candidates = PROVIDERS
    .filter(p => p.enabled() && isProviderAvailable(p.name));

  if (candidates.length === 0) return null;

  const scored = candidates
    .map(p => ({ provider: p, score: calculateProviderScore(p) }))
    .sort((a, b) => a.score - b.score);

  logger.info('[AI Router] Provider scores:', scored.map(s => 
    `${s.provider.displayName}: ${s.score}`
  ).join(', '));

  return scored[0].provider;
}

// ============ WEIGHTED ROUND-ROBIN SELECTION ============

/**
 * Select provider using weighted round-robin.
 * Weights: Groq=30, Cerebras=20, OpenRouter=15, Gemini=15, Mistral=10, Lovable=10
 * Total=100, so over 100 requests we get the exact distribution.
 */
function selectByWeightedRoundRobin(): AIProviderConfig | null {
  const available = PROVIDERS
    .filter(p => p.enabled() && isProviderAvailable(p.name));
  
  if (available.length === 0) return null;
  if (available.length === 1) return available[0];
  
  const totalWeight = available.reduce((sum, p) => sum + p.weight, 0);
  const position = weightedCounter % totalWeight;
  weightedCounter++;
  
  let cumulative = 0;
  for (const provider of available) {
    cumulative += provider.weight;
    if (position < cumulative) {
      return provider;
    }
  }
  
  return available[0];
}

function recordStatsSuccess(provider: AIProviderName, latencyMs: number): void {
  const stats = providerStats[provider];
  stats.requests++;
  stats.lastUpdated = Date.now();
  stats.avgLatencyMs = stats.avgLatencyMs === 0 
    ? latencyMs 
    : Math.round(stats.avgLatencyMs * 0.8 + latencyMs * 0.2);
}

function recordStatsFailure(provider: AIProviderName): void {
  const stats = providerStats[provider];
  stats.requests++;
  stats.failures++;
  stats.lastUpdated = Date.now();
}

// ============ PROVIDER SELECTION ============

function getAvailableProviders(): AIProviderConfig[] {
  return PROVIDERS
    .filter(p => p.enabled() && isProviderAvailable(p.name))
    .sort((a, b) => a.priority - b.priority);
}

function selectNextProvider(): AIProviderConfig | null {
  if (useScoreBasedRouting) {
    const hasEnoughData = Object.values(providerStats).some(s => s.requests >= 5);
    if (hasEnoughData) {
      return selectBestProviderByScore();
    }
  }
  return selectByWeightedRoundRobin();
}

/**
 * Smart routing: selects provider based on task complexity + real metrics.
 * Falls back to score-based or round-robin if smart router unavailable.
 */
async function selectSmartProvider(
  functionName: string,
  messages: AIMessage[],
): Promise<AIProviderConfig | null> {
  const router = getSmartRouter();
  if (!router) return selectNextProvider();

  try {
    const available = getAvailableProviders().map((p) => p.name);
    if (available.length === 0) return null;

    const decision = await router.selectProvider(functionName, messages, available);
    const config = PROVIDERS.find((p) => p.name === decision.selectedProvider);

    if (config) {
      logger.info(
        `[AI SmartRouter] Selected ${config.displayName} for ${decision.complexity} task (score: ${decision.score}, reason: ${decision.reason})`,
      );
      return config;
    }
  } catch (err) {
    logger.warn('[AI SmartRouter] Fallback to legacy routing:', err);
  }

  return selectNextProvider();
}

// ============ METRICS PERSISTENCE ============

async function persistAIMetricsWithProvider(data: {
  function_name: string;
  model: string;
  provider: AIProviderName;
  latency_ms: number;
  success: boolean;
  tokens_total?: number;
  tokens_prompt?: number;
  tokens_completion?: number;
  tenant_id?: string;
  used_fallback: boolean;
  cost_usd?: number;
  error?: string;
}): Promise<void> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    await supabase.from('ai_inference_metrics').insert({
      function_name: data.function_name,
      model: data.model,
      provider: data.provider,
      latency_ms: data.latency_ms,
      success: data.success,
      tokens_total: data.tokens_total || null,
      tokens_prompt: data.tokens_prompt || null,
      tokens_completion: data.tokens_completion || null,
      tenant_id: data.tenant_id || null,
      used_fallback: data.used_fallback,
      cost_usd: data.cost_usd || 0,
      error: data.error || null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn('[AI Metrics] Failed to persist:', err);
  }
}

// ============ MAIN COMPLETION FUNCTION ============

export async function aiComplete(
  request: AICompletionRequest
): Promise<AICompletionResponse> {
  const startTime = Date.now();
  const { messages, maxTokens = 1024, functionName = 'unknown', tenantId } = request;
  
  const metrics = createMetricsLogger(functionName, 'multi-provider');
  metrics.logStart(tenantId);

  // ─── Semantic Cache Lookup ──────────────────────────
  let cacheUseCase: AICacheUseCase | null = null;
  let cacheResult: Awaited<ReturnType<AICacheUseCase['lookup']>> | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && serviceRoleKey) {
      const cacheClient = createClient(supabaseUrl, serviceRoleKey);
      const cacheAdapter = new SupabaseAICacheAdapter(cacheClient);
      cacheUseCase = new AICacheUseCase(cacheAdapter);

      cacheResult = await cacheUseCase.lookup(messages, functionName, tenantId);

      if (cacheResult.hit && cacheResult.cached) {
        const latencyMs = Date.now() - startTime;
        logger.info(`[AI Router] Cache HIT for ${functionName} (${latencyMs}ms)`);

        // Persist cache-hit metric
        persistAIMetricsWithProvider({
          function_name: functionName,
          model: cacheResult.cached.model,
          provider: cacheResult.cached.provider as AIProviderName,
          latency_ms: latencyMs,
          success: true,
          tokens_total: 0,
          tenant_id: tenantId,
          used_fallback: false,
          cost_usd: 0,
        });

        return {
          content: cacheResult.cached.responseContent,
          provider: cacheResult.cached.provider as AIProviderName,
          model: cacheResult.cached.model,
          tokensUsed: { total: 0 },
          latencyMs,
          usedFallback: false,
        };
      }
    }
  } catch (cacheErr) {
    logger.warn('[AI Router] Cache lookup failed, proceeding without cache:', cacheErr);
  }

  // ─── Smart Provider Routing ──────────────────────────
  let provider = await selectSmartProvider(functionName, messages);
  let usedFallback = false;
  let lastError: string | undefined;
  const attemptedProviders: Set<AIProviderName> = new Set();
  
  // Try providers in order of selection
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
      
      // Fire and forget metrics
      persistAIMetricsWithProvider({
        function_name: functionName,
        model: provider.model,
        provider: provider.name,
        latency_ms: latencyMs,
        success: true,
        tokens_total: tokensUsed,
        tokens_prompt: result.tokens?.prompt,
        tokens_completion: result.tokens?.completion,
        tenant_id: tenantId,
        used_fallback: usedFallback,
        cost_usd: costUsd,
      });

      // ─── Store in Cache (fire-and-forget) ──────────
      if (cacheUseCase && cacheResult && result.content) {
        cacheUseCase.store({
          promptHash: cacheResult.promptHash,
          taskCategory: cacheResult.taskCategory,
          ttlMinutes: cacheResult.ttlMinutes,
          responseContent: result.content,
          provider: provider.name,
          model: provider.model,
          tokensUsed,
          costUsd,
          tenantId,
          functionName,
          latencyMs,
        }).catch((err) => logger.warn('[AI Router] Cache store failed:', err));
      }
      
      return {
        content: result.content,
        provider: provider.name,
        model: provider.model,
        tokensUsed: result.tokens,
        latencyMs,
        usedFallback,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      recordProviderFailure(provider.name, lastError);
      recordStatsFailure(provider.name);
      logger.warn(`[AI Router] ${provider.displayName} failed: ${lastError}`);
      
      // Select next available provider not yet attempted
      const remaining = getAvailableProviders()
        .filter(p => !attemptedProviders.has(p.name))
        .sort((a, b) => calculateProviderScore(a) - calculateProviderScore(b));
      
      provider = remaining.length > 0 ? remaining[0] : null;
      if (provider) usedFallback = true;
    }
  }
  
  // All providers failed
  const finalLatencyMs = Date.now() - startTime;
  persistAIMetricsWithProvider({
    function_name: functionName,
    model: 'none',
    provider: 'lovable',
    latency_ms: finalLatencyMs,
    success: false,
    tenant_id: tenantId,
    used_fallback: true,
    error: lastError,
  });
  
  return {
    content: '',
    provider: 'lovable',
    model: 'none',
    latencyMs: finalLatencyMs,
    usedFallback: true,
    error: `All AI providers failed. Last error: ${lastError}`,
  };
}

// ============ HELPER FUNCTIONS ============

export function getProviderStatus(): Record<AIProviderName, { 
  enabled: boolean; 
  circuitOpen: boolean; 
  failures: number 
}> {
  const status: Record<string, { enabled: boolean; circuitOpen: boolean; failures: number }> = {};
  
  for (const provider of PROVIDERS) {
    const circuit = providerCircuits[provider.name];
    status[provider.name] = {
      enabled: provider.enabled(),
      circuitOpen: circuit.isOpen,
      failures: circuit.failures,
    };
  }
  
  return status as Record<AIProviderName, { enabled: boolean; circuitOpen: boolean; failures: number }>;
}

export function resetProviderCircuit(provider: AIProviderName): void {
  const circuit = providerCircuits[provider];
  if (!circuit) {
    logger.warn(`[multi-provider] Unknown provider: ${provider}`);
    return;
  }
  circuit.failures = 0;
  circuit.isOpen = false;
  circuit.lastFailure = 0;
  logger.info(`[multi-provider] ${provider} circuit manually reset`);
}

export function getActiveProviders(): AIProviderName[] {
  return getAvailableProviders().map(p => p.name);
}

export function getProviderScores(): Array<{
  provider: AIProviderName;
  displayName: string;
  score: number;
  avgLatencyMs: number;
  requests: number;
  failures: number;
  failureRate: number;
  circuitOpen: boolean;
  enabled: boolean;
  weight: number;
}> {
  return PROVIDERS.map(p => {
    const stats = providerStats[p.name];
    const circuit = providerCircuits[p.name];
    const failureRate = stats.requests > 0 ? stats.failures / stats.requests : 0;
    
    return {
      provider: p.name,
      displayName: p.displayName,
      score: calculateProviderScore(p),
      avgLatencyMs: stats.avgLatencyMs,
      requests: stats.requests,
      failures: stats.failures,
      failureRate: Math.round(failureRate * 100) / 100,
      circuitOpen: circuit.isOpen,
      enabled: p.enabled(),
      weight: p.weight,
    };
  }).sort((a, b) => a.score - b.score);
}

export function setScoreBasedRouting(enabled: boolean): void {
  useScoreBasedRouting = enabled;
  logger.info(`[AI Router] Score-based routing ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

// ============ CONVENIENCE WRAPPERS ============

export async function aiSimpleComplete(
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; functionName?: string; tenantId?: string }
): Promise<AICompletionResponse> {
  return aiComplete({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: options?.maxTokens,
    functionName: options?.functionName,
    tenantId: options?.tenantId,
  });
}

export async function aiJsonComplete<T>(
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; functionName?: string; tenantId?: string }
): Promise<{ data: T | null; response: AICompletionResponse }> {
  const response = await aiSimpleComplete(systemPrompt, userPrompt, options);
  
  if (response.error || !response.content) {
    return { data: null, response };
  }
  
  try {
    let jsonStr = response.content;
    
    const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      const objMatch = response.content.match(/\{[\s\S]*\}/);
      if (objMatch) {
        jsonStr = objMatch[0];
      }
    }
    
    const data = JSON.parse(jsonStr) as T;
    return { data, response };
  } catch (parseError) {
    logger.warn('[multi-provider] Failed to parse JSON response:', parseError);
    return {
      data: null,
      response: {
        ...response,
        error: `JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      },
    };
  }
}
