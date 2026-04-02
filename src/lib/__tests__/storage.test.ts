import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('set and get value', async () => {
    const { storage } = await import('../storage');
    storage.set('key1', { a: 1 });
    expect(storage.get('key1')).toEqual({ a: 1 });
  });

  it('returns null for missing key', async () => {
    const { storage } = await import('../storage');
    expect(storage.get('nonexistent')).toBeNull();
  });

  it('removes item', async () => {
    const { storage } = await import('../storage');
    storage.set('key2', 'val');
    storage.remove('key2');
    expect(storage.get('key2')).toBeNull();
  });

  it('expires items', async () => {
    const { storage } = await import('../storage');
    storage.set('expiring', 'data', 1); // 1ms TTL
    await new Promise(r => setTimeout(r, 10));
    expect(storage.get('expiring')).toBeNull();
  });

  it('clearExpired removes only expired items', async () => {
    const { storage } = await import('../storage');
    storage.set('keep', 'data', 60000);
    storage.set('expire', 'data', 1);
    await new Promise(r => setTimeout(r, 10));
    storage.clearExpired();
    expect(storage.get('keep')).toBe('data');
    expect(storage.get('expire')).toBeNull();
  });

  it('handles invalid JSON gracefully', async () => {
    const { storage } = await import('../storage');
    localStorage.setItem('bad', 'not json');
    expect(storage.get('bad')).toBeNull();
  });
});
