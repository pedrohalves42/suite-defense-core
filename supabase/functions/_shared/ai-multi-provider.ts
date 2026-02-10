/**
 * AI Multi-Provider System v1.0
 * 
 * Implements round-robin load balancing across multiple AI providers:
 * - Google Gemini (direct API)
 * - Groq
 * - OpenRouter
 * - Cloudflare Workers AI
 * - Manaus IA
 * - Lovable AI (fallback)
 * 
 * Features:
 * - Automatic failover on provider errors
 * - Round-robin distribution for cost optimization
 * - Per-provider circuit breakers
 * - Unified response format
 * - Detailed metrics logging
 */

import { withCircuitBreaker, getCircuitState } from './ai-circuit-breaker.ts';
import { createMetricsLogger, extractTokenUsage } from './ai-metrics.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

// ============ PROVIDER CONFIGURATION ============

export type AIProviderName = 
  | 'google-gemini' 
  | 'groq' 
  | 'openrouter' 
  | 'cloudflare' 
  | 'manus' 
  | 'lovable';

export interface AIProviderConfig {
  name: AIProviderName;
  displayName: string;
  baseUrl: string;
  model: string;
  headers: () => Record<string, string>;
  enabled: () => boolean;
  priority: number; // Lower = higher priority in round-robin
  maxTokens: number;
  costPerMToken: number; // Cost per million tokens (USD)
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  functionName?: string; // For metrics
  tenantId?: string; // For metrics
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
  'cloudflare': { failures: 0, lastFailure: 0, isOpen: false },
  'manus': { failures: 0, lastFailure: 0, isOpen: false },
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
  'cloudflare': { avgLatencyMs: 0, requests: 0, failures: 0, lastUpdated: 0 },
  'manus': { avgLatencyMs: 0, requests: 0, failures: 0, lastUpdated: 0 },
  'lovable': { avgLatencyMs: 0, requests: 0, failures: 0, lastUpdated: 0 },
};

// Score weights for intelligent provider selection
const SCORE_LATENCY_WEIGHT = 0.5;
const SCORE_COST_WEIGHT = 0.3;
const SCORE_ERROR_WEIGHT = 0.2;
// High-latency penalty: providers exceeding this threshold get an additional penalty
const HIGH_LATENCY_THRESHOLD_MS = 10000;
const HIGH_LATENCY_PENALTY = 5000;

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 60000; // 1 minute

// Round-robin state (per-instance, resets on cold start)
let roundRobinIndex = 0;
// Flag to enable/disable score-based routing
let useScoreBasedRouting = true;

// ============ PROVIDER DEFINITIONS ============

