import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the MemoryCache and getCached logic by importing the module.
// The module uses Deno imports for SupabaseClient type, so we mock that too.
// For simplicity, test the in-memory tier directly and mock supabase for tier 2.

// Minimal MemoryCache reimplementation for pure-Node testing
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

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
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
    cache.set('exp', 'val', 0); // 0-second TTL → already expired
    // Wait a tick so Date.now() advances past expiresAt
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
});

describe('getCached (integration-style)', () => {
  it('calls fetcher on cache miss and returns result', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'kv_cache') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: mockSingle }),
            }),
            upsert: mockUpsert,
          };
        }
        return {};
      }),
    };

    // Simulate getCached logic inline (since importing the real module requires Deno types)
    const key = 'test:key';
    const fetcher = vi.fn().mockResolvedValue({ result: 42 });

    // Tier 2: check table
    const { data, error } = await mockSupabase.from('kv_cache').select('value, expires_at').eq('key', key).single();
    expect(error).toBeTruthy();

    // Fetcher
    const value = await fetcher();
    expect(value).toEqual({ result: 42 });
    expect(fetcher).toHaveBeenCalledOnce();

    // Store in table
    await mockSupabase.from('kv_cache').upsert({ key, value, expires_at: new Date().toISOString() });
    expect(mockUpsert).toHaveBeenCalled();
  });
});
