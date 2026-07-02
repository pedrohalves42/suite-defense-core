# R3.1 — Editorial Freeze

**Status:** Normative addendum to R3-A / R3-B / R3-C
**Scope:** Documentation only. No code, migrations, or API changes.
**Purpose:** Eliminate the remaining ambiguities that would let two independent implementations diverge on edge cases, and lock the versioning discipline before R4 begins.

---

## 0. Precedence

This document is normative and takes precedence over any conflicting language in R3-A, R3-B, or R3-C. When the parent RFCs are revised, the clauses below must be merged in verbatim or explicitly superseded via the versioning rule in §6.

---

## 1. Retry — Deterministic Classification (R3-A addendum)

A retry decision MUST be a pure function of the following inputs, and only these inputs:

1. Error category (as produced by the mandatory classifier: `transient` | `permanent` | `unknown`).
2. HTTP method of the outbound call (`GET`, `HEAD`, `PUT`, `DELETE`, `OPTIONS` are idempotent by protocol; `POST`, `PATCH` are non-idempotent unless an idempotency key is present).
3. Idempotency context: whether the call carries an idempotency key under R3-C, or the operation is declared idempotent by the caller.
4. Remaining budget: `remainingBudgetMs > 0` AND `attempt < maxAttempts`.

Prohibited inputs to the classifier: caller identity, tenant, wall-clock time of day, RNG (other than jitter applied AFTER the decision), logger state, or any ambient module-level variable.

**Invariant R3-A/D1.** Given identical values of the four inputs above, every conformant implementation MUST return the same `{retry: bool, delayMs: number}` decision (delay compared modulo the jitter interval).

**Invariant R3-A/D2.** `unknown` errors on non-idempotent methods without an idempotency key MUST NOT be retried.

---

## 2. Circuit Breaker — Statistical Window (R3-B addendum)

The breaker MUST use a **sliding time window** — not a fixed-count window, not a fixed calendar window.

Frozen parameters:

| Parameter          | Value / Rule                                                                 |
| ------------------ | ---------------------------------------------------------------------------- |
| Window type        | Sliding time window                                                          |
| Default width      | `10s`                                                                        |
| Minimum width      | `1s`                                                                         |
| Maximum width      | `60s`                                                                        |
| Bucket granularity | ≤ `1s` (implementation MAY use finer buckets; MUST NOT use coarser)          |
| `minimumThroughput`| Evaluated over the same sliding window; below threshold ⇒ breaker stays CLOSED regardless of failure ratio |
| Failure ratio      | `failures / (failures + successes)` within the current window                |

**Invariant R3-B/W1.** Two implementations fed the identical event stream (timestamped successes / failures) MUST agree on the state transitions to within one bucket of jitter.

**Invariant R3-B/W2.** Events older than `windowMs` MUST NOT influence the current decision.

---

## 3. Idempotency — Payload Canonicalization (R3-C addendum)

Replay detection MUST compare payloads using a canonical form, not raw bytes.

Frozen algorithm:

1. Parse the request body as JSON. If parsing fails, the request is not eligible for idempotent replay (treat as new; the caller is responsible for stable serialization).
2. Recursively sort object keys lexicographically (UTF-8 codepoint order). Arrays keep their order — array order is semantically significant.
3. Serialize with:
   - No insignificant whitespace.
   - Numbers in shortest round-trip form (per ECMA-404 / RFC 8259).
   - Strings NFC-normalized.
4. Compute `SHA-256` over the canonical bytes. Store the hex digest as `payload_fingerprint`.

Replay rules (unchanged from R3-C, restated for clarity):

| `(scope, key)` exists? | `payload_fingerprint` matches? | Result                                                     |
| ---------------------- | ------------------------------ | ---------------------------------------------------------- |
| No                     | —                              | Execute; store `(scope, key, fingerprint, response)`.      |
| Yes                    | Yes                            | **Replay** the stored response.                            |
| Yes                    | No                             | **Conflict** — return `409` per R3-C.                      |

**Invariant R3-C/C1.** `{"a":1,"b":2}` and `{"b":2,"a":1}` MUST produce the same `payload_fingerprint`.
**Invariant R3-C/C2.** `[1,2]` and `[2,1]` MUST produce different fingerprints.

Non-JSON bodies (binary uploads, form-data): fingerprint is `SHA-256` of the raw bytes; canonicalization does not apply.

---

## 4. Pipeline Order (cross-RFC)

The runtime pipeline order is frozen as:

```
Request
  → Rate Limit
  → Idempotency         (short-circuits to stored response on replay)
  → Retry               (outer)
    → Circuit Breaker   (inner)
      → Timeout
        → Business Logic
  → Audit
  → Response
```

Rationale for each ordering choice:

