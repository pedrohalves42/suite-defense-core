# R3-A — Retry / Backoff RFC

> **Status:** Draft (design-only, awaiting approval)
> **Depends on:** R2 Runtime Standard RFC v1 (RSC.TMO, RSC.HTMO, RSC.ERR)
> **Successor blocks:** R4-prep (API contract), R4 (implementation), R5 (score)
>
> **Scope discipline (non-negotiable):**
> This document is a **specification**. It defines *properties* before *API*.
> No code under `supabase/functions/`, no code under `_shared/`, no new
> helpers, no signature changes, no prototype implementations. Any need to
> modify public helper APIs discovered while writing this RFC is recorded
> as a deferred decision and handled in a later block — **never** during
> R3.
>
> **Closure criterion:** the RFC is complete when two independent teams
> could implement the primitive from this document alone and arrive at
> compatible behaviour without needing further interpretation.

---

## 1. Problem

The platform has a partial retry culture: some outbound HTTP callers loop
on failure with ad-hoc backoff, others fail on first error, and a few
retry on non-retriable conditions (e.g. 4xx validation errors, idempotency
violations). There is no shared, verifiable notion of *what may be
retried, when, how many times, for how long, and under which invariants*.

The consequence measured in R1/R1.5:

- retry logic is duplicated with subtly different behaviours;
- some retries amplify incidents (thundering herd, retry storms on 5xx);
- some retries silently swallow non-transient failures;
- timeout budgets are not respected by retry loops (a 25s handler
  timeout can be violated by 3× 15s outbound calls).

R3-A fixes this by defining, in normative language, the **properties** a
retry primitive must satisfy on this platform.

## 2. Use cases (in scope)

Retry is designed for:

1. **Idempotent outbound HTTP** to third parties (AI providers, Stripe
   read-only endpoints, DNS lookups, webhook fan-out to our own
   ingestion endpoints).
2. **Internal function-to-function calls** where the callee is known to
   be idempotent (`serveInternal` targets that advertise idempotency).
3. **Read-only database operations** that fail with transient errors
   (connection reset, admission control, serialization failure that the
   caller can safely re-run).
4. **Idempotent producer writes** that carry an idempotency key covered
   by R3-C.

## 3. Non-use cases (out of scope)

Retry **must not** be applied to:

1. **Non-idempotent writes without an idempotency key.** Retrying a
   `POST /charge` without the R3-C key can double-charge a tenant.
2. **User-driven mutations** (form submissions, invite creation) whose
   effect the user expects to observe exactly once.
3. **Auth / authorization decisions** — retrying a denied request must
   not turn `403` into `200`.
4. **Validation errors** (`400`, `422`, Zod failures) — the input is
   deterministically invalid; retrying is a bug.
5. **Circuit-breaker rejections** (see R3-B) — retrying past an open
   breaker defeats its purpose. The retry primitive must observe the
   breaker's decision.
6. **`serveHoneypot`** — the honeypot's whole contract is to not appear
   to work; a retry loop reveals the trap.

## 4. Error classification

The retry primitive must consume an explicit classification. It **must
not** infer retriability from exception type alone.

Errors are partitioned into three disjoint classes:

- **`transient`** — retry is allowed. Examples: `ETIMEDOUT`, `ECONNRESET`,
  HTTP `408`, `425`, `429`, `500`, `502`, `503`, `504`,
  `Deno.errors.ConnectionRefused`, Supabase `PGRST` connection errors,
  Postgres SQLSTATE `40001` (serialization) / `40P01` (deadlock).
- **`permanent`** — retry is forbidden. Examples: HTTP `400`, `401`,
  `403`, `404`, `409`, `410`, `422`, Zod parse error, RLS denial,
  idempotency-conflict from R3-C.
- **`unknown`** — treated as `permanent` by default. A caller may
  explicitly upgrade a class to `transient` only for a documented
  reason recorded in the calling function's header.

An error's class is a **property of the error at the moment it is
raised**, not of the operation being retried. The classifier is
pluggable but the *default* classifier is normative and lives in this
RFC.

## 5. Budgets and limits

Every retry invocation must declare, explicitly or by inheriting a named
tier:

| Property             | Definition                                                                 | Default (tier `standard`) |
| -------------------- | -------------------------------------------------------------------------- | ------------------------- |
| `maxAttempts`        | Total attempts *including* the first. `1` disables retry.                  | `3`                       |
| `perAttemptTimeoutMs`| Per-attempt timeout; must be `<=` handler budget minus elapsed.            | inherit from RSC.TMO tier |
| `totalBudgetMs`      | Wall-clock ceiling for the entire retry loop, including sleeps.            | `min(handlerBudget/2, 8000)` |
| `baseDelayMs`        | Initial backoff before attempt 2.                                          | `250`                     |
| `maxDelayMs`         | Cap for any single backoff sleep.                                          | `4000`                    |
| `jitter`             | See §6.                                                                    | `"full"`                  |

Normative rules:

- **B1.** `sum(perAttemptTimeoutMs across attempts) + sum(backoff sleeps)
  <= totalBudgetMs`. The primitive must stop early when the next
  attempt cannot fit inside the remaining budget.
- **B2.** `totalBudgetMs <= handlerTimeoutMs - elapsed`. The retry loop
  must not cause an RSC.HTMO violation. On a violation-imminent state,
  the loop must return the last error (not spawn another attempt).
- **B3.** `maxAttempts >= 1`. Zero is not a legal value.
- **B4.** A caller that supplies a tier name **must not** override the
  tier's `maxAttempts` upward without documenting the reason inline.

## 6. Backoff policy

