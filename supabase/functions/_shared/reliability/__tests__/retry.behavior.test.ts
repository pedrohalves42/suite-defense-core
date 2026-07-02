/**
 * retry.behavior.test.ts — R3.1 §5.1 Behavior Table conformance.
 * Runs under Deno (`deno test`), matching the existing _shared test convention.
 */

import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { withRetry } from "../retry.ts";
import type { ClassifiedError, ErrorClassifier } from "../errors.ts";

function httpErr(status: number, retryAfterMs?: number): Error & { status: number; retryAfterMs?: number } {
  const e = new Error(`HTTP ${status}`) as Error & { status: number; retryAfterMs?: number };
  e.status = status;
  if (retryAfterMs !== undefined) e.retryAfterMs = retryAfterMs;
  return e;
}

Deno.test("retry: succeeds on first attempt", async () => {
  let calls = 0;
  const v = await withRetry(async () => { calls++; return 42; }, {
    maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10, totalBudgetMs: 1000,
    jitter: 'full', method: 'GET', idempotent: true,
  });
  assertEquals(v, 42);
  assertEquals(calls, 1);
});

Deno.test("retry: transient + idempotent -> retries then succeeds", async () => {
  let calls = 0;
  const v = await withRetry(async () => {
    calls++;
    if (calls < 3) throw httpErr(503);
    return 'ok';
  }, {
    maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 4, totalBudgetMs: 1000,
    jitter: 'full', method: 'GET', idempotent: true,
  });
  assertEquals(v, 'ok');
  assertEquals(calls, 3);
});

Deno.test("retry: permanent error -> no retry", async () => {
  let calls = 0;
  await assertRejects(async () => {
    await withRetry(async () => { calls++; throw httpErr(422); }, {
      maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 4, totalBudgetMs: 1000,
      jitter: 'full', method: 'POST', idempotent: true,
    });
  });
  assertEquals(calls, 1);
});

Deno.test("retry: non-idempotent + transient -> no retry", async () => {
  let calls = 0;
  await assertRejects(async () => {
    await withRetry(async () => { calls++; throw httpErr(503); }, {
      maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 4, totalBudgetMs: 1000,
      jitter: 'full', method: 'POST', idempotent: false,
    });
  });
  assertEquals(calls, 1);
});

Deno.test("retry: maxAttempts exhausted", async () => {
  let calls = 0;
  await assertRejects(async () => {
    await withRetry(async () => { calls++; throw httpErr(503); }, {
      maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, totalBudgetMs: 10_000,
      jitter: 'full', method: 'GET', idempotent: true,
    });
  });
  assertEquals(calls, 3);
});

Deno.test("retry: total budget clamps attempts", async () => {
  let calls = 0;
  await assertRejects(async () => {
    await withRetry(async () => { calls++; throw httpErr(503); }, {
      maxAttempts: 10, baseDelayMs: 50, maxDelayMs: 200, totalBudgetMs: 20,
      jitter: 'equal', method: 'GET', idempotent: true,
    });
  });
  // budget so tight only one attempt fits
  assertEquals(calls, 1);
});

Deno.test("retry: honors classifier.retryAfterMs on 429", async () => {
  let calls = 0;
  const t0 = Date.now();
  await withRetry(async () => {
    calls++;
    if (calls === 1) throw httpErr(429, 20);
    return 'ok';
  }, {
    maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, totalBudgetMs: 5_000,
    jitter: 'full', method: 'GET', idempotent: true,
  });
  const elapsed = Date.now() - t0;
  assertEquals(calls, 2);
  // waited at least ~20ms
  if (elapsed < 15) throw new Error(`expected >=15ms elapsed, got ${elapsed}`);
});

Deno.test("retry: unknown category -> no retry", async () => {
  let calls = 0;
  const classifier: ErrorClassifier = (): ClassifiedError => ({ category: 'unknown', cause: new Error('x') });
  await assertRejects(async () => {
    await withRetry(async () => { calls++; throw new Error('mystery'); }, {
      maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, totalBudgetMs: 1000,
      jitter: 'full', method: 'GET', idempotent: true, classifier,
    });
  });
  assertEquals(calls, 1);
});

Deno.test("retry: two independent runs with same inputs -> identical decision path", async () => {
  const attempts: number[] = [];
  const run = async () => {
    let n = 0;
    await withRetry(async () => {
      n++;
      throw httpErr(503);
    }, {
      maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, totalBudgetMs: 1000,
      jitter: 'full', method: 'GET', idempotent: true,
    }).catch(() => {});
    attempts.push(n);
  };
  await run(); await run();
  assertEquals(attempts[0], attempts[1]);
});
