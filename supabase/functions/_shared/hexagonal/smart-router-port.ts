/**
 * Hexagonal Port: AI Smart Router
 * 
 * Defines the contract for task-aware, latency-aware provider selection.
 * Replaces pure weighted round-robin with intelligent routing.
 */

import type { AIProviderName } from '../ai-multi-provider.ts';

// ??? Task Complexity Tiers ?????????????????????????????
export enum TaskComplexity {
  /** Classification, status checks, simple summaries */
  SIMPLE = 'simple',
  /** Anomaly analysis, metric correlation */
  MODERATE = 'moderate',
  /** RCA, multi-signal correlation, predictions */
  COMPLEX = 'complex',
}

// ??? Provider Capability Profile ???????????????????????
export interface ProviderCapability {
  provider: AIProviderName;
  /** Supported complexity tiers (e.g., Cerebras=simple, Gemini=complex) */
  supportedTiers: TaskComplexity[];
  /** Average latency from recent metrics */
  avgLatencyMs: number;
  /** Recent failure rate (0-1) */
  failureRate: number;
  /** Cost per million tokens */
  costPerMToken: number;
  /** Max context window tokens */
  maxContextTokens: number;
}

// ??? Routing Decision ??????????????????????????????????
export interface RoutingDecision {
  selectedProvider: AIProviderName;
  reason: string;
  complexity: TaskComplexity;
  score: number;
  alternatives: Array<{ provider: AIProviderName; score: number }>;
}

// ??? Output Port ???????????????????????????????????????
export interface SmartRouterPort {
  /**
   * Fetch recent provider performance metrics from DB.
   */
  fetchProviderMetrics(): Promise<ProviderCapability[]>;

  /**
   * Log routing decision for analytics.
   */
  logRoutingDecision(decision: RoutingDecision, functionName: string): Promise<void>;
}
