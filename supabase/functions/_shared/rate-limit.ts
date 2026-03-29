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

declare const Deno: { env: { get(key: string): string | undefined } } | undefined;

const CACHE_TTL_MS = (() => {
  const envVal = typeof Deno !== 'undefined' ? Deno.env.get('RATE_LIMIT_CACHE_TTL_MS') : undefined;
  const parsed = envVal ? parseInt(envVal, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000;
})();

const MAX_CACHE_SIZE = 5_000;
const cache = new Map<string, CacheEntry>();

// ── Metrics ──────────────────────────────────────────────────────────────────
let cacheHits = 0;
let cacheMisses = 0;
let ttlEvictions = 0;
let rpcCalls = 0;
let rpcErrors = 0;
let lastMetricsEmitAt = 0;
const METRICS_EMIT_INTERVAL_MS = 60_000; // Emit metrics at most once per minute

function cacheKey(identifier: string, endpoint: string): string {
  return `${identifier}::${endpoint}`;
}

function getCached(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(key);
    ttlEvictions++;
    return null;
  }
  return entry;
}

function setCache(key: string, entry: CacheEntry): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, entry);
}

/** Emits rate-limit cache metrics via logger.metric (at most once per minute). */
function maybeEmitMetrics(): void {
  const now = Date.now();
  if (now - lastMetricsEmitAt < METRICS_EMIT_INTERVAL_MS) return;
  lastMetricsEmitAt = now;

  const total = cacheHits + cacheMisses;
  const hitRate = total > 0 ? Math.round((cacheHits / total) * 100) : 0;

  logger.metric('rate_limit_cache_hits', cacheHits);
  logger.metric('rate_limit_cache_misses', cacheMisses);
  logger.metric('rate_limit_cache_hit_rate_pct', hitRate);
  logger.metric('rate_limit_cache_ttl_evictions', ttlEvictions);
  logger.metric('rate_limit_rpc_calls', rpcCalls);
  logger.metric('rate_limit_rpc_errors', rpcErrors);
  logger.metric('rate_limit_cache_size', cache.size);
}

/** Returns cache hit/miss stats for observability (e.g., health endpoints). */
export function getRateLimitCacheStats(): {
  hits: number;
  misses: number;
  ttlEvictions: number;
  rpcCalls: number;
  rpcErrors: number;
  size: number;
  ttlMs: number;
} {
  return { hits: cacheHits, misses: cacheMisses, ttlEvictions, rpcCalls, rpcErrors, size: cache.size, ttlMs: CACHE_TTL_MS };
}

/**
 * Rate limit check with in-memory cache layer.
 *
 * ADR: rate-limit-cache
 * ─────────────────────
 * Problem:  Every request triggers an RPC to `check_rate_limit_atomic`,
 *           adding ~5-15ms latency and amplifying DB load linearly with fleet size.
 * Decision: Add a per-isolate in-memory cache with configurable TTL (default 10s,
 *           override via RATE_LIMIT_CACHE_TTL_MS env var).
 * Trade-off: Within the TTL window, rate-limit counts are approximate — a burst
 *            of up to `maxRequests` could slip through if all requests hit the
 *            same isolate before the first RPC response is cached.
 *            This is acceptable because the DB-level RPC still enforces the
 *            authoritative count, and the window is short.
 * Metrics:  Exposed via `getRateLimitCacheStats()` and emitted via `logger.metric`
 *           once per minute for dashboards / alerting.
 * Rollback: Set RATE_LIMIT_CACHE_TTL_MS=0 to effectively disable caching
 *           (every call will be a cache miss since TTL=0 means immediate expiry).
 *
 * Flow:
 * 1. Check cache → if hit and still within TTL, return cached result (no RPC).
 * 2. On cache miss → call check_rate_limit_atomic RPC.
 * 3. Cache the result for CACHE_TTL_MS.
 * 4. On RPC error → FAIL CLOSED (block request for safety). Do NOT cache errors.
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
    maybeEmitMetrics();
    return {
      allowed: cached.allowed,
      remainingRequests: cached.allowed ? Math.max(0, cached.remainingRequests - 1) : 0,
      resetAt: cached.resetAt,
    };
  }

  cacheMisses++;
  rpcCalls++;

  // 2. RPC call
  const { data, error } = await supabase.rpc('check_rate_limit_atomic', {
    p_identifier: identifier,
    p_endpoint: endpoint,
    p_max_requests: config.maxRequests,
    p_window_minutes: config.windowMinutes,
    p_block_minutes: config.blockMinutes ?? 5,
  });

  if (error) {
    rpcErrors++;
    // FAIL CLOSED: Block requests when rate-limit check fails
    logger.error('[RateLimit] RPC error, failing CLOSED for safety:', error.message);
    maybeEmitMetrics();
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
  maybeEmitMetrics();

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
