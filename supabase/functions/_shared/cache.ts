import { logger } from "./logger.ts";
/**
 * Two-tier cache: in-memory (per-invocation) + Supabase kv_cache table (cross-invocation)
 * No Redis dependency — works on existing Supabase infrastructure.
 *
 * Usage:
 *   import { getCached, invalidateCache } from '../_shared/cache.ts';
 */

// SupabaseClient type used loosely to avoid Deno-only import issues in build
type SupabaseClient = any;

// ─── Tier 1: In-Memory Cache (per Edge Function invocation) ───

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.store.clear();
  }

  /** Iterate keys (for prefix-based invalidation) */
  keys(): IterableIterator<string> {
    return this.store.keys();
  }
}

// Singleton — lives for the duration of one Edge Function invocation
export const memoryCache = new MemoryCache();

// ─── Cache Options ───

export interface CacheOptions {
  ttlSeconds?: number;
  forceRefresh?: boolean;
  skipMemoryCache?: boolean;
}

const DEFAULT_TTL = 300; // 5 minutes

// ─── Tier 2: Supabase kv_cache table (cross-invocation) ───

/**
 * Get a value from cache (memory → kv_cache RPC → fetcher).
 * Stores result back into both tiers on miss.
 */
export async function getCached<T>(
  supabase: SupabaseClient,
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { ttlSeconds = DEFAULT_TTL, forceRefresh = false, skipMemoryCache = false } = options;

  // 1. Check memory cache
  if (!skipMemoryCache && !forceRefresh) {
    const memValue = memoryCache.get<T>(key);
    if (memValue !== null) return memValue;
  }

  // 2. Check kv_cache table via RPC
  if (!forceRefresh) {
    try {
      const { data, error } = await supabase.rpc('get_cached_value', { p_key: key });

      if (!error && data !== null) {
        const value = data as T;
        if (!skipMemoryCache) {
          memoryCache.set(key, value, ttlSeconds);
        }
        return value;
      }
    } catch {
      // Table read failed — fall through to fetcher
    }
  }

  // 3. Cache miss — call fetcher
  const freshValue = await fetcher();

  // Store in memory
  if (!skipMemoryCache) {
    memoryCache.set(key, freshValue, ttlSeconds);
  }

  // Store in kv_cache table via RPC (fire-and-forget)
  try {
    await supabase.rpc('set_cached_value', {
      p_key: key,
      p_value: JSON.parse(JSON.stringify(freshValue)),
      p_ttl_seconds: ttlSeconds,
    });
  } catch {
    // Cache write failure is non-fatal
  }

  return freshValue;
}

/**
 * Invalidate a specific cache key from both tiers.
 */
export async function invalidateCache(
  supabase: SupabaseClient,
  key: string
): Promise<void> {
  memoryCache.delete(key);
  try {
    await supabase.from('kv_cache').delete().eq('key', key);
  } catch {
    // Non-fatal
  }
}

/**
 * Invalidate all cache entries matching a prefix.
 */
export async function invalidateCacheByPrefix(
  supabase: SupabaseClient,
  prefix: string
): Promise<number> {
  // Clear matching memory cache entries
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }

  try {
    const { data, error } = await supabase.rpc('invalidate_cache_prefix', { p_prefix: prefix });
    if (error) return 0;
    return (data as number) || 0;
  } catch {
    return 0;
  }
}

/**
 * Clean up expired entries from kv_cache.
 * Call periodically (e.g., from a cron Edge Function).
 */
export async function cleanupExpiredCache(
  supabase: SupabaseClient
): Promise<number> {
  const { data, error } = await supabase.rpc('cleanup_expired_cache');
  if (error) {
    logger.error('[cache] cleanup failed:', error.message);
    return 0;
  }
  return (data as number) || 0;
}

// ─── Domain-specific helpers ───

export async function getTenantConfig(
  supabase: SupabaseClient,
  tenantId: string,
  options: CacheOptions = {}
): Promise<Record<string, unknown> | null> {
  return getCached(
    supabase,
    `tenant:${tenantId}:config`,
    async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, tier, settings, features, session_timeout_minutes')
        .eq('id', tenantId)
        .single();
      if (error) throw error;
      return data;
    },
    { ttlSeconds: 3600, ...options }
  );
}

export async function invalidateTenantCache(
  supabase: SupabaseClient,
  tenantId: string
): Promise<number> {
  return invalidateCacheByPrefix(supabase, `tenant:${tenantId}:`);
}

export async function getAgentsByTenant(
  supabase: SupabaseClient,
  tenantId: string,
  options: CacheOptions = {}
): Promise<any[]> {
  return getCached(
    supabase,
    `tenant:${tenantId}:agents`,
    async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, version, status, last_seen_at, ip_address')
        .eq('tenant_id', tenantId)
        .eq('status', 'active');
      if (error) throw error;
      return data || [];
    },
    { ttlSeconds: 60, ...options }
  );
}

export async function getDriftScore(
  supabase: SupabaseClient,
  tenantId: string,
  options: CacheOptions = {}
): Promise<{ score: number; severity: string; events: number }> {
  return getCached(
    supabase,
    `tenant:${tenantId}:drift`,
    async () => {
      const { data: events, error } = await supabase
        .from('drift_events')
        .select('severity, drift_score')
        .eq('tenant_id', tenantId)
        .is('resolved_at', null);
      if (error) throw error;

      const score = events?.reduce((sum: number, e: any) => sum + (e.drift_score || 0), 0) || 0;
      const hasCritical = events?.some((e: any) => e.severity === 'critical');
      const severity = hasCritical ? 'critical' : score > 15 ? 'high' : score > 5 ? 'medium' : 'low';

      return { score, severity, events: events?.length || 0 };
    },
    { ttlSeconds: 300, ...options }
  );
}

export async function getMitreRules(
  supabase: SupabaseClient,
  tactic?: string,
  options: CacheOptions = {}
): Promise<any[]> {
  const key = tactic ? `mitre:rules:${tactic}` : 'mitre:rules:all';

  return getCached(
    supabase,
    key,
    async () => {
      let query = supabase
        .from('mitre_rules')
        .select('technique_id, name, description, tactic, platform, severity')
        .eq('is_active', true);
      if (tactic) query = query.eq('tactic', tactic);
      const { data, error } = await query.order('technique_id');
      if (error) throw error;
      return data || [];
    },
    { ttlSeconds: 86400, ...options }
  );
}
