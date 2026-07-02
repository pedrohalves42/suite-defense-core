# R2 — Runtime Standard RFC v1

> **Status:** Draft, spec-first, READ-ONLY.
> **Nature:** Internal RFC. Normative contract for the Edge Function runtime.
> **Scope discipline:** This RFC does not change code. It documents the
> contract that R4 will adopt and R5 will measure against. Any change to a
> helper's public surface is deferred to a separate authorized block.
> **Predecessors:** R1 (observability inventory), R1.5 (runtime capability inventory).
> **Successors:** R3 (reliability primitives — design), R4 (adoption), R5 (Reliability Score).

---

## 1. Purpose

Define a single, unambiguous execution contract that every Edge Function
under `supabase/functions/` must satisfy. The contract is expressed in
terms of **capabilities** and **entry points**, not in terms of per-file
instrumentation, so that adoption can be measured objectively during R4
and any given function can be classified as **Runtime Standard Compliant
(RSC)** or not.

Normative keywords in this document ("MUST", "MUST NOT", "SHOULD",
"SHOULD NOT", "MAY", "OPTIONAL", "PROHIBITED") follow RFC 2119.

## 2. Non-goals of this RFC

- Change any file under `supabase/functions/`.
- Change the public surface of `logger`, `serve-tenant`, `serve-public`,
  `serve-internal`, `serve-agent`, `serve-honeypot`, `fetch-with-timeout`,
  `error-handler`, `apm`, `audit`, or `request-context`.
- Introduce retry, circuit breaker, or idempotency primitives. Those
  belong to R3.
- Rank, score, or compare functions. That belongs to R5.

If, while writing this RFC, we would need to modify a helper's public
surface, that requirement is recorded in **§10 Deferred architectural
decisions** and *not* implemented.

## 3. Entry-point contract

Every Edge Function MUST be served through exactly one of the five
runtime entry points already provided by `supabase/functions/_shared/`:

| Entry point       | Provider                              | When to use                                                     |
|-------------------|---------------------------------------|-----------------------------------------------------------------|
| `serveTenant`     | `_shared/serve-tenant.ts`             | Authenticated, tenant-scoped user requests (default)            |
| `servePublic`     | `_shared/serve-public.ts`             | Webhooks and unauthenticated endpoints                          |
| `serveAgent`      | `_shared/serve-agent.ts`              | Requests from the deployed agent (HMAC / device auth)           |
| `serveInternal`   | `_shared/serve-internal.ts`           | Service-to-service / scheduler-invoked functions                |
| `serveHoneypot`   | `_shared/serve-honeypot.ts`           | Honeypot decoy endpoints                                        |

- A function MUST NOT call `Deno.serve(...)` directly.
- A function MUST NOT re-implement request lifecycle handling (CORS,
  request ID, error normalization, tenant resolution).
- Composition of entry points inside a single function is PROHIBITED. A
  function is served by exactly one entry point.

Rationale: R1.5 measured a union fan-in of 72/74 across the five entry
points, i.e. the runtime already converges on this pattern. Formalizing
it removes ambiguity for the remaining functions and turns the pattern
into a testable invariant for R5.

## 4. Capability catalog (normative)

Each capability follows the same six-field structure. `Validation rule`
IDs are placeholders that R5 will implement; they are frozen here so R4
can be planned against them.

### 4.1 Request Context (`RSC.CTX`)

| Field        | Value                                                                                     |
|--------------|-------------------------------------------------------------------------------------------|
| Objective    | Every request has a stable identity used across logs, error responses, and downstream calls. |
| Status       | **MUST**                                                                                  |
| Provider     | `serve-tenant.ts` / `serve-public.ts` / `serve-agent.ts` / `serve-internal.ts` / `serve-honeypot.ts` (delegated to each entry point) |
| Public API   | `ctx.requestId: string`                                                                   |
| Behavior     | Entry point MUST read `X-Trace-ID` else `X-Request-ID` else generate `crypto.randomUUID()`. `ctx.requestId` MUST be non-empty. Response MUST echo the same value in header `X-Request-ID`. |
| Validation   | `RC-001` (property test: for any request, response header `X-Request-ID` is present and equals `ctx.requestId`). |

### 4.2 Correlation Propagation (`RSC.COR`)

