/**
 * idempotency.behavior.test.ts — R3.1 §5.3 + §3 canonicalization.
 */

import { assertEquals, assertNotEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  withIdempotency,
  canonicalFingerprint,
  type IdempotencyStore,
  type StoredIdempotencyRecord,
} from "../idempotency.ts";

function memoryStore(): IdempotencyStore {
  const m = new Map<string, StoredIdempotencyRecord>();
  const k = (s: string, key: string) => `${s}::${key}`;
  return {
    async get({ scope, key }) { return m.get(k(scope, key)) ?? null; },
    async put({ scope, key }, rec) {
      const kk = k(scope, key);
      if (m.has(kk)) return 'exists';
      m.set(kk, rec);
      return 'inserted';
    },
  };
}

const DAY = 24 * 60 * 60 * 1000;

Deno.test("idempotency: first call executes", async () => {
  const store = memoryStore();
  let n = 0;
  const out = await withIdempotency(async () => { n++; return { ok: true }; }, {
    key: { scope: 'jobs.create', key: 'k1' },
    body: { a: 1 }, retentionMs: DAY, store,
  });
  assertEquals(out.kind, 'executed');
  assertEquals(n, 1);
});

Deno.test("idempotency: replay returns stored on identical body", async () => {
  const store = memoryStore();
  let n = 0;
  const opts = {
    key: { scope: 'jobs.create', key: 'k2' },
    body: { a: 1, b: 2 }, retentionMs: DAY, store,
  };
  await withIdempotency(async () => { n++; return { ok: true }; }, opts);
  const out = await withIdempotency(async () => { n++; return { ok: true }; }, opts);
  assertEquals(out.kind, 'replayed');
  assertEquals(n, 1);
});

Deno.test("idempotency: conflict on same key with different body", async () => {
  const store = memoryStore();
  await withIdempotency(async () => ({ ok: 1 }), {
    key: { scope: 's', key: 'k3' }, body: { a: 1 }, retentionMs: DAY, store,
  });
  const out = await withIdempotency(async () => ({ ok: 2 }), {
    key: { scope: 's', key: 'k3' }, body: { a: 2 }, retentionMs: DAY, store,
  });
  assertEquals(out.kind, 'conflict');
});

Deno.test("idempotency: retention out of range -> throws", async () => {
  const store = memoryStore();
  await assertRejects(() =>
    withIdempotency(async () => 1, {
      key: { scope: 's', key: 'k' }, body: {}, retentionMs: 1000, store,
    })
  );
});

Deno.test("canonicalize: key permutations produce identical fingerprint", async () => {
  const a = await canonicalFingerprint({ a: 1, b: 2 });
  const b = await canonicalFingerprint({ b: 2, a: 1 });
  assertEquals(a, b);
});

Deno.test("canonicalize: array permutations produce different fingerprints", async () => {
  const a = await canonicalFingerprint([1, 2]);
  const b = await canonicalFingerprint([2, 1]);
  assertNotEquals(a, b);
});

Deno.test("canonicalize: NFC-normalizes strings", async () => {
  const nfc = '\u00e9';        // é
  const nfd = 'e\u0301';       // é decomposed
  const a = await canonicalFingerprint({ x: nfc });
  const b = await canonicalFingerprint({ x: nfd });
  assertEquals(a, b);
});

Deno.test("canonicalize: raw bytes bypass JSON path", async () => {
  const a = await canonicalFingerprint(new Uint8Array([1, 2, 3]));
  const b = await canonicalFingerprint(new Uint8Array([1, 2, 3]));
  const c = await canonicalFingerprint(new Uint8Array([1, 2, 4]));
  assertEquals(a, b);
  assertNotEquals(a, c);
});
