import { describe, it, expect, vi } from 'vitest';
import { batchQuery, batchUpsert, batchFetchByIds } from '../../supabase/functions/_shared/batch';
import type { SupabaseClientLike } from '../../supabase/functions/_shared/batch';

describe('batch utilities', () => {
  describe('batchQuery', () => {
    it('processes items in correct-sized chunks', async () => {
      const items = [1, 2, 3, 4, 5];
      const calls: number[][] = [];
      const fetcher = async (batch: number[]) => {
        calls.push(batch);
        return new Map(batch.map(i => [String(i), `v${i}`]));
      };

      const result = await batchQuery(items, fetcher, 2);

      expect(calls).toEqual([[1, 2], [3, 4], [5]]);
      expect(result.size).toBe(5);
      expect(result.get('3')).toBe('v3');
    });

    it('handles empty input', async () => {
      const fetcher = vi.fn();
      const result = await batchQuery([], fetcher);
      expect(fetcher).not.toHaveBeenCalled();
      expect(result.size).toBe(0);
    });
  });

  describe('batchUpsert', () => {
    it('upserts in batches and counts successes', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as unknown as SupabaseClientLike;
      const items = Array.from({ length: 5 }, (_, i) => ({ id: i }));

      const result = await batchUpsert(mockSupabase, 'tbl', items, 'id', 2);

      expect(result.success).toBe(5);
      expect(result.failed).toBe(0);
    });

    it('counts failures per batch', async () => {
      let callCount = 0;
      const mockSupabase = {
        from: vi.fn().mockImplementation(() => ({
          upsert: vi.fn().mockImplementation(() => {
            callCount++;
            return callCount === 2
              ? Promise.resolve({ error: { message: 'fail' } })
              : Promise.resolve({ error: null });
          }),
        })),
      } as unknown as SupabaseClientLike;
      const items = Array.from({ length: 6 }, (_, i) => ({ id: i }));

      const result = await batchUpsert(mockSupabase, 'tbl', items, 'id', 2);

      expect(result.failed).toBe(2);
      expect(result.success).toBe(4);
    });
  });

  describe('batchFetchByIds', () => {
    it('fetches in batches using .in()', async () => {
      const mockData = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: mockData.slice(0, 2), error: null }),
          }),
        }),
      } as unknown as SupabaseClientLike;

      const result = await batchFetchByIds(mockSupabase, 'tbl', 'id', ['a', 'b'], '*', 10);
      expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
    });

    it('skips failed batches and continues', async () => {
      let callIdx = 0;
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockImplementation(() => {
              callIdx++;
              return callIdx === 1
                ? Promise.resolve({ data: null, error: { message: 'fail' } })
                : Promise.resolve({ data: [{ id: 'z' }], error: null });
            }),
          }),
        }),
      } as unknown as SupabaseClientLike;

      const result = await batchFetchByIds(mockSupabase, 'tbl', 'id', ['a', 'b', 'c'], '*', 2);
      expect(result).toEqual([{ id: 'z' }]);
    });
  });
});
