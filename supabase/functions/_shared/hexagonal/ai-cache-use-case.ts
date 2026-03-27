/**
 * Hexagonal Use Case: AI Semantic Cache
 * 
 * Pure domain logic for cache key generation and TTL decisions.
 * No infrastructure dependencies — only uses the AICachePort.
 */

import type { AICachePort, CachedAIResponse } from './ai-cache-port.ts';
import { logger } from '../logger.ts';

// ─── Task Categories with TTL Configuration ────────────
export enum AITaskCategory {
  /** Simple status checks, classifications */
  SIMPLE = 'simple',
  /** Anomaly detection, metric analysis */
  ANALYSIS = 'analysis',
  /** Root cause analysis, correlation */
  COMPLEX = 'complex',
  /** Predictive failure, behavioral */
  PREDICTION = 'prediction',
  /** Report generation */
  REPORT = 'report',
  /** General/uncategorized */
  GENERAL = 'general',
}

const CATEGORY_TTL_MINUTES: Record<AITaskCategory, number> = {
  [AITaskCategory.SIMPLE]: 60,        // 1 hour
  [AITaskCategory.ANALYSIS]: 360,     // 6 hours
  [AITaskCategory.COMPLEX]: 180,      // 3 hours
  [AITaskCategory.PREDICTION]: 30,    // 30 min (predictions expire fast)
  [AITaskCategory.REPORT]: 720,       // 12 hours
  [AITaskCategory.GENERAL]: 120,      // 2 hours
};

// ─── Cache Key Normalization (Pure) ────────────────────

/**
 * Normalize prompt content for stable cache keys.
 * Rounds numbers to nearest bucket (5% for percentages, 10 for counts)
 * and removes volatile timestamps so that similar analyses get cache hits.
 */
export function normalizeCacheContent(content: string): string {
  return content
    // Round percentages to nearest 5 (e.g., 47.3% → 45%)
    .replace(/(\d+\.?\d*)\s*%/g, (_match, num) => {
      const rounded = Math.round(parseFloat(num) / 5) * 5;
      return `${rounded}%`;
    })
    // Round standalone decimals with units (e.g., "48.0" → "50")
    .replace(/\b(\d+)\.\d+\b/g, (_match, intPart) => {
      const n = parseInt(intPart, 10);
      return String(Math.round(n / 5) * 5);
    })
    // Bucket counts: round to nearest 10 for small, 100 for large
    .replace(/\b(\d{2,})\b/g, (_match, num) => {
      const n = parseInt(num, 10);
      if (n < 100) return String(Math.round(n / 10) * 10);
      if (n < 1000) return String(Math.round(n / 50) * 50);
      return String(Math.round(n / 100) * 100);
    })
    // Remove ISO timestamps
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, '[TIMESTAMP]')
    // Remove UUIDs (agent IDs change position but not meaning)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[UUID]');
}

// ─── Hash Generation (Pure) ────────────────────────────

/**
 * Generate a deterministic SHA-256 hash for cache key.
 * Uses crypto.subtle for Deno compatibility.
 */
export async function generatePromptHash(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Classify a function name into a task category for TTL selection.
 */
export function classifyTask(functionName: string): AITaskCategory {
  const name = functionName.toLowerCase();

  if (name.includes('predict') || name.includes('failure')) {
    return AITaskCategory.PREDICTION;
  }
  if (name.includes('correlat') || name.includes('rca') || name.includes('root-cause')) {
    return AITaskCategory.COMPLEX;
  }
  if (name.includes('anomal') || name.includes('analyz') || name.includes('analysis')) {
    return AITaskCategory.ANALYSIS;
  }
  if (name.includes('report') || name.includes('executive') || name.includes('summary')) {
    return AITaskCategory.REPORT;
  }
  if (name.includes('classify') || name.includes('check') || name.includes('status')) {
    return AITaskCategory.SIMPLE;
  }

  return AITaskCategory.GENERAL;
}

// ─── Use Case ──────────────────────────────────────────

export interface CacheLookupResult {
  hit: boolean;
  cached?: CachedAIResponse;
  promptHash: string;
  taskCategory: AITaskCategory;
  ttlMinutes: number;
}

export class AICacheUseCase {
  constructor(private readonly cache: AICachePort) {}

  /**
   * Try to retrieve a cached response.
   * Returns the hash and category for later storage if miss.
   */
  async lookup(
    messages: Array<{ role: string; content: string }>,
    functionName: string,
    tenantId?: string,
  ): Promise<CacheLookupResult> {
    const taskCategory = classifyTask(functionName);
    const ttlMinutes = CATEGORY_TTL_MINUTES[taskCategory];

    // Build cache key from normalized message contents for stable hashing
    const rawInput = messages.map((m) => `${m.role}:${m.content}`).join('|');
    const normalizedInput = normalizeCacheContent(rawInput);
    const promptHash = await generatePromptHash(normalizedInput);

    try {
      const cached = await this.cache.lookup(promptHash, taskCategory, tenantId);

      if (cached) {
        // Record hit asynchronously (fire-and-forget)
        this.cache.recordHit(cached.id).catch((e) => logger.warn('[AICacheUseCase] recordHit failed:', e));

        logger.info('[AICacheUseCase] Cache HIT', {
          promptHash: promptHash.substring(0, 16) + '...',
          category: taskCategory,
          hitCount: cached.hitCount + 1,
          provider: cached.provider,
        });

        return { hit: true, cached, promptHash, taskCategory, ttlMinutes };
      }
    } catch (err) {
      // Cache lookup failure should never block AI calls
      logger.warn('[AICacheUseCase] Lookup failed, treating as miss', {
        error: (err as Error).message,
      });
    }

    return { hit: false, promptHash, taskCategory, ttlMinutes };
  }

  /**
   * Store a successful AI response in the cache.
   */
  async store(params: {
    promptHash: string;
    taskCategory: AITaskCategory;
    ttlMinutes: number;
    responseContent: string;
    provider: string;
    model: string;
    tokensUsed: number;
    costUsd: number;
    tenantId?: string;
    functionName?: string;
    latencyMs: number;
  }): Promise<void> {
    // Don't cache empty or error responses
    if (!params.responseContent || params.responseContent.length < 10) {
      return;
    }

    try {
      await this.cache.store({
        promptHash: params.promptHash,
        taskCategory: params.taskCategory,
        responseContent: params.responseContent,
        provider: params.provider,
        model: params.model,
        tokensUsed: params.tokensUsed,
        costUsd: params.costUsd,
        tenantId: params.tenantId,
        functionName: params.functionName,
        latencyMs: params.latencyMs,
        ttlMinutes: params.ttlMinutes,
      });
    } catch (err) {
      logger.warn('[AICacheUseCase] Store failed', {
        error: (err as Error).message,
      });
    }
  }
}