- **P1.** Backoff is **exponential** with base `baseDelayMs` and factor
  `2`. Attempt `n` (n >= 2) sleeps `min(maxDelayMs, baseDelayMs *
  2^(n-2))` before running.
- **P2.** **Jitter is mandatory.** The default is `"full"` jitter:
  actual sleep is `random(0, computedDelay)`. `"none"` is not a legal
  value in production tiers; it exists only for deterministic tests.
- **P3.** When the classified error carries a `Retry-After` hint
  (HTTP header, or `retryAfterMs` on the error object), the sleep is
  `max(jittered_backoff, retryAfterMs)`, still capped by budget B1.
- **P4.** Backoff sleeps must be **cancellable** — see §7.

## 7. Cancellation and timeout interaction

- **C1.** The retry primitive must accept an `AbortSignal`. If the
  signal aborts mid-sleep or mid-attempt, the loop exits and re-raises
  the abort reason — never a synthesized "retries exhausted" error.
- **C2.** The primitive must forward its `AbortSignal` (or a linked
  child signal) into the operation it retries. Callers must not have to
  wire timeouts twice.
- **C3.** Timeout interaction with RSC.TMO (`fetchWithTimeout`):
  each attempt uses `perAttemptTimeoutMs`, not the full budget. The
  `fetchWithTimeout` tier of the underlying call must be `<=`
  `perAttemptTimeoutMs`; the retry primitive is responsible for
  detecting the conflict and refusing to run.
- **C4.** Timeout interaction with RSC.HTMO (handler timeout): rule B2.
- **C5.** Circuit-breaker rejections from R3-B are `permanent` from the
  retry primitive's perspective — see §3.5 and R3-B §7.

## 8. Observability

Every retry invocation must emit:

- **O1.** One `logger.info`-level record per attempt with fields:
  `retry.name`, `retry.attempt` (1-indexed), `retry.maxAttempts`,
  `retry.elapsedMs`, `retry.errorClass` (present when attempt failed),
  `requestId` (from RSC.COR).
- **O2.** One `logger.warn`-level record when the loop exits with the
  last error, including `retry.reason` in
  `{"exhausted","budget","aborted","permanent","circuit_open"}`.
- **O3.** No log record for a first-attempt success (retry is
  transparent when nothing needed retrying).
- **O4.** The record schema must be stable — R5 scoring depends on it.

## 9. Invariants (verifiable)

The following must hold for any conformant implementation. Each is
checkable either statically (lint) or dynamically (contract test).

- **I1.** `maxAttempts == 1` produces exactly one invocation of the
  operation and no sleeps.
- **I2.** A `permanent` classification produces exactly one invocation.
- **I3.** For any run with `k` attempts (k >= 2), there are exactly
  `k - 1` sleeps whose sum is `>=` the sum of `baseDelayMs *
  2^(i-2)` lower bounds with jitter=`none`, and `<=` `maxDelayMs *
  (k - 1)` upper bound.
- **I4.** No attempt begins after `totalBudgetMs` has elapsed
  (measured from the primitive's entry, not from attempt 1).
- **I5.** On abort, the number of attempts started is `<=` the number
  observed before the abort signal fired.
- **I6.** The last error raised by the primitive is either the last
  operation error, an `AbortError`, or a `BudgetExceededError` — never
  a generic wrapper that erases the classified cause.
- **I7.** A run that observes a circuit-breaker rejection stops
  immediately with `retry.reason = "circuit_open"` and does not sleep.

## 10. Integration with the Runtime Standard (R2)

- **R2.CTX** — retry lives inside a handler already bound to a
  `RequestContext`; the primitive must accept the context (or its
  `requestId` + `AbortSignal`) rather than reading globals.
- **R2.COR (RC-002)** — `requestId` must be forwarded through the
  operation being retried (typically via `X-Request-ID` on
  `fetchWithTimeout`). This is a property of the caller, but the retry
  primitive must not strip it between attempts.
- **R2.TMO (RC-007)** — the operation retried is expected to be
  `fetchWithTimeout` or an equivalent timeout-bounded call. The retry
  primitive itself does not add a second timeout layer; it composes
  with RSC.TMO via §7.
- **R2.HTMO (RC-008)** — rule B2 preserves handler budget compliance.
- **R2.ERR (RC-005)** — when the last error escapes the handler, it
  must serialize through `createErrorResponse`. The retry primitive
  raises typed errors so the handler can classify them, not
  pre-formatted HTTP responses.
- **R2.APM (RC-009)** — retry metrics are additive to the standard
  `performance_metrics` row; they do not replace it.

## 11. Conformance criteria

An implementation is R3-A-conformant iff:

1. It exposes the properties in §5 as declared inputs (no hidden
   defaults besides those in this document).
2. It refuses to run when B1, B2, B3, or C3 would be violated.
3. It emits the observability records in §8 with the field names as
   written.
4. It passes contract tests derived from invariants I1–I7.
5. It does **not** classify errors implicitly beyond the default
   classifier of §4.
6. It does **not** silently succeed on a `permanent` error mid-loop.

## 12. Deferred decisions

Recorded here, resolved in later blocks — **not** during R3.

- **D1.** Retry statistics aggregation destination (dedicated table vs.
  extension of `performance_metrics`). Resolved in R4-prep.
- **D2.** Whether the classifier is expressed as a pure function or as
  a registry keyed by error `code`. Resolved in R4-prep together with
  R3-B (which shares the classification).
- **D3.** Naming and public signature of the primitive. Explicitly
  **out of scope for R3-A** by user directive.
- **D4.** Retry budget inheritance across nested calls
  (`retry(retry(...))`). Resolved in R4-prep; provisionally forbidden.
- **D5.** Deno vs. browser parity — R3 targets the Edge runtime; a
  browser twin, if any, is decided post-R5.
