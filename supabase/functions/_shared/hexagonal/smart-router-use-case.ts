/**
 * Hexagonal Use Case: Smart AI Router
 * 
 * Task-aware, latency-aware provider selection.
 * Pure domain logic ? only depends on SmartRouterPort.
 */

import type { SmartRouterPort, ProviderCapability, RoutingDecision } from './smart-router-port.ts';
import { TaskComplexity } from './smart-router-port.ts';
import type { AIProviderName } from '../ai-multi-provider.ts';
import { logger } from '../logger.ts';

// ??? Task Classification (Pure) ????????????????????????

export function classifyTaskComplexity(functionName: string, messageLength: number): TaskComplexity {
  const name = functionName.toLowerCase();

  // Complex tasks: RCA, correlation, prediction, behavioral analysis
  if (
    name.includes('correlat') ||
    name.includes('rca') ||
    name.includes('root-cause') ||
    name.includes('predict') ||
    name.includes('behavioral') ||
    name.includes('executive') ||
    messageLength > 8000
  ) {
    return TaskComplexity.COMPLEX;
  }

  // Moderate: analysis, anomaly detection, reports
  if (
    name.includes('analy') ||
    name.includes('anomal') ||
    name.includes('report') ||
    name.includes('summary') ||
    name.includes('system') ||
    messageLength > 3000
  ) {
    return TaskComplexity.MODERATE;
  }

  // Simple: classification, status, quality checks
  return TaskComplexity.SIMPLE;
}

// ??? Scoring Weights ???????????????????????????????????
const WEIGHT_LATENCY = 0.40;
const WEIGHT_FAILURE = 0.35;
const WEIGHT_COST = 0.15;
const WEIGHT_CONTEXT = 0.10;

// ??? Use Case ??????????????????????????????????????????

export class SmartRouterUseCase {
  private cachedCapabilities: ProviderCapability[] | null = null;
  private cacheTimestamp = 0;
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly router: SmartRouterPort) {}

  async selectProvider(
    functionName: string,
    messages: Array<{ content: string }>,
    availableProviders: AIProviderName[],
  ): Promise<RoutingDecision> {
    const messageLength = messages.reduce((sum, m) => sum + m.content.length, 0);
    const complexity = classifyTaskComplexity(functionName, messageLength);

    // Fetch capabilities (with in-memory cache)
    const capabilities = await this.getCapabilities();

    // Filter to available + complexity-capable providers
    const candidates = capabilities.filter(
      (c) =>
        availableProviders.includes(c.provider) &&
        c.supportedTiers.includes(complexity),
    );

    if (candidates.length === 0) {
      // Fallback: use any available provider
      const fallback = availableProviders[0] || 'groq';
      return {
        selectedProvider: fallback,
        reason: `No provider supports ${complexity}; fallback to ${fallback}`,
        complexity,
        score: 999,
        alternatives: [],
      };
    }

    // Score each candidate
    const scored = candidates.map((c) => ({
      provider: c.provider,
      score: this.scoreProvider(c, complexity),
    }));

    scored.sort((a, b) => a.score - b.score);

    const decision: RoutingDecision = {
      selectedProvider: scored[0].provider,
      reason: `Best for ${complexity} (score: ${scored[0].score})`,
      complexity,
      score: scored[0].score,
      alternatives: scored.slice(1, 4),
    };

    // Log decision (fire-and-forget)
    this.router.logRoutingDecision(decision, functionName).catch((e) => logger.warn('[SmartRouter] Log failed:', e));

    return decision;
  }

  private scoreProvider(cap: ProviderCapability, complexity: TaskComplexity): number {
    // Normalize latency (lower is better, 0-1000ms range)
    const latencyScore = Math.min(cap.avgLatencyMs / 5000, 1);

    // Failure rate (0-1, lower is better)
    const failureScore = cap.failureRate;

    // Cost (0-1, lower is better)
    const costScore = Math.min(cap.costPerMToken / 1, 1);

    // Context capacity bonus for complex tasks
    let contextScore = 0;
    if (complexity === TaskComplexity.COMPLEX) {
      contextScore = cap.maxContextTokens >= 32000 ? 0 : 0.5;
    }

    const total =
      latencyScore * WEIGHT_LATENCY +
      failureScore * WEIGHT_FAILURE +
      costScore * WEIGHT_COST +
      contextScore * WEIGHT_CONTEXT;

    return Math.round(total * 1000);
  }

  private async getCapabilities(): Promise<ProviderCapability[]> {
    if (this.cachedCapabilities && Date.now() - this.cacheTimestamp < this.cacheTtlMs) {
      return this.cachedCapabilities;
    }

    try {
      this.cachedCapabilities = await this.router.fetchProviderMetrics();
      this.cacheTimestamp = Date.now();
    } catch {
      if (!this.cachedCapabilities) {
        this.cachedCapabilities = [];
      }
    }

    return this.cachedCapabilities;
  }
}
