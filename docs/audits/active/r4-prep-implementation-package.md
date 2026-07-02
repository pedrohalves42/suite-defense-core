# R4-prep — Implementation Preparation Package

**Status:** Design-only. No runtime code, no migrations, no signature changes to existing `_shared/` modules.
**Depends on:** R2 RFC v1.0, R3-A v1.0, R3-B v1.0, R3-C v1.0, R3.1 v1.0.
**Purpose:** Produce everything R4 needs to implement the three reliability primitives without taking further architectural decisions.

---

## 0. Ground Rules

1. This package is the sole source of implementation guidance for R4. Any question not answered here must be resolved by amending an RFC (with a version bump per R3.1 §6), not by improvising during R4.
2. Backward compatibility with the existing `_shared/` surface is mandatory. Zero breaking changes for callers of `serve-*`, `logger`, `fetch-with-timeout`, `ai-circuit-breaker`, `rate-limit-middleware`, `request-context`, `timeout`.
3. New modules live under `_shared/reliability/` and are opt-in. Existing wrappers may be re-implemented on top of the new primitives in a later block (R4-adoption), not in R4 itself.

---

## 1. Module Layout

```
supabase/functions/_shared/reliability/
├── index.ts                    # public surface (re-exports)
├── errors.ts                   # ClassifiedError, ErrorCategory, classifier contract
├── retry.ts                    # withRetry
├── circuit-breaker.ts          # CircuitBreaker (generic, R3-B compliant)
├── idempotency.ts              # withIdempotency
├── pipeline.ts                 # composePipeline (enforces R3.1 §4 order)
├── telemetry.ts                # emit hooks (no transport)
└── __tests__/
    ├── retry.behavior.test.ts        # Behavior Table 5.1
    ├── circuit-breaker.behavior.test.ts  # Behavior Table 5.2
    ├── idempotency.behavior.test.ts  # Behavior Table 5.3
    └── pipeline.order.test.ts        # Pipeline invariant P1
```

The existing `_shared/ai-circuit-breaker.ts` stays untouched. In R4-adoption it will be re-expressed as a thin adapter over `reliability/circuit-breaker.ts` while preserving its current exported functions.

---

## 2. API Specification

All types are TypeScript. Values in `Readonly<...>` form to prevent accidental mutation across attempts.

### 2.1 Errors (`errors.ts`)

```ts
export type ErrorCategory = 'transient' | 'permanent' | 'unknown';

export interface ClassifiedError {
  readonly category: ErrorCategory;
  readonly status?: number;            // HTTP status if applicable
  readonly retryAfterMs?: number;      // honored by retry when transient
  readonly cause: unknown;             // original error preserved
  readonly code?: string;              // optional stable identifier
}

export interface ErrorClassifier {
  (err: unknown, ctx: ClassificationContext): ClassifiedError;
}

export interface ClassificationContext {
  readonly method: 'GET' | 'HEAD' | 'PUT' | 'DELETE' | 'OPTIONS' | 'POST' | 'PATCH';
  readonly idempotent: boolean;        // true if method is idempotent OR idempotency key present
}

// Default classifier — MUST implement the R3-A/§5.1 mapping verbatim.
export const defaultClassifier: ErrorClassifier;
```

### 2.2 Retry (`retry.ts`)

```ts
export interface RetryOptions {
  readonly maxAttempts: number;        // >= 1
  readonly baseDelayMs: number;        // >= 1
  readonly maxDelayMs: number;         // >= baseDelayMs
  readonly totalBudgetMs: number;      // hard ceiling incl. jitter
  readonly jitter: 'full' | 'equal';   // R3-A: jitter mandatory
  readonly classifier?: ErrorClassifier;
  readonly signal?: AbortSignal;
  readonly method: ClassificationContext['method'];
  readonly idempotent: boolean;
  readonly onAttempt?: (info: RetryAttemptInfo) => void;
}

export interface RetryAttemptInfo {
  readonly attempt: number;            // 1-based
  readonly elapsedMs: number;
  readonly remainingBudgetMs: number;
  readonly lastError?: ClassifiedError;
}

export function withRetry<T>(
  fn: (info: RetryAttemptInfo) => Promise<T>,
  opts: RetryOptions,
): Promise<T>;
```

Invariants enforced by implementation:

- `totalBudgetMs <= handlerTimeoutMs - elapsed` (caller responsibility; docs must state it).
- Delay for attempt `n` (before jitter): `min(baseDelayMs * 2^(n-1), maxDelayMs)`.
- Jitter MUST be applied AFTER the deterministic classification decision (per R3.1 §1).

### 2.3 Circuit Breaker (`circuit-breaker.ts`)

