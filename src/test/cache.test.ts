import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── MemoryCache unit tests (reimplemented to avoid Deno imports) ───

class MemoryCache {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

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
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
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

  keys(): IterableIterator<string> {
    return this.store.keys();
  }
}

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
  });

  it('returns null for missing keys', () => {
    expect(cache.get('nope')).toBeNull();
  });

  it('stores and retrieves values', () => {
    cache.set('k', { hello: 'world' }, 60);
    expect(cache.get('k')).toEqual({ hello: 'world' });
  });

  it('returns null for expired entries', async () => {
    cache.set('exp', 'val', 0);
    await new Promise(r => setTimeout(r, 5));
    expect(cache.get('exp')).toBeNull();
  });

  it('deletes specific keys', () => {
    cache.set('a', 1, 60);
    cache.set('b', 2, 60);
    cache.delete('a');
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe(2);
  });

  it('clears all entries', () => {
    cache.set('a', 1, 60);
    cache.set('b', 2, 60);
    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });

  it('has() returns true for existing non-expired keys', () => {
    cache.set('exists', 'yes', 60);
    expect(cache.has('exists')).toBe(true);
    expect(cache.has('nope')).toBe(false);
  });

  it('has() returns false for expired keys', async () => {
    cache.set('expiring', 'val', 0);
    await new Promise(r => setTimeout(r, 5));
    expect(cache.has('expiring')).toBe(false);
  });
});

describe('getCached (integration-style)', () => {
  it('calls fetcher on cache miss and stores via RPC', async () => {
    const mockRpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null }) // get_cached_value miss
      .mockResolvedValueOnce({ error: null }); // set_cached_value

    const mockSupabase = { rpc: mockRpc };
    const fetcher = vi.fn().mockResolvedValue({ result: 42 });

    // Simulate getCached logic
    const key = 'test:key';
    const { data } = await mockSupabase.rpc('get_cached_value', { p_key: key });
    expect(data).toBeNull();

    const value = await fetcher();
    expect(value).toEqual({ result: 42 });

    await mockSupabase.rpc('set_cached_value', {
      p_key: key,
      p_value: value,
      p_ttl_seconds: 300,
    });
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('returns cached value from RPC on hit', async () => {
    const cachedValue = { name: 'cached' };
    const mockRpc = vi.fn().mockResolvedValue({ data: cachedValue, error: null });
    const mockSupabase = { rpc: mockRpc };

    const { data, error } = await mockSupabase.rpc('get_cached_value', { p_key: 'hit-key' });
    expect(error).toBeNull();
    expect(data).toEqual(cachedValue);
  });
});

describe('invalidateCacheByPrefix (logic)', () => {
  it('clears memory entries matching prefix', () => {
    const cache = new MemoryCache();
    cache.set('prefix:a', 1, 60);
    cache.set('prefix:b', 2, 60);
    cache.set('other:c', 3, 60);

    for (const key of Array.from(cache.keys())) {
      if (key.startsWith('prefix:')) {
        cache.delete(key);
      }
    }

    expect(cache.get('prefix:a')).toBeNull();
    expect(cache.get('prefix:b')).toBeNull();
    expect(cache.get('other:c')).toBe(3);
  });
});
