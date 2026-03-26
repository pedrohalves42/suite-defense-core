/**
 * Batch query utilities for N+1 prevention
 * 
 * Usage:
 *   import { batchQuery, batchUpsert } from '../_shared/batch.ts';
 */

// SupabaseClient type used loosely to avoid Deno-only import issues in build
type SupabaseClient = any;

/**
 * Process items in batches with a custom fetcher.
 * Prevents N+1 by chunking queries.
 */
export async function batchQuery<T, R>(
  items: T[],
  fetcher: (batch: T[]) => Promise<Map<string, R>>,
  batchSize = 50
): Promise<Map<string, R>> {
  const results = new Map<string, R>();

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await fetcher(batch);
    batchResults.forEach((value, key) => results.set(key, value));
  }

  return results;
}

/**
 * Upsert items in batches to avoid payload size limits.
 */
export async function batchUpsert(
  supabase: SupabaseClient,
  table: string,
  items: Record<string, unknown>[],
  conflictKey: string,
  batchSize = 100
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictKey });

    if (error) {
      console.error(`[batchUpsert] Batch ${i / batchSize} failed:`, error.message);
      failed += batch.length;
    } else {
      success += batch.length;
    }
  }

  return { success, failed };
}

/**
 * Fetch rows by IDs in batches using .in() filter.
 * Avoids the 1000-row default limit per query.
 */
export async function batchFetchByIds<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  idColumn: string,
  ids: string[],
  select = '*',
  batchSize = 200
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in(idColumn, batch);

    if (error) {
      console.error(`[batchFetchByIds] Batch ${i / batchSize} failed:`, error.message);
      continue;
    }

    if (data) results.push(...(data as T[]));
  }

  return results;
}