| Field        | Value                                                                                     |
|--------------|-------------------------------------------------------------------------------------------|
| Objective    | Cross-function calls preserve the trace identity end-to-end.                              |
| Status       | **MUST** for functions that call other Edge Functions or external HTTPS services.         |
| Provider     | `_shared/fetch-with-timeout.ts` (`fetchWithTimeout`)                                     |
| Public API   | outbound `fetch` MUST forward `X-Request-ID: ctx.requestId`                              |
| Behavior     | Fan-out HTTP calls MUST include the current `requestId` as `X-Request-ID`. `X-Trace-ID` is OPTIONAL and, if present on the inbound request, MUST be forwarded verbatim. |
| Validation   | `RC-002` (static: any `fetch(` inside a function using an entry-point that does not delegate to `fetchWithTimeout` MUST attach `X-Request-ID`). |

### 4.3 Structured Logging (`RSC.LOG`)

| Field        | Value                                                                                     |
|--------------|-------------------------------------------------------------------------------------------|
| Objective    | All operational log records are queryable by `requestId`, level, and (when applicable) `tenantId` / `userId`. |
| Status       | **MUST**                                                                                  |
| Provider     | `_shared/logger.ts` (`logger`, `loggerWithContext`)                                      |
| Public API   | `ctx.logger` (bound instance created via `loggerWithContext({ requestId, tenantId?, userId? })`) |
| Behavior     | Functions MUST use `logger` / `loggerWithContext`. `console.log` / `console.error` are PROHIBITED except in `_shared/*` internal fallbacks. Log entries MUST carry `requestId`; entries emitted from tenant-scoped code paths MUST carry `tenantId`. |
| Validation   | `RC-003` (static: no `console.log|error|warn` in `supabase/functions/*/index.ts` and subfolders). |

### 4.4 Duration Tracking (`RSC.DUR`)

| Field        | Value                                                                                     |
|--------------|-------------------------------------------------------------------------------------------|
| Objective    | Every request emits an end-of-request record containing `duration_ms`.                    |
| Status       | **MUST**                                                                                  |
| Provider     | Entry points (`serve-*`) — MUST measure `startedAt = Date.now()` at request receipt and include `duration_ms` in the final log line.                                                        |
| Public API   | Automatic; no per-handler code required.                                                  |
| Behavior     | Duration is measured from entry-point invocation to response emission. `logger.timed(...)` MAY be used inside handlers for sub-operation timing.                                              |
| Validation   | `RC-004` (runtime probe: every response carries either `Server-Timing: total;dur=N` or an equivalent log record with `duration_ms`). |

### 4.5 Standardized Error Handling (`RSC.ERR`)

| Field        | Value                                                                                     |
|--------------|-------------------------------------------------------------------------------------------|
| Objective    | Every error response has a consistent shape and a machine-usable code.                    |
| Status       | **MUST**                                                                                  |
| Provider     | `_shared/error-handler.ts` (`ErrorCode`, `createErrorResponse`, `handleExceptionWithContext`) |
| Public API   | Handlers MUST either throw (caught by entry point) or return via `createErrorResponse(code, message, status, requestId)`. |
| Behavior     | Response body MUST match `{ error: { code: ErrorCode, message: string, requestId: string } }`. `ErrorCode` MUST be a member of the enum in `error-handler.ts`. Ad-hoc `new Response(JSON.stringify({ error: '...' }))` is PROHIBITED. |
| Validation   | `RC-005` (contract test: for every function, an induced error returns a body matching the schema and includes `requestId`). |

### 4.6 Tenant Assertion (`RSC.TEN`)

| Field        | Value                                                                                     |
|--------------|-------------------------------------------------------------------------------------------|
| Objective    | Tenant-scoped functions never operate on a tenant the caller cannot access.               |
| Status       | **MUST** for functions served via `serveTenant`, `serveAgent`. **MUST NOT** for `servePublic`, `serveHoneypot`.                                                                             |
| Provider     | `serve-tenant.ts` (built-in `verifyUserTenantAccess`), `_shared/validate-caller-tenant.ts` |
| Public API   | `ctx.tenantId` (guaranteed authorized when present)                                       |
| Behavior     | Handler code MUST use `ctx.tenantId` for any query filter. Handler code MUST NOT read tenant id from request body without re-validating via `ctx`.                                          |
| Validation   | `RC-006` (static: no `.eq('tenant_id', body.tenant_id)` pattern in `supabase/functions/*/index.ts`). |

