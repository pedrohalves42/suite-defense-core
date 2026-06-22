import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  enqueueFormatCacheUpsert,
  inlineFormatCacheUpsert,
  getCoalescerMetrics,
  _resetCoalescerForTests,
  _flushForTests,
  type FormatCacheUpsertRow,
} from "../hmac-success-coalescer.ts";

function makeRow(agentId: string): FormatCacheUpsertRow {
  return {
    agent_id: agentId,
    tenant_id: "t1",
    key_encoding: "hex",
    separator: ":",
    body_format: "raw",
    last_verified_at: new Date().toISOString(),
    hit_count: 1,
  };
}

function mockClient(opts: { fail?: boolean } = {}) {
  const calls: { table: string; rows: unknown }[] = [];
  return {
    calls,
    from(table: string) {
      return {
        upsert: (rows: unknown) => {
          calls.push({ table, rows });
          return Promise.resolve({
            error: opts.fail ? { message: "boom" } : null,
          });
        },
      };
    },
  };
}

Deno.test({
  name: "coalescer › LRU dedupe within TTL skips repeat enqueues",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    _resetCoalescerForTests();
    const c = mockClient();
    enqueueFormatCacheUpsert(c, makeRow("a1"));
    enqueueFormatCacheUpsert(c, makeRow("a1"));
    enqueueFormatCacheUpsert(c, makeRow("a1"));
    const m = getCoalescerMetrics();
    assertEquals(m.buffered, 1);
    assertEquals(m.lru_hits, 2);
    _resetCoalescerForTests();
  },
});

Deno.test({
  name: "coalescer › batch flush deduplicates and writes once",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    _resetCoalescerForTests();
    const c = mockClient();
    enqueueFormatCacheUpsert(c, makeRow("a1"));
    enqueueFormatCacheUpsert(c, makeRow("a2"));
    enqueueFormatCacheUpsert(c, makeRow("a3"));
    await _flushForTests(c);
    assertEquals(c.calls.length, 1);
    assertEquals((c.calls[0].rows as unknown[]).length, 3);
    const m = getCoalescerMetrics();
    assertEquals(m.flush_batches, 1);
    assertEquals(m.flushed_rows, 3);
    assertEquals(m.flush_errors, 0);
    _resetCoalescerForTests();
  },
});

Deno.test("coalescer › batch failure falls back to per-row upsert", async () => {
  _resetCoalescerForTests();
  const failing = mockClient({ fail: true });
  enqueueFormatCacheUpsert(failing, makeRow("a1"));
  enqueueFormatCacheUpsert(failing, makeRow("a2"));
  await _flushForTests(failing);
  // 1 batch attempt + 2 fallback rows = 3 calls
  assertEquals(failing.calls.length, 3);
  const m = getCoalescerMetrics();
  assertEquals(m.flush_errors, 1);
  // Both fallbacks also fail in this mock → fallback_errors=2, fallback_rows=0
  assertEquals(m.fallback_errors, 2);
});

Deno.test("coalescer › inline bypass path writes immediately", async () => {
  _resetCoalescerForTests();
  const c = mockClient();
  await inlineFormatCacheUpsert(c, makeRow("a1"));
  assertEquals(c.calls.length, 1);
  const m = getCoalescerMetrics();
  assertEquals(m.bypass_disabled, 1);
  assertEquals(m.buffered, 0);
});
