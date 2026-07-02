# R3-B — Circuit Breaker RFC

> **Status:** Draft (design-only, awaiting approval)
> **Depends on:** R2 Runtime Standard RFC v1, R3-A Retry/Backoff RFC
> **Successor blocks:** R4-prep, R4, R5
>
> **Scope discipline (non-negotiable):**
> Specification only. No code under `supabase/functions/`, no code under
> `_shared/`, no new helpers, no signature changes, no prototypes. The
> existing `_shared/ai-circuit-breaker.ts` and `src/lib/circuit-breaker.ts`
> are **domain-specific implementations** and are neither modified nor
> promoted to the generic primitive by this document.
>
> **Closure criterion:** two independent implementations built from this
> RFC must produce compatible behaviour (identical state transitions
> given the same event trace) without further interpretation.

---

## 1. Problem

The platform has two coexisting breakers:

- `_shared/ai-circuit-breaker.ts` — module-scoped, AI-specific, tracks a
  single global circuit per Edge worker.
- `src/lib/circuit-breaker.ts` — front-end, per-instance, three-state
  (CLOSED / OPEN / HALF_OPEN) with an explicit `isProbing` guard.

R1.5 confirmed that no *generic* circuit-breaker primitive exists at the
runtime layer. Every new caller that needs one either duplicates the AI
version, invents a private one, or has no breaker at all — the most
common outcome.

R3-B defines the properties a generic circuit-breaker primitive must
satisfy so that all future adopters (including a future re-basing of the
two existing implementations) behave the same way.

## 2. Use cases (in scope)

A circuit breaker is designed to protect the caller from a dependency
that is failing in a way retry cannot fix within one request:

1. **External providers** with sustained elevated error rates or
   latency (AI, Stripe, webhook receivers).
2. **Internal Edge Functions** invoked function-to-function when the
   callee is temporarily overloaded.
3. **Database RPCs** that begin timing out under admission-control
   pressure.
4. **Any dependency** whose failure would otherwise cause
   caller-side timeout amplification (retries × attempts × timeout).

## 3. Non-use cases (out of scope)

Not appropriate for:

1. **Per-request validation errors** — those are `permanent` in R3-A
   terms and never a breaker signal.
2. **RLS denials** — a policy decision is not a failure.
3. **Cold-start latency** — a first slow call is not evidence of
   sustained failure.
4. **Batched background jobs** where fail-fast on `OPEN` would drop
   work; those need a queue with retry policy, not a breaker.
5. **`serveHoneypot`** — the honeypot must remain indistinguishable from
   a normal endpoint; a breaker rejection is a fingerprint.

## 4. States

The breaker is a finite-state machine with exactly three states:

- **`CLOSED`** — requests flow through; failures and successes update
  the failure window.
- **`OPEN`** — requests are rejected immediately with a typed
  `CircuitOpenError`; no downstream call is made.
- **`HALF_OPEN`** — a limited number of *probe* requests are allowed
  through; all other requests are rejected as if the breaker were
  `OPEN`.

There is no fourth state. `HALF_OPEN` is not a "warmup" or "degraded"
mode; it is strictly a probing window.

## 5. Transitions

Let `f` = failure count in the current rolling window,
`s` = consecutive successes in `HALF_OPEN`,
`Ft` = `failureThreshold`, `St` = `successThreshold`,
`T_open` = `openTimeoutMs`, `now` = wall clock.

- **T1. CLOSED → OPEN.** When `f >= Ft` in the rolling window. Sets
  `openedAt = now`.
- **T2. OPEN → HALF_OPEN.** On the first request received after
  `now >= openedAt + T_open`. The transition is *demand-driven* — the
  breaker never becomes `HALF_OPEN` in the absence of traffic.
- **T3. HALF_OPEN → CLOSED.** When `s >= St` consecutive probe
  successes complete.
- **T4. HALF_OPEN → OPEN.** On the first probe failure. Resets `s = 0`
  and `f = 0`; sets `openedAt = now`.
- **T5. CLOSED → CLOSED.** On success: successes do not decrement `f`
  directly; the rolling window (§6) removes old failures.
- **T6. Manual reset.** An operator-invoked `reset()` forces `CLOSED`
  and clears counters. This exists for runbooks only; production code
  must not call it.

Illegal transitions (`CLOSED → HALF_OPEN`, `OPEN → CLOSED`,
`HALF_OPEN → HALF_OPEN`) must be unrepresentable.

## 6. Opening criteria

The failure signal is measured over a **rolling time window**, not an
unbounded counter.

| Property             | Definition                                                    | Default   |
| -------------------- | ------------------------------------------------------------- | --------- |
| `failureThreshold`   | Failures within `rollingWindowMs` that trigger `OPEN`.        | `5`       |
| `rollingWindowMs`    | Window size for counting failures.                            | `30_000`  |
| `minimumThroughput`  | Minimum requests in window before `OPEN` is considered.       | `10`      |
| `errorRateThreshold` | Optional. If set, opens when observed error rate exceeds it *and* `minimumThroughput` is reached. | `0.5` |

Normative rules:

- **O1.** A single failure never opens a `CLOSED` breaker unless
  `failureThreshold == 1` (test-only configuration).
- **O2.** `minimumThroughput` prevents opening on 1/1 failure ratios.
- **O3.** Only errors classified `transient` **or** `unknown` by R3-A
  §4 count as failures for the breaker. `permanent` errors (validation,
  auth, RLS) do **not** open the breaker. Rationale: a breaker
  reflects dependency health, not caller correctness.

## 7. Closing criteria (HALF_OPEN → CLOSED)