- **Rate Limit first.** Cheapest rejection; protects every downstream stage. Rate-limited requests never consume idempotency slots.
- **Idempotency before Retry.** A replayed response must be indistinguishable from the original; retrying a replay would be double work.
- **Retry outer, Breaker inner.** Consistent with R3-B §Composition: the breaker sees each individual attempt so it can count failures correctly; the retry loop sees breaker rejections as terminal (`fail fast`) and stops.
- **Timeout innermost.** Bounds a single attempt; the retry budget bounds the total.
- **Audit after Business Logic.** Audits the effective outcome, including replays and breaker rejections.

**Invariant P1.** Implementations MUST NOT reorder these stages. Adding stages (e.g., tracing, tenant assertion) is allowed only at positions that do not alter the observable behavior of the frozen stages.

---

## 5. Behavior Tables (verifiable conformance)

Each RFC is closed only when its implementation passes the table below.

### 5.1 Retry (R3-A)

| Case                                              | Method | Idempotent? | Budget left | Required outcome |
| ------------------------------------------------- | ------ | ----------- | ----------- | ---------------- |
| Network timeout                                   | any    | any         | yes         | retry            |
| `429 Too Many Requests`                           | any    | any         | yes         | retry (honor `Retry-After` if present) |
| `503 Service Unavailable`                         | any    | any         | yes         | retry            |
| `500 Internal Server Error`                       | GET/PUT/DELETE | — | yes | retry            |
| `500 Internal Server Error`                       | POST   | no          | yes         | never retry      |
| `500 Internal Server Error`                       | POST   | yes (key)   | yes         | retry            |
| `400 Bad Request`                                 | any    | any         | any         | never retry      |
| `401 Unauthorized`                                | any    | any         | any         | never retry      |
| `403 Forbidden`                                   | any    | any         | any         | never retry      |
| `404 Not Found`                                   | any    | any         | any         | never retry      |
| `422 Unprocessable Entity`                        | any    | any         | any         | never retry      |
| `AbortSignal` fired                               | any    | any         | any         | never retry      |
| Budget exhausted                                  | any    | any         | no          | never retry (return last error) |
| `unknown` category, non-idempotent, no key        | POST   | no          | yes         | never retry      |

### 5.2 Circuit Breaker (R3-B)

| Case                                                                 | Required outcome                          |
| -------------------------------------------------------------------- | ----------------------------------------- |
| Below `minimumThroughput` in window                                  | stay CLOSED regardless of failure ratio   |
| Failure ratio ≥ threshold with sufficient throughput                 | transition CLOSED → OPEN                  |
| Call while state = OPEN and `now < nextAttemptAt`                    | fail fast (no downstream call)            |
| Call while state = OPEN and `now ≥ nextAttemptAt`                    | transition to HALF_OPEN; single probe     |
| Probe succeeds `successThreshold` times in HALF_OPEN                 | transition HALF_OPEN → CLOSED             |
| Any failure in HALF_OPEN                                             | transition HALF_OPEN → OPEN               |
| Concurrent calls in HALF_OPEN                                        | at most one probe; others fail fast       |
| Permanent error (per R3-A classifier)                                | does NOT count toward breaker failures    |

### 5.3 Idempotency (R3-C)

| Case                                                                 | Required outcome                          |
| -------------------------------------------------------------------- | ----------------------------------------- |
| First request with `(scope, key)`                                    | execute; persist `(fingerprint, response, ttl)` |
| Repeat request, same `(scope, key)`, same fingerprint                | replay stored response                    |
| Repeat request, same `(scope, key)`, different fingerprint           | `409 Conflict`                            |
| Repeat request after retention window expired                        | treat as new; execute                     |
| Different `scope`, same `key`                                        | execute (keys are scoped)                 |
| Different `key`, same `scope`                                        | execute                                   |
| In-flight duplicate before first request completes                   | second request waits or receives `409` (implementation choice, MUST be deterministic per instance) |
| Request without idempotency key                                      | bypass idempotency layer entirely         |

---

## 6. Versioning Discipline

Effective on approval of R3.1, all three RFCs are frozen at **v1.0**.

- Any change to a normative clause requires a version bump: `v1.0 → v1.1` (backward-compatible clarification) or `v1.0 → v2.0` (behavior change).
- Version bumps MUST include a changelog entry naming the clause, the reason, and the migration impact on existing implementations.
- Non-normative fixes (typos, prose) do NOT bump the version; they are recorded as editorial revisions in the file header.
- Behavior tables in §5 are normative. Adding a row is `v1.x+1`; changing an existing row is `v2.0`.

---

## 7. Closure Criteria for R3

R3 (composed of R3-A, R3-B, R3-C, and this R3.1 addendum) is considered closed when:

1. The four ambiguities above are resolved in-document (this file satisfies that).
2. Each RFC exposes a behavior table in the form of §5 (this file provides them; the parent RFCs may cross-reference).
3. The versioning rule in §6 is in effect.

Only after closure may R4-prep begin. R4-prep will translate these frozen properties into concrete API signatures, DDL, and telemetry hooks — with no further latitude to reinterpret the semantics above.
