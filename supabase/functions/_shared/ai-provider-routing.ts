/**
 * AI Provider Circuit Breaker & Routing
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { SupabaseSmartRouterAdapter } from './hexagonal/smart-router-adapter.ts';
import { SmartRouterUseCase } from './hexagonal/smart-router-use-case.ts';
import { logger } from './logger.ts';
import type { AIProviderName, AIProviderConfig, AIMessage, ProviderStats, CircuitState } from './ai-multi-provider-types.ts';
import { PROVIDERS } from './ai-provider-configs.ts';

// Circuit breaker states
export const providerCircuits: Record<AIProviderName, CircuitState> = {
  'google-gemini': { failures: 0, lastFailure: 0, isOpen: false },
  'groq': { failures: 0, lastFailure: 0, isOpen: false },
  'openrouter': { failures: 0, lastFailure: 0, isOpen: false },
  'cerebras': { failures: 0, lastFailure: 0, isOpen: false },
  'mistral': { failures: 0, lastFailure: 0, isOpen: false },
  'lovable': { failures: 0, lastFailure: 0, isOpen: false },
};

export const providerStats: Record<AIProviderName, ProviderStats> = {
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

let weightedCounter = 0;
let useScoreBasedRouting = true;

// Smart router singleton
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

export function isProviderAvailable(provider: AIProviderName): boolean {
  const circuit = providerCircuits[provider];
  if (!circuit.isOpen) return true;
  if (Date.now() - circuit.lastFailure > CIRCUIT_RESET_MS) {
    logger.info(`[multi-provider] ${provider} circuit entering half-open state`);
    return true;
  }
  return false;
}

export function recordProviderSuccess(provider: AIProviderName): void {
  const circuit = providerCircuits[provider];
  if (circuit.isOpen) logger.info(`[multi-provider] ${provider} circuit CLOSED after success`);
  circuit.failures = 0;
  circuit.isOpen = false;
}

export function recordProviderFailure(provider: AIProviderName, error: string): void {
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

export function calculateProviderScore(provider: AIProviderConfig): number {
  const stats = providerStats[provider.name];
  const circuit = providerCircuits[provider.name];
  const defaultLatency = 1000;
  const avgLatency = stats.avgLatencyMs || defaultLatency;
  const failureRate = stats.requests > 0 ? stats.failures / stats.requests : 0;
  const circuitPenalty = circuit.isOpen ? 10000 : 0;
  const latencyPenalty = avgLatency > HIGH_LATENCY_THRESHOLD_MS ? HIGH_LATENCY_PENALTY : 0;
  return Math.round(
    avgLatency * SCORE_LATENCY_WEIGHT +
    provider.costPerMToken * 1000 * SCORE_COST_WEIGHT +
    failureRate * 1000 * SCORE_ERROR_WEIGHT +
    circuitPenalty + latencyPenalty
  );
}

function selectBestProviderByScore(): AIProviderConfig | null {
  const candidates = PROVIDERS.filter(p => p.enabled() && isProviderAvailable(p.name));
  if (candidates.length === 0) return null;
  const scored = candidates.map(p => ({ provider: p, score: calculateProviderScore(p) })).sort((a, b) => a.score - b.score);
  logger.info('[AI Router] Provider scores:', scored.map(s => `${s.provider.displayName}: ${s.score}`).join(', '));
  return scored[0].provider;
}

function selectByWeightedRoundRobin(): AIProviderConfig | null {
  const available = PROVIDERS.filter(p => p.enabled() && isProviderAvailable(p.name));
  if (available.length === 0) return null;
  if (available.length === 1) return available[0];
  const totalWeight = available.reduce((sum, p) => sum + p.weight, 0);
  const position = weightedCounter % totalWeight;
  weightedCounter++;
  let cumulative = 0;
  for (const provider of available) {
    cumulative += provider.weight;
    if (position < cumulative) return provider;
  }
  return available[0];
}

export function recordStatsSuccess(provider: AIProviderName, latencyMs: number): void {
  const stats = providerStats[provider];
  stats.requests++;
  stats.lastUpdated = Date.now();
  stats.avgLatencyMs = stats.avgLatencyMs === 0 ? latencyMs : Math.round(stats.avgLatencyMs * 0.8 + latencyMs * 0.2);
}

export function recordStatsFailure(provider: AIProviderName): void {
  const stats = providerStats[provider];
  stats.requests++;
  stats.failures++;
  stats.lastUpdated = Date.now();
}

export function getAvailableProviders(): AIProviderConfig[] {
  return PROVIDERS.filter(p => p.enabled() && isProviderAvailable(p.name)).sort((a, b) => a.priority - b.priority);
}

function selectNextProvider(): AIProviderConfig | null {
  if (useScoreBasedRouting) {
    const hasEnoughData = Object.values(providerStats).some(s => s.requests >= 5);
    if (hasEnoughData) return selectBestProviderByScore();
  }
  return selectByWeightedRoundRobin();
}

export async function selectSmartProvider(functionName: string, messages: AIMessage[]): Promise<AIProviderConfig | null> {
  const router = getSmartRouter();
  if (!router) return selectNextProvider();
  try {
    const available = getAvailableProviders().map(p => p.name);
    if (available.length === 0) return null;
    const decision = await router.selectProvider(functionName, messages, available);
    const config = PROVIDERS.find(p => p.name === decision.selectedProvider);
    if (config) {
      logger.info(`[AI SmartRouter] Selected ${config.displayName} for ${decision.complexity} task (score: ${decision.score}, reason: ${decision.reason})`);
      return config;
    }
  } catch (err) { logger.warn('[AI SmartRouter] Fallback to legacy routing:', err); }
  return selectNextProvider();
}

export function setScoreBasedRouting(enabled: boolean): void {
  useScoreBasedRouting = enabled;
  logger.info(`[AI Router] Score-based routing ${enabled ? 'ENABLED' : 'DISABLED'}`);
}
