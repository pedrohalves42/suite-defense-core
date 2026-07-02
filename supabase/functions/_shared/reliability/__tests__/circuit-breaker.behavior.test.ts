/**
 * circuit-breaker.behavior.test.ts — R3.1 §5.2 Behavior Table conformance.
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CircuitBreaker } from "../circuit-breaker.ts";

function httpErr(status: number): Error & { status: number } {
  const e = new Error(`HTTP ${status}`) as Error & { status: number };
  e.status = status;
  return e;
}

function makeBreaker() {
  return new CircuitBreaker({
    name: 'test',
    windowMs: 1000,
    bucketMs: 100,
    failureThreshold: 0.5,
    minimumThroughput: 4,
    openStateMs: 50,
    successThreshold: 2,
  });
}

Deno.test("breaker: starts CLOSED", () => {
  const cb = makeBreaker();
  assertEquals(cb.getState(), 'CLOSED');
});

Deno.test("breaker: opens after failure ratio meets threshold", async () => {
  const cb = makeBreaker();
  for (let i = 0; i < 4; i++) {
    await cb.execute(async () => { throw httpErr(503); }).catch(() => {});
  }
  assertEquals(cb.getState(), 'OPEN');
});

Deno.test("breaker: rejects fast when OPEN", async () => {
  const cb = makeBreaker();
  for (let i = 0; i < 4; i++) {
    await cb.execute(async () => { throw httpErr(503); }).catch(() => {});
  }
  await assertRejects(() => cb.execute(async () => 'ok'), Error, 'OPEN');
});

Deno.test("breaker: transitions to HALF_OPEN after openStateMs", async () => {
  const cb = makeBreaker();
  for (let i = 0; i < 4; i++) {
    await cb.execute(async () => { throw httpErr(503); }).catch(() => {});
  }
  await new Promise(r => setTimeout(r, 60));
  assertEquals(cb.getState(), 'HALF_OPEN');
});

Deno.test("breaker: closes after successThreshold in HALF_OPEN", async () => {
  const cb = makeBreaker();
  for (let i = 0; i < 4; i++) {
    await cb.execute(async () => { throw httpErr(503); }).catch(() => {});
  }
  await new Promise(r => setTimeout(r, 60));
  assertEquals(await cb.execute(async () => 'ok'), 'ok');
  assertEquals(await cb.execute(async () => 'ok'), 'ok');
  assertEquals(cb.getState(), 'CLOSED');
});

Deno.test("breaker: reopens on HALF_OPEN failure", async () => {
  const cb = makeBreaker();
  for (let i = 0; i < 4; i++) {
    await cb.execute(async () => { throw httpErr(503); }).catch(() => {});
  }
  await new Promise(r => setTimeout(r, 60));
  await cb.execute(async () => { throw httpErr(503); }).catch(() => {});
  assertEquals(cb.getState(), 'OPEN');
});

Deno.test("breaker: permanent errors do NOT count toward failure ratio", async () => {
  const cb = makeBreaker();
  for (let i = 0; i < 10; i++) {
    await cb.execute(async () => { throw httpErr(422); }).catch(() => {});
  }
  assertEquals(cb.getState(), 'CLOSED');
});

Deno.test("breaker: does not open below minimumThroughput", async () => {
  const cb = makeBreaker();
  for (let i = 0; i < 3; i++) {
    await cb.execute(async () => { throw httpErr(503); }).catch(() => {});
  }
  assertEquals(cb.getState(), 'CLOSED');
});

Deno.test("breaker: reset restores CLOSED", async () => {
  const cb = makeBreaker();
  for (let i = 0; i < 4; i++) {
    await cb.execute(async () => { throw httpErr(503); }).catch(() => {});
  }
  cb.reset();
  assertEquals(cb.getState(), 'CLOSED');
});