### 4.7 Fetch Timeout (`RSC.TMO`)

| Field        | Value                                                                                     |
|--------------|-------------------------------------------------------------------------------------------|
| Objective    | No outbound HTTP call can hang past its declared budget.                                  |
| Status       | **MUST** for outbound `fetch(...)` calls.                                                 |
| Provider     | `_shared/fetch-with-timeout.ts` (`fetchWithTimeout`, `TIMEOUT_TIERS`)                    |
| Public API   | `fetchWithTimeout(url, init, { tier: 'fast' \| 'default' \| 'slow' })`                    |
| Behavior     | Direct `fetch(...)` is PROHIBITED except inside `_shared/*`. Every outbound call MUST specify a tier or an explicit `timeoutMs`.                                                              |
| Validation   | `RC-007` (static: no bare `fetch(` in `supabase/functions/*/index.ts` outside of `_shared/*`). |

### 4.8 Handler Timeout (`RSC.HTMO`)

| Field        | Value                                                                                     |
|--------------|-------------------------------------------------------------------------------------------|
| Objective    | No handler exceeds its declared execution budget.                                         |
| Status       | **MUST** (satisfied by entry-point default of 25s in `serveTenant`; other entry points MUST enforce equivalent). |
| Provider     | Entry-point option `handlerTimeoutMs` (existing on `serveTenant`).                       |
| Public API   | `serveTenant(handler, { handlerTimeoutMs: number })`                                     |
| Behavior     | If a handler exceeds `handlerTimeoutMs`, the entry point MUST return HTTP 504 with the standardized error shape (§4.5).                                                                       |
| Validation   | `RC-008` (contract test: handler that sleeps > `handlerTimeoutMs` yields 504 with `ErrorCode.TIMEOUT`). |

### 4.9 APM / Metrics (`RSC.APM`)

| Field        | Value                                                                                     |
|--------------|-------------------------------------------------------------------------------------------|
| Objective    | Every request produces a metric record with `function_name`, `duration_ms`, `status_code`, optional `tenant_id`. |
| Status       | **SHOULD** at R2 → **MUST** once R4 adopts entry-point-level emission.                    |
| Provider     | `_shared/apm.ts` (`recordMetric`, `withAPM`)                                              |
| Public API   | Automatic when emitted from the entry point; `withAPM(name, fn)` for sub-operation timing. |
| Behavior     | Metric emission MUST NOT block the response. Failure to emit MUST log a warning and continue. |
| Validation   | `RC-009` (runtime probe: `performance_metrics` receives a row per request within N seconds). |

### 4.10 Audit Logging (`RSC.AUD`)

| Field        | Value                                                                                     |
|--------------|-------------------------------------------------------------------------------------------|
| Objective    | Security-relevant actions (mutations, privilege changes, agent lifecycle) are recorded in `audit_logs` with tenant scope and caller identity. |
| Status       | **MUST** for functions whose handler performs at least one write to a tenant-scoped table. **MAY** for read-only functions. |
| Provider     | `_shared/audit.ts` (`createAuditLog`)                                                    |
| Public API   | `createAuditLog({ supabase, userId?, tenantId, action, resourceType, ... })`             |
| Behavior     | Audit calls MUST NOT block the primary response beyond a bounded wait. Audit failures MUST NOT swallow the primary success/error result. |
| Validation   | `RC-010` (contract test per write-path function: mutating call produces exactly one `audit_logs` row with matching `tenant_id`). |

### 4.11 Rate Limiting (`RSC.RL`)

| Field        | Value                                                                                     |
|--------------|-------------------------------------------------------------------------------------------|
| Objective    | Public and abuse-prone endpoints are protected from volumetric misuse.                    |
| Status       | **MUST** for `servePublic` endpoints; **SHOULD** for `serveTenant` endpoints exposed to interactive users. |
| Provider     | `serve-tenant.ts` / `serve-public.ts` (`rateLimit` option) → `_shared/rate-limit.ts`     |
| Public API   | Entry-point option `rateLimit: { endpoint, maxRequests?, windowMinutes?, blockMinutes? }` |
| Behavior     | On limit hit, entry point MUST return HTTP 429 with the standardized error shape and `Retry-After`. |
| Validation   | `RC-011` (contract test: exceeding the configured budget yields 429 within the configured window). |

## 5. Compatibility matrix

Per §2, no helper is modified in this RFC. This matrix classifies each
helper against the contract above so R4 knows what it must extend, not
what to rewrite.

