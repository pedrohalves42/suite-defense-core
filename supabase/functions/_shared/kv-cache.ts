/**
 * KV Cache ? lightweight key-value cache backed by the kv_cache table.
 * Used by Edge Functions to cache expensive queries (DNS blocklists, policies, etc.)
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from './logger.ts';

/**
 * Get a cached value. Returns null if missing or expired.
 */
export async function cacheGet<T = unknown>(
  supabase: SupabaseClient,
  key: string,
): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('kv_cache')
      .select('value')
      .eq('key', key)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) {
      logger.warn('[KVCache] Read error:', error.message);
      return null;
    }
    return (data?.value as T) ?? null;
  } catch (err) {
    logger.warn('[KVCache] Unexpected error in cacheGet:', String(err));
    return null;
  }
}

/**
 * Set a cached value with TTL in seconds.
 * Uses upsert ? overwrites existing keys.
 */
export async function cacheSet(
  supabase: SupabaseClient,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const { error } = await supabase.from('kv_cache').upsert(
      { key, value, expires_at: expiresAt, created_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
    if (error) {
      logger.warn('[KVCache] Write error:', error.message);
    }
  } catch (err) {
    logger.warn('[KVCache] Unexpected error in cacheSet:', String(err));
  }
}

/**
 * Delete a cached key.
 */
export async function cacheDelete(
  supabase: SupabaseClient,
  key: string,
): Promise<void> {
  await supabase.from('kv_cache').delete().eq('key', key);
}

/**
 * Get-or-set pattern: returns cached value or calls factory, caches result.
 */
export async function cacheGetOrSet<T>(
  supabase: SupabaseClient,
  key: string,
  ttlSeconds: number,
  factory: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(supabase, key);
  if (cached !== null) return cached;

  const fresh = await factory();
  await cacheSet(supabase, key, fresh, ttlSeconds);
  return fresh;
}
