/**
 * pipeline.order.test.ts — enforces R3.1 §4 pipeline order (invariant P1).
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { composePipeline } from "../pipeline.ts";

Deno.test("pipeline: executes stages in frozen order", async () => {
  const order: string[] = [];
  const handler = composePipeline({
    rateLimit: async () => { order.push('rateLimit'); return null; },
    idempotency: async () => { order.push('idempotency'); return null; },
    retry: async (fn) => { order.push('retry:enter'); const r = await fn(); order.push('retry:exit'); return r; },
    breaker: async (fn) => { order.push('breaker:enter'); const r = await fn(); order.push('breaker:exit'); return r; },
    timeout: async (fn) => { order.push('timeout:enter'); const r = await fn(); order.push('timeout:exit'); return r; },
    business: async () => { order.push('business'); return new Response('ok'); },
    audit: async () => { order.push('audit'); },
  });
  await handler(new Request('http://localhost/'));
  assertEquals(order, [
    'rateLimit',
    'idempotency',
    'retry:enter',
    'breaker:enter',
    'timeout:enter',
    'business',
    'timeout:exit',
    'breaker:exit',
    'retry:exit',
    'audit',
  ]);
});

Deno.test("pipeline: rateLimit short-circuits before business", async () => {
  let businessCalled = false;
  const handler = composePipeline({
    rateLimit: async () => new Response('429', { status: 429 }),
    business: async () => { businessCalled = true; return new Response('ok'); },
  });
  const res = await handler(new Request('http://localhost/'));
  assertEquals(res.status, 429);
  assertEquals(businessCalled, false);
});

Deno.test("pipeline: idempotency short-circuit prevents business", async () => {
  let businessCalled = false;
  const handler = composePipeline({
    idempotency: async () => new Response('replay', { status: 200 }),
    business: async () => { businessCalled = true; return new Response('ok'); },
  });
  await handler(new Request('http://localhost/'));
  assertEquals(businessCalled, false);
});

Deno.test("pipeline: skipping stages is allowed", async () => {
  const handler = composePipeline({
    business: async () => new Response('ok'),
  });
  const res = await handler(new Request('http://localhost/'));
  assertEquals(await res.text(), 'ok');
});

Deno.test("pipeline: audit failure does not break the response", async () => {
  const handler = composePipeline({
    business: async () => new Response('ok'),
    audit: async () => { throw new Error('audit broken'); },
  });
  const res = await handler(new Request('http://localhost/'));
  assertEquals(await res.text(), 'ok');
});
