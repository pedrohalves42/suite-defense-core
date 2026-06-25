/**
 * PP02-A — HMAC success-path coalescer
 *
 * Scope (locked by user constraints):
 *   - Coalesce ONLY repetitive success-path side effects of HMAC verification
 *     (currently: `agent_hmac_format_cache` upsert, which writes the same
 *     row on every successful verify for the same agent).
 *   - Failures, replay-detected, suspicious and invalid events keep their
 *     existing synchronous write path. They never enter this coalescer.
 *   - HMAC algorithm, agent contract and replay protection (`hmac_check_and_record`)
 *     are NOT touched.
 *
 * Behaviour:
 *   - LRU dedupe: if the same agent's format-cache row was upserted in the
 *     last `lruTtlMs`, skip enqueuing again (it would be a no-op write).
 *   - Batch flush: pending upserts are flushed when either
 *       (a) the buffer reaches `maxBatchSize`, or
 *       (b) `flushIntervalMs` elapses since the first enqueue.
 *   - Fallback: if the batched flush fails, we fall back to a per-row upsert
 *     using the same client. Replay protection is unaffected either way.
 *
 * Feature flag: `hmac_success_coalescing` (key in `feature_flags`). When the
 * flag is disabled we bypass the coalescer entirely and write inline — that
 * is the rollback path (no migration needed).
 *
 * Metrics: in-memory counters exposed via `getCoalescerMetrics()`. Logged on
 * every flush so they surface in edge function logs.
 */

import { logger } from './logger.ts';

export interface FormatCacheUpsertRow extends Record<string, unknown> {
  agent_id: string;
  tenant_id: string;
  key_encoding: string;
  separator: string;
  body_format: string;
  last_verified_at: string;
  hit_count: number;
}

export interface CoalescerOptions {
  maxBatchSize?: number;
  flushIntervalMs?: number;
  lruTtlMs?: number;
  lruMaxEntries?: number;
}

interface CoalescerClientLike {
  from(table: string): {
    upsert(
      rows: Record<string, unknown> | Record<string, unknown>[],
      options?: { onConflict: string },
    ): Promise<{ error: { message: string } | null }>;
  };
}

interface CoalescerMetrics {
  lru_hits: number;
  buffered: number;
  flushed_rows: number;
  flush_batches: number;
  flush_errors: number;
  fallback_rows: number;
  fallback_errors: number;
  bypass_disabled: number;
}

const DEFAULTS = {
  maxBatchSize: 50,
  flushIntervalMs: 1500,
  lruTtlMs: 30_000,
  lruMaxEntries: 1000,
};

const metrics: CoalescerMetrics = {
  lru_hits: 0,
  buffered: 0,
  flushed_rows: 0,
  flush_batches: 0,
  flush_errors: 0,
  fallback_rows: 0,
  fallback_errors: 0,
  bypass_disabled: 0,
};

const lru = new Map<string, number>(); // agent_id -> last upsert ts (ms)
let pending: FormatCacheUpsertRow[] = [];
let firstEnqueueAt = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let opts = { ...DEFAULTS };

function pruneLru() {
  const now = Date.now();
  for (const [k, ts] of lru) {
    if (now - ts > opts.lruTtlMs) lru.delete(k);
  }
  if (lru.size > opts.lruMaxEntries) {
    // delete oldest until back under limit
    const entries = [...lru.entries()].sort((a, b) => a[1] - b[1]);
    const drop = lru.size - opts.lruMaxEntries;
    for (let i = 0; i < drop; i++) lru.delete(entries[i][0]);
  }
}

async function flush(client: CoalescerClientLike): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pending.length === 0) return;

  const batch = pending;
  pending = [];
  firstEnqueueAt = 0;

  // Dedupe inside batch by agent_id, keep the latest row.
  const dedup = new Map<string, FormatCacheUpsertRow>();
  for (const row of batch) dedup.set(row.agent_id, row);
  const rows = [...dedup.values()];

  try {
    const { error } = await client
      .from('agent_hmac_format_cache')
      .upsert(rows, { onConflict: 'agent_id' });
    if (error) throw new Error(error.message);
    metrics.flush_batches += 1;
    metrics.flushed_rows += rows.length;
    logger.info('[hmac-coalescer] flushed', {
      batch_size: rows.length,
      lru_size: lru.size,
      metrics,
    });
  } catch (err: unknown) {
    metrics.flush_errors += 1;
    logger.warn('[hmac-coalescer] batch flush failed, falling back to per-row upsert', {
      message: err instanceof Error ? err.message : String(err),
      rows: rows.length,
    });
    // Fallback: per-row upsert. Failures here are tolerable — the format
    // cache is a perf optimisation, not a correctness requirement.
    for (const row of rows) {
      try {
        const { error } = await client
          .from('agent_hmac_format_cache')
          .upsert(row, { onConflict: 'agent_id' });
        if (error) {
          metrics.fallback_errors += 1;
        } else {
          metrics.fallback_rows += 1;
        }
      } catch {
        metrics.fallback_errors += 1;
      }
    }
  }
}

function scheduleFlush(client: CoalescerClientLike) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flush(client);
  }, opts.flushIntervalMs);
}

/**
 * Enqueue a format-cache upsert for the success path.
 * Idempotent within `lruTtlMs` window per agent.
 */
export function enqueueFormatCacheUpsert(
  client: CoalescerClientLike,
  row: FormatCacheUpsertRow,
  options?: CoalescerOptions,
): void {
  opts = { ...DEFAULTS, ...options };
  const now = Date.now();
  pruneLru();

  const last = lru.get(row.agent_id);
  if (last !== undefined && now - last < opts.lruTtlMs) {
    metrics.lru_hits += 1;
    return;
  }
  lru.set(row.agent_id, now);
  pending.push(row);
  metrics.buffered += 1;
  if (firstEnqueueAt === 0) firstEnqueueAt = now;

  if (pending.length >= opts.maxBatchSize) {
    void flush(client);
    return;
  }
  scheduleFlush(client);
}

/**
 * Bypass the coalescer entirely (feature flag OFF). Performs the same upsert
 * inline so the format cache stays warm even with the optimisation disabled.
 */
export async function inlineFormatCacheUpsert(
  client: CoalescerClientLike,
  row: FormatCacheUpsertRow,
): Promise<void> {
  metrics.bypass_disabled += 1;
  try {
    const { error } = await client
      .from('agent_hmac_format_cache')
      .upsert(row, { onConflict: 'agent_id' });
    if (error) {
      logger.warn('[hmac-coalescer] inline upsert failed', { message: error.message });
    }
  } catch (err) {
    logger.warn('[hmac-coalescer] inline upsert threw', {
      message: (err as Error).message,
    });
  }
}

export function getCoalescerMetrics(): Readonly<CoalescerMetrics> {
  return { ...metrics };
}

export function _resetCoalescerForTests(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  pending = [];
  firstEnqueueAt = 0;
  lru.clear();
  opts = { ...DEFAULTS };
  for (const k of Object.keys(metrics) as (keyof CoalescerMetrics)[]) metrics[k] = 0;
}

export async function _flushForTests(client: CoalescerClientLike): Promise<void> {
  await flush(client);
}