const PROVIDERS: AIProviderConfig[] = [
  {
    name: 'google-gemini',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.0-flash',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('GOOGLE_GEMINI_API_KEY'),
    priority: 1,
    maxTokens: 8192,
    costPerMToken: 0.075, // Free tier available
  },
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
    priority: 2,
    maxTokens: 8000,
    costPerMToken: 0, // Free tier
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
    costPerMToken: 0, // Free models available
  },
  {
    name: 'cloudflare',
    displayName: 'Cloudflare Workers AI',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/meta/llama-3.1-8b-instruct',
    model: '@cf/meta/llama-3.1-8b-instruct',
    headers: () => ({
      'Authorization': `Bearer ${Deno.env.get('CLOUDFLARE_AI_API_TOKEN')}`,
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('CLOUDFLARE_AI_API_TOKEN') && !!Deno.env.get('CLOUDFLARE_AI_ACCOUNT_ID'),
    priority: 4,
    maxTokens: 4096,
    costPerMToken: 0, // Free tier: 10K inferences/day
  },
  {
    name: 'manus',
    displayName: 'Manus',
    baseUrl: 'https://manus.im/api/v1/chat/completions',
    model: 'manus-1',
    headers: () => ({
      'Authorization': `Bearer ${Deno.env.get('MANUS_API_KEY')}`,
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('MANUS_API_KEY'),
    priority: 5,
    maxTokens: 4096,
    costPerMToken: 0.1,
  },
  {
    name: 'lovable',
    displayName: 'Lovable AI (Gateway)',
    baseUrl: 'https://ai.gateway.lovable.dev/v1/chat/completions',
    model: 'google/gemini-2.5-flash',
    headers: () => ({
      'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('LOVABLE_API_KEY'),
    priority: 99, // Fallback only
    maxTokens: 8192,
    costPerMToken: 0.15,
  },
];

// ============ CIRCUIT BREAKER PER PROVIDER ============

function isProviderAvailable(provider: AIProviderName): boolean {
  const circuit = providerCircuits[provider];
  if (!circuit.isOpen) return true;
  
  // Check if reset period has passed (half-open state)
  if (Date.now() - circuit.lastFailure > CIRCUIT_RESET_MS) {
    console.log(`[multi-provider] ${provider} circuit entering half-open state`);
    return true;
  }
  
  return false;
}

function recordProviderSuccess(provider: AIProviderName): void {
  const circuit = providerCircuits[provider];
  if (circuit.isOpen) {
    console.log(`[multi-provider] ${provider} circuit CLOSED after success`);
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
    console.warn(`[multi-provider] ${provider} circuit OPENED after ${circuit.failures} failures: ${error}`);
  } else {
    console.warn(`[multi-provider] ${provider} failure ${circuit.failures}/${CIRCUIT_FAILURE_THRESHOLD}: ${error}`);
  }
}

// ============ PROVIDER-SPECIFIC API CALLS ============

async function callGoogleGemini(
  config: AIProviderConfig,
  messages: AIMessage[],
  maxTokens: number
): Promise<{ content: string; tokens?: { prompt?: number; completion?: number; total?: number } }> {
  const apiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  
  // Convert messages to Gemini format
  const geminiMessages = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : msg.role === 'system' ? 'user' : 'user',
    parts: [{ text: msg.content }],
  }));
  
  // Combine system message with first user message if present
  const systemMsg = messages.find(m => m.role === 'system');
  if (systemMsg) {
    geminiMessages[0] = {
      role: 'user',
      parts: [{ text: `${systemMsg.content}\n\n${messages.find(m => m.role === 'user')?.content || ''}` }],
    };
  }
  
  const response = await fetch(
    `${config.baseUrl}/${config.model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: config.headers(),
      body: JSON.stringify({
        contents: geminiMessages.filter(m => m.role !== 'system'),
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.7,
        },
      }),
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

async function callGroq(
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
    throw new Error(`Groq API error ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  
  return {
    content: data.choices?.[0]?.message?.content || '',
    tokens: extractTokenUsage(data),
  };
}

async function callOpenRouter(
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
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  
  return {
    content: data.choices?.[0]?.message?.content || '',
    tokens: extractTokenUsage(data),
  };
}

async function callCloudflare(
  config: AIProviderConfig,
  messages: AIMessage[],
  maxTokens: number
): Promise<{ content: string; tokens?: { prompt?: number; completion?: number; total?: number } }> {
  const accountId = Deno.env.get('CLOUDFLARE_AI_ACCOUNT_ID');
  const url = config.baseUrl.replace('{account_id}', accountId || '');
  
  // Cloudflare format
  const prompt = messages.map(m => 
    m.role === 'system' ? `System: ${m.content}` :
    m.role === 'user' ? `User: ${m.content}` :
    `Assistant: ${m.content}`
  ).join('\n\n');
  
  const response = await fetch(url, {
    method: 'POST',
    headers: config.headers(),
    body: JSON.stringify({
      prompt,
      max_tokens: maxTokens,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cloudflare AI error ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  
  return {
    content: data.result?.response || '',
    tokens: undefined, // Cloudflare doesn't return token counts
  };
}

async function callManus(
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
    throw new Error(`Manus error ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  
  return {
    content: data.choices?.[0]?.message?.content || '',
    tokens: extractTokenUsage(data),
  };
}

async function callLovable(
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
    throw new Error(`Lovable AI error ${response.status}: ${errorText}`);
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
  switch (config.name) {
    case 'google-gemini':
      return callGoogleGemini(config, messages, maxTokens);
    case 'groq':
      return callGroq(config, messages, maxTokens);
    case 'openrouter':
      return callOpenRouter(config, messages, maxTokens);
    case 'cloudflare':
      return callCloudflare(config, messages, maxTokens);
    case 'manus':
      return callManus(config, messages, maxTokens);
    case 'lovable':
      return callLovable(config, messages, maxTokens);
    default:
      throw new Error(`Unknown provider: ${config.name}`);
  }
}

// ============ SCORE-BASED PROVIDER SELECTION ============

/**
 * Calculate provider score (lower = better)
 * Score = (latency * 0.5) + (cost * 0.3) + (error_rate * 0.2) + circuit_penalty
 */
function calculateProviderScore(provider: AIProviderConfig): number {
  const stats = providerStats[provider.name];
  const circuit = providerCircuits[provider.name];

  // Average latency (ms) - use default if no data
  // Cloudflare penalized with higher default due to observed P95 ~43s
  const defaultLatency = provider.name === 'cloudflare' ? 15000 : 1000;
  const avgLatency = stats.avgLatencyMs || defaultLatency;
  
  // Failure rate (0-1)
  const failureRate = stats.requests > 0 ? stats.failures / stats.requests : 0;
  
  // Circuit breaker penalty
  const circuitPenalty = circuit.isOpen ? 10000 : 0;
  
  // High-latency penalty for slow providers (e.g., Cloudflare at ~15s avg)
  const latencyPenalty = avgLatency > HIGH_LATENCY_THRESHOLD_MS ? HIGH_LATENCY_PENALTY : 0;
  
  // Calculate final score (lower = better)
  const score = 
    avgLatency * SCORE_LATENCY_WEIGHT +
    provider.costPerMToken * 1000 * SCORE_COST_WEIGHT +
    failureRate * 1000 * SCORE_ERROR_WEIGHT +
    circuitPenalty +
    latencyPenalty;
  
  return Math.round(score);
}

/**
 * Select best provider based on score
 */
function selectBestProviderByScore(excludeFallback = true): AIProviderConfig | null {
  let candidates = PROVIDERS
    .filter(p => p.enabled() && isProviderAvailable(p.name));
  
  if (excludeFallback) {
    candidates = candidates.filter(p => p.name !== 'lovable');
  }

  if (candidates.length === 0) return null;

  // Sort by score (lower = better)
  const scored = candidates
    .map(p => ({ provider: p, score: calculateProviderScore(p) }))
    .sort((a, b) => a.score - b.score);

  console.log('[AI Router] Provider scores:', scored.map(s => 
    `${s.provider.displayName}: ${s.score}`
  ).join(', '));

  return scored[0].provider;
}

/**
 * Record successful call stats for score calculation
 */
function recordStatsSuccess(provider: AIProviderName, latencyMs: number): void {
  const stats = providerStats[provider];
  stats.requests++;
  stats.lastUpdated = Date.now();
  
  // Exponential moving average (80% history + 20% new)
  stats.avgLatencyMs = stats.avgLatencyMs === 0 
    ? latencyMs 
    : Math.round(stats.avgLatencyMs * 0.8 + latencyMs * 0.2);
}

/**
 * Record failed call stats for score calculation
 */
function recordStatsFailure(provider: AIProviderName): void {
  const stats = providerStats[provider];
  stats.requests++;
  stats.failures++;
  stats.lastUpdated = Date.now();
}

// ============ ROUND-ROBIN PROVIDER SELECTION ============

function getAvailableProviders(): AIProviderConfig[] {
  return PROVIDERS
    .filter(p => p.enabled() && isProviderAvailable(p.name))
    .sort((a, b) => a.priority - b.priority);
}

function selectNextProvider(excludeFallback = true): AIProviderConfig | null {
  // Use score-based routing if enabled
  if (useScoreBasedRouting) {
    return selectBestProviderByScore(excludeFallback);
  }
  
  // Fallback to round-robin
  let providers = getAvailableProviders();
  
  if (excludeFallback) {
    providers = providers.filter(p => p.name !== 'lovable');
  }
  
  if (providers.length === 0) return null;
  
  // Round-robin selection
  const selected = providers[roundRobinIndex % providers.length];
  roundRobinIndex++;
  
  return selected;
}

// ============ MAIN COMPLETION FUNCTION ============

/**
 * Persist metrics with provider and cost info
 */
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
    console.warn('[AI Metrics] Failed to persist:', err);
  }
}

export async function aiComplete(
  request: AICompletionRequest
): Promise<AICompletionResponse> {
  const startTime = Date.now();
  const { messages, maxTokens = 1024, functionName = 'unknown', tenantId } = request;
  
  const metrics = createMetricsLogger(functionName, 'multi-provider');
  const metricsStart = metrics.logStart(tenantId);
  
  // Use score-based provider selection
  let provider = selectNextProvider(true);
  let usedFallback = false;
  let lastError: string | undefined;
  const attemptedProviders: Set<AIProviderName> = new Set();
  
  // Try primary providers based on score
  while (provider && attemptedProviders.size < PROVIDERS.length - 1) {
    attemptedProviders.add(provider.name);
    
    try {
      const score = calculateProviderScore(provider);
      console.log(`[AI Router] Trying ${provider.displayName} (score: ${score})`);
      
      const result = await callProvider(provider, messages, Math.min(maxTokens, provider.maxTokens));
      const latencyMs = Date.now() - startTime;
      
      // Record success stats for score calculation
      recordProviderSuccess(provider.name);
      recordStatsSuccess(provider.name, latencyMs);
      
      // Calculate cost
      const tokensUsed = result.tokens?.total || 0;
      const costUsd = (tokensUsed / 1_000_000) * provider.costPerMToken;
      
      // Persist metrics with provider info
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
      console.warn(`[AI Router] ${provider.displayName} failed: ${lastError}`);
      
      // Get next best provider, excluding already attempted ones
      const remaining = getAvailableProviders()
        .filter(p => !attemptedProviders.has(p.name) && p.name !== 'lovable')
        .sort((a, b) => calculateProviderScore(a) - calculateProviderScore(b));
      
      provider = remaining.length > 0 ? remaining[0] : null;
    }
  }
  
  // All primary providers failed, try Lovable as fallback
  console.log('[AI Router] All primary providers failed, trying Lovable AI fallback');
  const lovableConfig = PROVIDERS.find(p => p.name === 'lovable');
  
  if (lovableConfig && lovableConfig.enabled() && isProviderAvailable('lovable')) {
    try {
      usedFallback = true;
      const result = await callProvider(lovableConfig, messages, Math.min(maxTokens, lovableConfig.maxTokens));
      const latencyMs = Date.now() - startTime;
      
      recordProviderSuccess('lovable');
      recordStatsSuccess('lovable', latencyMs);
      
      // Calculate cost
      const tokensUsed = result.tokens?.total || 0;
      const costUsd = (tokensUsed / 1_000_000) * lovableConfig.costPerMToken;
      
      // Persist metrics
      persistAIMetricsWithProvider({
        function_name: functionName,
        model: lovableConfig.model,
        provider: 'lovable',
        latency_ms: latencyMs,
        success: true,
        tokens_total: tokensUsed,
        tokens_prompt: result.tokens?.prompt,
        tokens_completion: result.tokens?.completion,
        tenant_id: tenantId,
        used_fallback: true,
        cost_usd: costUsd,
      });
      
      return {
        content: result.content,
        provider: 'lovable',
        model: lovableConfig.model,
        tokensUsed: result.tokens,
        latencyMs,
        usedFallback: true,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      recordProviderFailure('lovable', lastError);
      recordStatsFailure('lovable');
    }
  }
  
  // All providers failed - persist failure metrics
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
  circuit.failures = 0;
  circuit.isOpen = false;
  circuit.lastFailure = 0;
  console.log(`[multi-provider] ${provider} circuit manually reset`);
}

export function getActiveProviders(): AIProviderName[] {
  return getAvailableProviders().map(p => p.name);
}

/**
 * Get current provider scores for dashboard/monitoring
 */
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
    };
  }).sort((a, b) => a.score - b.score);
}

/**
 * Toggle score-based vs round-robin routing
 */
export function setScoreBasedRouting(enabled: boolean): void {
  useScoreBasedRouting = enabled;
  console.log(`[AI Router] Score-based routing ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

// ============ CONVENIENCE WRAPPERS ============

/**
 * Simple text completion with round-robin provider selection
 */
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

/**
 * JSON completion with automatic parsing
 */
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
    // Try to extract JSON from the response
    let jsonStr = response.content;
    
    // Handle markdown code blocks
    const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    const data = JSON.parse(jsonStr) as T;
    return { data, response };
  } catch (parseError) {
    console.warn('[multi-provider] Failed to parse JSON response:', parseError);
    return {
      data: null,
      response: {
        ...response,
        error: `JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      },
    };
  }
}