```ts
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  readonly name: string;
  readonly windowMs: number;           // 1000..60000 (R3.1 §2)
  readonly bucketMs?: number;          // <= 1000, default 1000
  readonly failureThreshold: number;   // ratio 0..1
  readonly minimumThroughput: number;  // events required in window before evaluating
  readonly openStateMs: number;        // OPEN duration
  readonly successThreshold: number;   // HALF_OPEN -> CLOSED
  readonly classifier?: ErrorClassifier;
  readonly onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreaker {
  constructor(opts: CircuitBreakerOptions);
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): CircuitState;
  getStats(): Readonly<{ failures: number; successes: number; windowMs: number }>;
  reset(): void;
}
```

Semantic notes:

- Sliding window with buckets ≤ `1s` (R3.1 §2).
- `permanent` errors (per classifier) do NOT count toward the failure ratio (Behavior Table 5.2 last row).
- At most one probe in HALF_OPEN; concurrent callers fail fast.

### 2.4 Idempotency (`idempotency.ts`)

```ts
export interface IdempotencyKey {
  readonly scope: string;              // e.g. 'jobs.create'
  readonly key: string;                // caller-provided
}

export interface IdempotencyStore {
  get(k: IdempotencyKey): Promise<StoredIdempotencyRecord | null>;
  put(k: IdempotencyKey, rec: StoredIdempotencyRecord): Promise<'inserted' | 'exists'>;
}

export interface StoredIdempotencyRecord {
  readonly fingerprint: string;        // sha256 hex
  readonly responseBody: string;
  readonly responseStatus: number;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly createdAt: string;          // ISO 8601
  readonly expiresAt: string;          // ISO 8601
}

export interface IdempotencyOptions {
  readonly key: IdempotencyKey;
  readonly body: unknown;              // JSON-serializable OR raw Uint8Array
  readonly retentionMs: number;        // 24h..30d (R3-C)
  readonly store: IdempotencyStore;
}

export type IdempotencyOutcome<T> =
  | { readonly kind: 'executed'; readonly value: T }
  | { readonly kind: 'replayed'; readonly stored: StoredIdempotencyRecord }
  | { readonly kind: 'conflict' };     // caller must return 409

export function withIdempotency<T>(
  fn: () => Promise<T>,
  opts: IdempotencyOptions,
): Promise<IdempotencyOutcome<T>>;

// Deterministic canonicalization per R3.1 §3.
export function canonicalFingerprint(body: unknown): string;
```

### 2.5 Pipeline (`pipeline.ts`)

```ts
export interface PipelineStages {
  rateLimit?:   (req: Request) => Promise<Response | null>;
  idempotency?: (req: Request) => Promise<Response | null>;
  retry?:       <T>(fn: () => Promise<T>) => Promise<T>;
  breaker?:     <T>(fn: () => Promise<T>) => Promise<T>;
  timeout?:     <T>(fn: () => Promise<T>) => Promise<T>;
  business:     (req: Request) => Promise<Response>;
  audit?:       (req: Request, res: Response) => Promise<void>;
}

export function composePipeline(stages: PipelineStages): (req: Request) => Promise<Response>;
```

The composer enforces R3.1 §4 order at construction time. Skipping stages is allowed; reordering is not.

---

## 3. DDL — Idempotency Store

Single new table. Follows project's grant discipline.

```sql
CREATE TABLE public.idempotency_records (
  scope             text        NOT NULL,
  key               text        NOT NULL,
  tenant_id         uuid        NOT NULL,
  fingerprint       text        NOT NULL,     -- sha256 hex, 64 chars
  response_status   smallint    NOT NULL,
  response_headers  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  response_body     text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  PRIMARY KEY (scope, key, tenant_id)
);

CREATE INDEX idempotency_records_expires_at_idx
  ON public.idempotency_records (expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.idempotency_records TO authenticated;
GRANT ALL ON public.idempotency_records TO service_role;

ALTER TABLE public.idempotency_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "idempotency_tenant_isolation"
  ON public.idempotency_records
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_active_tenant_id())
  WITH CHECK (tenant_id = public.get_active_tenant_id());
```

Cleanup: a scheduled job (`DELETE ... WHERE expires_at < now()`) — spec only, R4 implements.

Circuit breaker and retry are stateless-per-process; no DDL.

---

## 4. Telemetry Contract

New primitives emit through the existing `logger` (structured logging, no `console.log`). Event names are frozen here.

