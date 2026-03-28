/**
 * Hexagonal Port: AI Response Cache
 * 
 * Defines the contract for semantic caching of AI responses.
 * Reduces cost and latency by ~40% for repeated analysis patterns.
 */

// ??? Cache Entry (Read Model) ??????????????????????????
export interface CachedAIResponse {
  id: string;
  promptHash: string;
  taskCategory: string;
  responseContent: string;
  provider: string;
  model: string;
  tokensUsed: number;
  costUsd: number;
  hitCount: number;
  createdAt: string;
  expiresAt: string;
}

// ??? Cache Write Command ???????????????????????????????
export interface CacheAIResponseCommand {
  promptHash: string;
  systemPromptHash?: string;
  taskCategory: string;
  responseContent: string;
  provider: string;
  model: string;
  tokensUsed: number;
  costUsd: number;
  tenantId?: string;
  functionName?: string;
  latencyMs: number;
  ttlMinutes?: number;
}

// ??? Output Port ???????????????????????????????????????
export interface AICachePort {
  /**
   * Look up a cached response by prompt hash + category.
   * Returns null if not found or expired.
   */
  lookup(promptHash: string, taskCategory: string, tenantId?: string): Promise<CachedAIResponse | null>;

  /**
   * Store a new AI response in the cache.
   * Uses upsert to handle race conditions.
   */
  store(command: CacheAIResponseCommand): Promise<void>;

  /**
   * Increment hit count and last_hit_at for analytics.
   */
  recordHit(cacheId: string): Promise<void>;

  /**
   * Get cache statistics for observability.
   */
  getStats(): Promise<{
    totalEntries: number;
    totalHits: number;
    avgHitCount: number;
    oldestEntry: string | null;
  }>;
}