- **HC1.** `successThreshold` consecutive probe successes.
- **HC2.** Concurrent probes are bounded: at most
  `halfOpenMaxConcurrent` requests may be in-flight during `HALF_OPEN`.
  Additional requests receive `CircuitOpenError` with
  `reason = "half_open_saturated"`.
- **HC3.** A probe that itself times out (RSC.TMO) counts as a
  failure and triggers T4.
- **HC4.** Manual `reset()` (T6) does not require probe successes.

| Property                | Definition                              | Default |
| ----------------------- | --------------------------------------- | ------- |
| `successThreshold`      | Successes needed to close from HALF_OPEN. | `2`   |
| `halfOpenMaxConcurrent` | Concurrent probes allowed in HALF_OPEN. | `1`     |
| `openTimeoutMs`         | Time in `OPEN` before HALF_OPEN.        | `30_000` |

## 8. Interaction with Retry (R3-A)

- **RI1.** A `CircuitOpenError` is `permanent` from the retry
  primitive's perspective (R3-A §3.5, §4). Retry must not sleep-and-try
  through an open breaker.
- **RI2.** When retry is composed with breaker, the ordering is
  fixed: **breaker outer, retry inner** is forbidden; retry outer,
  breaker inner is required. Rationale: the breaker's rejection is the
  final answer for this dependency for the current `openTimeoutMs`
  window.
- **RI3.** Retry statistics do **not** feed the breaker directly. Each
  attempt's outcome (success / classified failure) reaches the
  breaker exactly once, through the shared classifier.

## 9. Interaction with Timeout (RSC.TMO / RSC.HTMO)

- **TI1.** A timed-out downstream call (RSC.TMO / `fetchWithTimeout`) is
  a failure signal to the breaker, provided the classifier maps it to
  `transient`.
- **TI2.** `CircuitOpenError` is raised **synchronously** — the caller
  spends no timeout budget waiting.
- **TI3.** In `HALF_OPEN`, probe requests still respect RSC.TMO and
  RSC.HTMO. The breaker does not extend budgets.

## 10. Observability

The breaker must emit:

- **M1.** A state-transition log record at `info` for T1, T2, T3, T4,
  T6, with fields: `breaker.name`, `breaker.from`, `breaker.to`,
  `breaker.reason`, `requestId` (when available).
- **M2.** A metric per state (gauge): current state per named breaker.
- **M3.** A counter per rejection: `breaker.rejected_total{name,reason}`
  where `reason ∈ {"open","half_open_saturated"}`.
- **M4.** A counter per outcome fed to the breaker: `breaker.calls_total
  {name,outcome}` with `outcome ∈ {"success","failure","ignored"}`.
  `ignored` covers `permanent`-class errors that did not affect state.
- **M5.** No log per accepted call in `CLOSED` — otherwise the breaker
  becomes its own noise source.

## 11. Invariants (verifiable)

- **CI1.** State is always exactly one of `{CLOSED, OPEN, HALF_OPEN}`.
- **CI2.** In `OPEN`, no user-supplied function is ever invoked.
- **CI3.** In `HALF_OPEN`, at most `halfOpenMaxConcurrent` user-supplied
  functions run concurrently.
- **CI4.** T3 requires exactly `successThreshold` consecutive
  successes — a single interleaved failure in `HALF_OPEN` triggers T4.
- **CI5.** Failures whose R3-A class is `permanent` never advance the
  failure counter (§6.O3).
- **CI6.** `openTimeoutMs` elapses in wall-clock time regardless of
  traffic; the transition to `HALF_OPEN` is triggered on the next
  request only (T2).
- **CI7.** Concurrent callers observing `OPEN` all receive
  `CircuitOpenError` — no caller "wins" and enters the underlying call.
- **CI8.** `reset()` produces the same state as a freshly constructed
  breaker with the same configuration.

## 12. Integration with the Runtime Standard (R2)

- **R2.CTX** — the breaker accepts (or is bound to) a
  `RequestContext` so that its logs carry `requestId`.
- **R2.LOG (RC-003)** — all breaker logs go through the standard
  logger; no `console.*`.
- **R2.ERR (RC-005)** — `CircuitOpenError` is a typed error;
  serialization to the outgoing HTTP response happens at the handler
  boundary via `createErrorResponse`, not inside the breaker.
- **R2.APM (RC-009)** — breaker gauges and counters are additive to
  `performance_metrics`; they do not modify its schema.

## 13. Conformance criteria

An implementation is R3-B-conformant iff:

1. It exposes exactly the states in §4 and the transitions in §5.
2. It respects §6 opening criteria including `minimumThroughput` and
   the `permanent`-exclusion rule.
3. It implements `HALF_OPEN` probing with the concurrency bound in §7.
4. It composes with R3-A retry per §8, in particular rule RI2.
5. It emits the observability records in §10 with the field names as
   written.
6. It satisfies invariants CI1–CI8, verifiable by contract tests over
   scripted event traces.
7. It does **not** consult external state (DB, KV) for state
   transitions — the breaker is per-instance. Cross-instance
   coordination is out of scope (see D3 below).

## 14. Deferred decisions

- **D1.** Distributed / cross-worker breaker coordination (e.g. via
  Redis, KV, or a shared table). Explicitly deferred; R3-B is
  per-instance.
- **D2.** Adaptive thresholds based on historical baseline.
- **D3.** Public API surface and construction pattern (module factory
  vs. class vs. context-scoped registry). Resolved in R4-prep.
- **D4.** Migration path for `_shared/ai-circuit-breaker.ts` and
  `src/lib/circuit-breaker.ts` onto the generic primitive. Recorded
  as an R4 concern, not an R3 one.
- **D5.** Whether a fallback callback (returning a synthesized response
  on `OPEN`) is part of the primitive or a caller concern. Provisional
  answer: caller concern, to keep the primitive's contract minimal.