| Event                              | Fields (all required unless noted)                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `reliability.retry.attempt`        | `requestId`, `traceId`, `attempt`, `elapsedMs`, `remainingBudgetMs`, `errorCategory?`, `status?`   |
| `reliability.retry.exhausted`      | `requestId`, `traceId`, `attempts`, `totalElapsedMs`, `lastCategory`, `lastStatus?`                |
| `reliability.breaker.state`        | `requestId`, `traceId`, `name`, `from`, `to`, `failures`, `successes`, `windowMs`                  |
| `reliability.breaker.rejected`     | `requestId`, `traceId`, `name`, `nextAttemptAt`                                                    |
| `reliability.idempotency.hit`      | `requestId`, `traceId`, `scope`, `outcome` ∈ {`replayed`,`conflict`,`executed`}, `fingerprint8`    |
| `reliability.idempotency.expired`  | `requestId`, `traceId`, `scope`                                                                    |

`fingerprint8` is the first 8 hex chars only — never log the full fingerprint or the payload.

---

## 5. Migration Strategy for Existing Wrappers

Zero behavior change in R4. Adapter mapping to be implemented in R4-adoption:

| Existing surface                                       | R4-adoption plan                                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `_shared/ai-circuit-breaker.ts` (`withCircuitBreaker`) | Re-implement internally over `reliability/circuit-breaker.ts` with a domain-specific instance. Public functions and return shape unchanged. |
| `_shared/timeout.ts` (`withTimeout`)                   | Kept as-is. Recommended as the innermost stage in `composePipeline`.                                 |
| `_shared/rate-limit-middleware.ts`                     | Kept as-is. Wired as `rateLimit` stage in `composePipeline`.                                         |
| `_shared/request-context.ts`                           | Kept as-is. `requestId`/`traceId` propagate into telemetry events.                                   |
| `serve-*` handlers                                     | No signature change. Handlers may opt into `composePipeline` incrementally.                          |
| Frontend `src/lib/circuit-breaker.ts`                  | Out of scope. This RFC targets the Edge runtime only.                                                |

**Compatibility guarantee:** no existing call site is required to change during R4. Adoption is opt-in, one Edge Function at a time, and each migration is a separate PR with before/after behavior evidence.

---

## 6. Conformance Test Matrix

Derived directly from R3.1 §5. Each row becomes at least one `vitest` case under `_shared/reliability/__tests__/`.

- Retry: 13 cases from Behavior Table 5.1 → `retry.behavior.test.ts`.
- Circuit Breaker: 8 cases from Behavior Table 5.2 → `circuit-breaker.behavior.test.ts`.
- Idempotency: 8 cases from Behavior Table 5.3 → `idempotency.behavior.test.ts`.
- Pipeline: 1 order invariant + 1 skip-allowed test + 1 reorder-rejected test → `pipeline.order.test.ts`.
- Canonicalization: property test — random JSON objects with permuted key order MUST produce identical fingerprints; array permutations MUST NOT.

CI gate (spec only; wiring in R4): all four test files must pass before any Edge Function may declare `reliability@v1` in its manifest.

---

## 7. Impact Map

### 7.1 `_shared/` impact

- **New files only.** Nothing under `_shared/` outside `reliability/` is modified in R4.
- No changes to existing exports, no re-exports from `_shared/index` unless explicitly added (additive only).

### 7.2 Edge Function impact

- Zero functions modified in R4. Adoption tracked separately in R4-adoption, one function at a time.
- Candidates for first adoption (informational, non-binding): functions that already carry ad-hoc retry loops or manual timeout composition. Selection deferred to R4-adoption.

### 7.3 Database impact

- One new table (`public.idempotency_records`) with RLS and grants per project standard.
- One scheduled cleanup job.
- No changes to existing tables, functions, or policies.

### 7.4 Frontend impact

- None. Frontend `src/lib/circuit-breaker.ts` is unrelated and remains untouched.

---

## 8. Out of Scope for R4

Explicitly deferred:

- Adoption in specific Edge Functions (R4-adoption).
- Retrofitting `_shared/ai-circuit-breaker.ts` onto the new primitive (R4-adoption).
- Reliability Score dashboard (R5).
- Frontend reliability primitives.
- Distributed circuit-breaker state across cold starts (documented as a known limitation; may become R6 if warranted).

---

## 9. Closure Criteria for R4-prep

R4-prep is complete when a reviewer can answer YES to all of:

1. Can R4 be implemented from this document without opening any RFC?
2. Does every public type / function signature appear in §2?
3. Is every behavior in R3.1 §5 covered by a test in §6?
4. Is the impact on `_shared/`, Edge Functions, DB, and frontend explicit in §7?
5. Are backward-compatibility guarantees explicit and zero-breaking?

If any answer is NO, R4-prep is not closed and the gap must be filled here (or the relevant RFC bumped) before R4 begins.
