import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from './logger.ts';

interface RateLimitConfig {
  maxRequests: number;
  windowMinutes: number;
  blockMinutes?: number;
}

interface CacheEntry {
  allowed: boolean;
  remainingRequests: number;
  resetAt?: Date;
  cachedAt: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 60,
  windowMinutes: 1,
  blockMinutes: 5,
};

// ── In-memory cache ──────────────────────────────────────────────────────────
// Eliminates redundant RPC calls for the same identifier:endpoint within TTL.
// Each Deno isolate has its own Map; entries expire via TTL check on read.
const CACHE_TTL_MS = 10_000; // 10 seconds
const MAX_CACHE_SIZE = 5_000;
const cache = new Map<string, CacheEntry>();

let cacheHits = 0;
let cacheMisses = 0;

function cacheKey(identifier: string, endpoint: string): string {
  return `${identifier}::${endpoint}`;
}

function getCached(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function setCache(key: string, entry: CacheEntry): void {
  // Evict oldest entries if cache is full (simple size guard)
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, entry);
}

/** Returns cache hit/miss stats for observability. */
export function getRateLimitCacheStats(): { hits: number; misses: number; size: number } {
  return { hits: cacheHits, misses: cacheMisses, size: cache.size };
}

/**
 * Rate limit check with in-memory cache layer.
 * 
 * Flow:
 * 1. Check cache → if hit and still within TTL, return cached result (no RPC).
 * 2. On cache miss → call check_rate_limit_atomic RPC.
 * 3. Cache the result for CACHE_TTL_MS.
 * 4. On RPC error → FAIL CLOSED (block request for safety).
 * 
 * The cache is per-isolate (Deno worker), so each cold start begins empty.
 * With a 10s TTL, the same identifier:endpoint pair can burst up to
 * maxRequests within the window but only triggers 1 RPC per 10s instead
 * of 1 RPC per request — reducing DB load by ~90%+ under sustained traffic.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  endpoint: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<{ allowed: boolean; remainingRequests?: number; resetAt?: Date }> {
  const key = cacheKey(identifier, endpoint);

  // 1. Cache hit?
  const cached = getCached(key);
  if (cached) {
    cacheHits++;
    // If cached as blocked, always return blocked (don't allow bypass)
    // If cached as allowed, decrement remaining optimistically
    return {
      allowed: cached.allowed,
      remainingRequests: cached.allowed ? Math.max(0, cached.remainingRequests - 1) : 0,
      resetAt: cached.resetAt,
    };
  }

  cacheMisses++;

  // 2. RPC call
  const { data, error } = await supabase.rpc('check_rate_limit_atomic', {
    p_identifier: identifier,
    p_endpoint: endpoint,
    p_max_requests: config.maxRequests,
    p_window_minutes: config.windowMinutes,
    p_block_minutes: config.blockMinutes ?? 5,
  });

  if (error) {
    // FAIL CLOSED: Block requests when rate-limit check fails
    logger.error('[RateLimit] RPC error, failing CLOSED for safety:', error.message);
    // Do NOT cache errors — let next request retry
    return { allowed: false, resetAt: new Date(Date.now() + 60_000) };
  }

  const result = data as { allowed: boolean; remaining?: number; reset_at?: string; reason?: string };

  // 3. Build and cache result
  const entry: CacheEntry = {
    allowed: result.allowed,
    remainingRequests: result.remaining ?? 0,
    resetAt: result.reset_at ? new Date(result.reset_at) : undefined,
    cachedAt: Date.now(),
  };
  setCache(key, entry);

  if (!result.allowed) {
    return {
      allowed: false,
      resetAt: entry.resetAt,
    };
  }

  return {
    allowed: true,
    remainingRequests: entry.remainingRequests,
  };
}
