import { describe, it, expect } from 'vitest';

/**
 * Rate Limit Cache Logic Tests
 * Tests the in-memory cache layer behavior without RPC calls
 */

interface CacheEntry {
  allowed: boolean;
  remainingRequests: number;
  resetAt?: Date;
  cachedAt: number;
}

function createRateLimitCache(ttlMs = 10_000) {
  const cache = new Map<string, CacheEntry>();
  const maxSize = 100;

  function cacheKey(identifier: string, endpoint: string): string {
    return `${identifier}::${endpoint}`;
  }

  function getCached(key: string): CacheEntry | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > ttlMs) {
      cache.delete(key);
      return null;
    }
    return entry;
  }

  function setCache(key: string, entry: CacheEntry): void {
    if (cache.size >= maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    cache.set(key, entry);
  }

  return { cache, cacheKey, getCached, setCache };
}

describe('Rate Limit In-Memory Cache', () => {
  it('returns null for missing keys', () => {
    const { getCached, cacheKey } = createRateLimitCache();
    expect(getCached(cacheKey('user1', '/api/test'))).toBeNull();
  });

  it('stores and retrieves entries', () => {
    const { getCached, setCache, cacheKey } = createRateLimitCache();
    const key = cacheKey('user1', '/api/test');
    setCache(key, { allowed: true, remainingRequests: 9, cachedAt: Date.now() });
    const result = getCached(key);
    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(true);
    expect(result!.remainingRequests).toBe(9);
  });

  it('evicts expired entries', () => {
    const { getCached, setCache, cacheKey } = createRateLimitCache(100);
    const key = cacheKey('user1', '/api/test');
    setCache(key, { allowed: true, remainingRequests: 5, cachedAt: Date.now() - 200 });
    expect(getCached(key)).toBeNull();
  });

  it('respects max cache size', () => {
    const { cache, setCache, cacheKey } = createRateLimitCache();
    for (let i = 0; i < 110; i++) {
      setCache(cacheKey(`user${i}`, '/api'), { allowed: true, remainingRequests: 10, cachedAt: Date.now() });
    }
    expect(cache.size).toBeLessThanOrEqual(100);
  });

  it('caches blocked entries correctly', () => {
    const { getCached, setCache, cacheKey } = createRateLimitCache();
    const resetAt = new Date(Date.now() + 60_000);
    const key = cacheKey('attacker', '/api/login');
    setCache(key, { allowed: false, remainingRequests: 0, resetAt, cachedAt: Date.now() });
    const result = getCached(key);
    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    expect(result!.remainingRequests).toBe(0);
    expect(result!.resetAt).toEqual(resetAt);
  });
});