| Helper                          | Classification        | Notes                                                              |
|---------------------------------|-----------------------|--------------------------------------------------------------------|
| `_shared/logger.ts`             | **Compatible**        | Already emits `requestId`, `tenantId`, `userId`, `duration_ms` via `LogContext`. `RSC.LOG` uses it as-is. |
| `_shared/serve-tenant.ts`       | **Requires Extension** (deferred) | Already provides `requestId`, `handlerTimeoutMs`, tenant validation, error handler, optional rate limit. Needs entry-point-level APM emission (§4.9) and end-of-request duration log record (§4.4). |
| `_shared/serve-public.ts`       | **Requires Extension** (deferred) | Reads `X-Trace-ID`/`X-Request-ID` and measures `startTime` already. Same extensions as `serve-tenant` for APM + duration record. |
| `_shared/serve-internal.ts`     | **Requires Extension** (deferred) | Same shape as `serve-public` for logging/APM parity.               |
| `_shared/serve-agent.ts`        | **Requires Extension** (deferred) | Same shape as `serve-public` for logging/APM parity.               |
| `_shared/serve-honeypot.ts`     | **Requires Extension** (deferred) | Same shape as `serve-public` for logging/APM parity.               |
| `_shared/fetch-with-timeout.ts` | **Compatible**        | Provides `fetchWithTimeout` + `TIMEOUT_TIERS`. `RSC.TMO` uses as-is. `RSC.COR` requires the caller to pass `X-Request-ID`; the helper does not need to change. |
| `_shared/error-handler.ts`      | **Compatible**        | `ErrorCode`, `createErrorResponse`, `handleExceptionWithContext` cover §4.5. Add `TIMEOUT` code review noted in §10. |
| `_shared/apm.ts`                | **Requires Extension** (deferred) | `recordMetric` / `withAPM` exist. Adoption is the gap; the API is sufficient for §4.9. |
| `_shared/audit.ts`              | **Compatible**        | `createAuditLog` API is sufficient for §4.10.                      |
| `_shared/request-context.ts`    | **Compatible**        | Redundant with entry-point context but useful for functions that pre-date `serve-*`. |
| `_shared/cors.ts`               | **Unchanged**         | No contract-level requirement.                                     |
| `_shared/security-headers.ts`   | **Unchanged**         | No contract-level requirement.                                     |
| `_shared/rate-limit.ts` / `rate-limit-middleware.ts` | **Compatible** | Consumed via `rateLimit` option on entry points; no change needed. |

"Requires Extension (deferred)" means R2 records the need but does not
touch the helper. Each such extension opens its own scoped block during
R4 or in a dedicated pre-R4 hotfix block.

## 6. Migration model

The public shape of every entry point remains unchanged. Adoption is
therefore either:

- **Path A (no change) — function already uses `serve-*`.**
  Function is Runtime Standard Compliant as soon as R4's entry-point
  extensions (APM emission + end-of-request duration record) are shipped.
  No per-function edit required.

  ```ts
  // Before R4
  serveTenant(async (req, ctx) => { /* … */ })
  // After R4 — identical source
  serveTenant(async (req, ctx) => { /* … */ })
  ```

- **Path B (migrate to entry point) — function currently uses raw `Deno.serve`.**
  Function moves to the appropriate entry point per §3.

  ```ts
  // Before
  Deno.serve(async (req) => { /* … */ })
  // After
  serveTenant(async (req, ctx) => { /* … */ })      // if tenant-scoped
  // or
  servePublic(async (req, ctx) => { /* … */ })      // if webhook/public
  ```

- **Path C (replace bare fetch) — function performs `fetch(...)` directly.**

  ```ts
  // Before
  await fetch(url, init)
  // After
  await fetchWithTimeout(url, init, { tier: 'default' })
  ```

R2 does not perform any of these migrations. It only defines them.

## 7. Breaking changes

**Breaking changes introduced by this RFC: NONE.**

- No public export is removed.
- No signature is changed.
- No option becomes required where it was optional.
- Existing functions continue to compile and run without modification.

If, during R4, we discover that a required extension to a `serve-*`
helper cannot be added without changing its signature, that discovery
opens a separate `SERVE-vNext` block. It does **not** ship inside R4.

## 8. Conformance definition (Runtime Standard Compliant — RSC)

