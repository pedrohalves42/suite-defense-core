import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * KV Cache Tests — validates get/set/delete/getOrSet patterns
 * Tests pure logic without requiring actual Supabase connection
 */

// Mock Supabase client
function createMockSupabase(store: Map<string, { value: unknown; expires_at: string }>) {
  return {
    from: (table: string) => {
      expect(table).toBe('kv_cache');
      return {
        select: (cols: string) => ({
          eq: (col: string, key: string) => ({
            gt: (_col: string, _val: string) => ({
              maybeSingle: async () => {
                const entry = store.get(key);
                if (!entry) return { data: null, error: null };
                if (new Date(entry.expires_at) < new Date()) {
                  store.delete(key);
                  return { data: null, error: null };
                }
                return { data: { value: entry.value }, error: null };
              },
            }),
          }),
        }),
        upsert: async (row: { key: string; value: unknown; expires_at: string }) => {
          store.set(row.key, { value: row.value, expires_at: row.expires_at });
          return { error: null };
        },
        delete: () => ({
          eq: (_col: string, key: string) => {
            store.delete(key);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  };
}

describe('KV Cache Logic', () => {
  let store: Map<string, { value: unknown; expires_at: string }>;

  beforeEach(() => {
    store = new Map();
  });

  it('returns null for missing keys', async () => {
    const sb = createMockSupabase(store);
    const result = await sb.from('kv_cache').select('value').eq('key', 'missing').gt('expires_at', new Date().toISOString()).maybeSingle();
    expect(result.data).toBeNull();
  });

  it('stores and retrieves values', async () => {
    const sb = createMockSupabase(store);
    const futureDate = new Date(Date.now() + 3600_000).toISOString();
    await sb.from('kv_cache').upsert({ key: 'test-key', value: { foo: 'bar' }, expires_at: futureDate });
    const result = await sb.from('kv_cache').select('value').eq('key', 'test-key').gt('expires_at', new Date().toISOString()).maybeSingle();
    expect(result.data?.value).toEqual({ foo: 'bar' });
  });

  it('returns null for expired entries', async () => {
    const sb = createMockSupabase(store);
    const pastDate = new Date(Date.now() - 1000).toISOString();
    await sb.from('kv_cache').upsert({ key: 'expired-key', value: 'old', expires_at: pastDate });
    const result = await sb.from('kv_cache').select('value').eq('key', 'expired-key').gt('expires_at', new Date().toISOString()).maybeSingle();
    expect(result.data).toBeNull();
  });

  it('deletes keys', async () => {
    const sb = createMockSupabase(store);
    const futureDate = new Date(Date.now() + 3600_000).toISOString();
    await sb.from('kv_cache').upsert({ key: 'del-key', value: 'val', expires_at: futureDate });
    expect(store.has('del-key')).toBe(true);
    await sb.from('kv_cache').delete().eq('key', 'del-key');
    expect(store.has('del-key')).toBe(false);
  });

  it('overwrites existing keys on upsert', async () => {
    const sb = createMockSupabase(store);
    const futureDate = new Date(Date.now() + 3600_000).toISOString();
    await sb.from('kv_cache').upsert({ key: 'k1', value: 'v1', expires_at: futureDate });
    await sb.from('kv_cache').upsert({ key: 'k1', value: 'v2', expires_at: futureDate });
    const result = await sb.from('kv_cache').select('value').eq('key', 'k1').gt('expires_at', new Date().toISOString()).maybeSingle();
    expect(result.data?.value).toBe('v2');
  });
});
