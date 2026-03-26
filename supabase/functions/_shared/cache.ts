/**
 * Two-tier cache: in-memory (per-invocation) + Supabase kv_cache table (cross-invocation)
 * No Redis dependency — works on existing Supabase infrastructure.
 *
 * Usage:
 *   import { getCached, invalidateCache } from '../_shared/cache.ts';
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

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

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// Singleton — lives for the duration of one Edge Function invocation
export const memoryCache = new MemoryCache();

// ─── Tier 2: Supabase kv_cache table (cross-invocation) ───

/**
 * Get a value from cache (memory → kv_cache table → fetcher).
 * Stores result back into both tiers on miss.
 */
export async function getCached<T>(
  supabase: SupabaseClient,
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 300
): Promise<T> {
  // 1. Check memory cache
  const memValue = memoryCache.get<T>(key);
  if (memValue !== null) return memValue;

  // 2. Check kv_cache table
  try {
    const { data, error } = await supabase
      .from('kv_cache')
      .select('value, expires_at')
      .eq('key', key)
      .single();

    if (!error && data && new Date(data.expires_at) > new Date()) {
      const value = data.value as T;
      memoryCache.set(key, value, ttlSeconds);
      return value;
    }
  } catch {
    // Table read failed — fall through to fetcher
  }

  // 3. Cache miss — call fetcher
  const freshValue = await fetcher();

  // Store in memory
  memoryCache.set(key, freshValue, ttlSeconds);

  // Store in kv_cache table (fire-and-forget)
  try {
    await supabase.from('kv_cache').upsert(
      {
        key,
        value: freshValue as unknown,
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      },
      { onConflict: 'key' }
    );
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
 * Invalidate all cache entries matching a prefix (e.g. "tenant:config:").
 */
export async function invalidateCacheByPrefix(
  supabase: SupabaseClient,
  prefix: string
): Promise<void> {
  memoryCache.clear();
  try {
    await supabase.from('kv_cache').delete().like('key', `${prefix}%`);
  } catch {
    // Non-fatal
  }
}

/**
 * Clean up expired entries from kv_cache.
 * Call periodically (e.g., from a cron Edge Function).
 */
export async function cleanupExpiredCache(
  supabase: SupabaseClient
): Promise<number> {
  const { data, error } = await supabase
    .from('kv_cache')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('key');

  if (error) {
    console.error('[cache] cleanup failed:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

// ─── Domain-specific helpers ───

export async function getTenantConfig(
  supabase: SupabaseClient,
  tenantId: string
): Promise<Record<string, unknown> | null> {
  return getCached(
    supabase,
    `tenant:config:${tenantId}`,
    async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, tier, settings, features, session_timeout_minutes')
        .eq('id', tenantId)
        .single();
      if (error) throw error;
      return data;
    },
    3600 // 1 hour
  );
}

export async function invalidateTenantCache(
  supabase: SupabaseClient,
  tenantId: string
): Promise<void> {
  await invalidateCacheByPrefix(supabase, `tenant:${tenantId}`);
}