An Edge Function is **RSC** when *all* of the following hold. R5 is the
tool that will assert this automatically; R2 only defines the rules.

| Rule ID | Requirement                                                    |
|---------|----------------------------------------------------------------|
| RC-001  | Response echoes `X-Request-ID` equal to `ctx.requestId`.       |
| RC-002  | Every outbound `fetch(...)` forwards `X-Request-ID`.           |
| RC-003  | No `console.log|warn|error` in `index.ts` or subfolders.       |
| RC-004  | End-of-request record contains `duration_ms`.                  |
| RC-005  | Errors match `{ error: { code, message, requestId } }`.        |
| RC-006  | No tenant id derived from request body without re-validation.  |
| RC-007  | No bare `fetch(` in function sources outside `_shared/*`.      |
| RC-008  | Handler exceeding `handlerTimeoutMs` returns 504.              |
| RC-009  | `performance_metrics` receives one row per request (best-effort). |
| RC-010  | Every write-path function emits a matching `audit_logs` row.   |
| RC-011  | Public endpoints return 429 when their rate budget is exceeded. |

Additional conditions:

- Function is served through exactly one of the five entry points (§3).
- Function does not call `Deno.serve(...)` directly.
- Function does not re-implement CORS, request-id generation, or error
  response formatting.

A function is **Partially Compliant** if it satisfies all `MUST` rules
except `RC-009` (metrics emission, `SHOULD` in R2, `MUST` after R4
adoption).

Anything less than Partially Compliant is **Non-Compliant** and enters
R4's backlog.

## 9. Validation strategy (defines R5, does not implement it)

R5 will realize the RC-NNN rules as follows. Frozen here so R4 does not
have to guess what R5 will check.

| Rule    | Realized as                                              |
|---------|----------------------------------------------------------|
| RC-001  | Playwright/contract test hitting each function.          |
| RC-002  | Static rule (regex / AST) in a CI script.                |
| RC-003  | Static rule in a CI script.                              |
| RC-004  | Runtime probe reading structured logs after a smoke run. |
| RC-005  | Contract test per function.                              |
| RC-006  | Static rule in a CI script.                              |
| RC-007  | Static rule in a CI script.                              |
| RC-008  | Contract test with an artificial delay.                  |
| RC-009  | DB probe (`SELECT count(*) FROM performance_metrics WHERE …`). |
| RC-010  | DB probe per write-path function.                        |
| RC-011  | Contract test firing above the configured budget.        |

## 10. Deferred architectural decisions (recorded, not executed)

Items surfaced while writing this RFC that require their own block:

1. **Entry-point extension for APM + duration record.** `serve-public`,
   `serve-internal`, `serve-agent`, `serve-honeypot` need parity with
   `serve-tenant`'s handler timeout, and all four `serve-*` need
   end-of-request emission of `duration_ms` + optional
   `recordMetric(...)`. Opens as its own R4-prep block.
2. **`ErrorCode.TIMEOUT`.** Add a normative code for `RSC.HTMO` failures
   so `RC-008` is unambiguous. Requires touching `error-handler.ts` →
   deferred.
3. **Retry, circuit breaker, idempotency.** No shared helper exists for
   these (per R1.5). R3 is the block that designs them; this RFC
   deliberately does not mandate them.
4. **Naming: `X-Trace-ID` vs `X-Request-ID`.** `serve-public` reads
   `X-Trace-ID` first, then `X-Request-ID`. RFC treats them as
   equivalent but recommends R4-prep block picks one canonical name.
5. **`request-context.ts` overlap with `serve-*`.** Two mechanisms
   provide request context. RFC allows both but recommends R4-prep
   decide whether to deprecate `request-context.ts`.

None of these are executed inside R2.

## 11. R2 closure contract

The five deliverables authorized for R2:

1. ✅ **RFC Runtime Standard** — this document (§§1–10).
2. ✅ **Compatibility matrix** — §5.
3. ✅ **Migration plan** — §§6–7 (paths A/B/C + explicit
   "Breaking Changes: NONE").
4. ✅ **Objective conformance definition** — §8 (rules `RC-001` …
   `RC-011` + entry-point invariants).
5. ✅ **Runtime Standard Checklist** — separate file:
   `docs/audits/active/r2-runtime-standard-checklist.md`.

R2 is closed when this document is approved and the checklist is
published. Nothing in R2 modifies code under `supabase/functions/`.
