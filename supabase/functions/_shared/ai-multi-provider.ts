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

// ============ PROVIDER CONFIGURATION ============

export type AIProviderName = 
  | 'google-gemini' 
  | 'groq' 
  | 'openrouter' 
  | 'cloudflare' 
  | 'manaus-ia' 
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
  'manaus-ia': { failures: 0, lastFailure: 0, isOpen: false },
  'lovable': { failures: 0, lastFailure: 0, isOpen: false },
};

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 60000; // 1 minute

// Round-robin state (per-instance, resets on cold start)
let roundRobinIndex = 0;

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
    name: 'manaus-ia',
    displayName: 'Manaus IA',
    baseUrl: 'https://api.manaus.ia/v1/chat/completions',
    model: 'manaus-default',
    headers: () => ({
      'Authorization': `Bearer ${Deno.env.get('MANAUS_IA_API_KEY')}`,
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('MANAUS_IA_API_KEY'),
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

async function callManausIA(
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
    throw new Error(`Manaus IA error ${response.status}: ${errorText}`);
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
    case 'manaus-ia':
      return callManausIA(config, messages, maxTokens);
    case 'lovable':
      return callLovable(config, messages, maxTokens);
    default:
      throw new Error(`Unknown provider: ${config.name}`);
  }
}

// ============ ROUND-ROBIN PROVIDER SELECTION ============

function getAvailableProviders(): AIProviderConfig[] {
  return PROVIDERS
    .filter(p => p.enabled() && isProviderAvailable(p.name))
    .sort((a, b) => a.priority - b.priority);
}

function selectNextProvider(excludeFallback = true): AIProviderConfig | null {
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

export async function aiComplete(
  request: AICompletionRequest
): Promise<AICompletionResponse> {
  const startTime = Date.now();
  const { messages, maxTokens = 1024, functionName = 'unknown', tenantId } = request;
  
  const metrics = createMetricsLogger(functionName, 'multi-provider');
  const metricsStart = metrics.logStart(tenantId);
  
  // Get available providers (excluding fallback initially)
  let provider = selectNextProvider(true);
  let usedFallback = false;
  let lastError: string | undefined;
  
  // Try primary providers first
  while (provider) {
    try {
      console.log(`[multi-provider] Trying ${provider.displayName} (${provider.model})`);
      
      const result = await callProvider(provider, messages, Math.min(maxTokens, provider.maxTokens));
      
      recordProviderSuccess(provider.name);
      metrics.logSuccess(metricsStart, tenantId, result.tokens);
      
      return {
        content: result.content,
        provider: provider.name,
        model: provider.model,
        tokensUsed: result.tokens,
        latencyMs: Date.now() - startTime,
        usedFallback,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      recordProviderFailure(provider.name, lastError);
      console.warn(`[multi-provider] ${provider.displayName} failed: ${lastError}`);
      
      // Try next available provider
      provider = selectNextProvider(true);
    }
  }
  
  // All primary providers failed, try Lovable as fallback
  console.log('[multi-provider] All primary providers failed, trying Lovable AI fallback');
  const lovableConfig = PROVIDERS.find(p => p.name === 'lovable');
  
  if (lovableConfig && lovableConfig.enabled() && isProviderAvailable('lovable')) {
    try {
      usedFallback = true;
      const result = await callProvider(lovableConfig, messages, Math.min(maxTokens, lovableConfig.maxTokens));
      
      recordProviderSuccess('lovable');
      metrics.logSuccess(metricsStart, tenantId, result.tokens);
      
      return {
        content: result.content,
        provider: 'lovable',
        model: lovableConfig.model,
        tokensUsed: result.tokens,
        latencyMs: Date.now() - startTime,
        usedFallback: true,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      recordProviderFailure('lovable', lastError);
    }
  }
  
  // All providers failed
  metrics.logFailure(metricsStart, lastError || 'All providers failed', tenantId, true);
  
  return {
    content: '',
    provider: 'lovable',
    model: 'none',
    latencyMs: Date.now() - startTime,
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
