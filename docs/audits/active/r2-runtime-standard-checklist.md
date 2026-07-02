# Runtime Standard Checklist

> Companion to `r2-runtime-standard-rfc.md`. Kept intentionally small —
> this will be applied hundreds of times during R4 and copy-pasted into
> PR descriptions. Do not add prose here; keep it a checklist.

**Function:** `<name>`
**Entry point (pick one):** `serveTenant` / `servePublic` / `serveAgent` / `serveInternal` / `serveHoneypot`
**Reviewed against:** Runtime Standard RFC v1

---

## Mandatory (all must be checked to claim RSC)

- [ ] **CTX** — Uses one of the five entry points; does **not** call `Deno.serve` directly.
- [ ] **CTX** — Response echoes `X-Request-ID` = `ctx.requestId`. *(RC-001)*
- [ ] **LOG** — Uses `logger` / `loggerWithContext`; no `console.log|warn|error` in `index.ts` or subfolders. *(RC-003)*
- [ ] **LOG** — Log records include `requestId`; tenant-scoped code also includes `tenantId`.
- [ ] **DUR** — End-of-request record contains `duration_ms` (emitted by entry point; no per-handler code needed). *(RC-004)*
- [ ] **ERR** — Errors returned via `createErrorResponse(...)` or thrown for the entry-point handler. Body matches `{ error: { code, message, requestId } }`. *(RC-005)*
- [ ] **ERR** — No ad-hoc `new Response(JSON.stringify({ error: ... }))`.
- [ ] **TMO** — No bare `fetch(`; every outbound HTTP call goes through `fetchWithTimeout(...)` with a `tier` or explicit `timeoutMs`. *(RC-007)*
- [ ] **COR** — Every outbound `fetch` (or `fetchWithTimeout` call) forwards `X-Request-ID: ctx.requestId`. *(RC-002)*
- [ ] **HTMO** — Uses default `handlerTimeoutMs` (25s) or explicitly overrides it with a documented budget. *(RC-008)*

## Conditionally mandatory

- [ ] **TEN** — *(if `serveTenant` or `serveAgent`)* All queries filter by `ctx.tenantId`; no tenant id derived from request body without re-validation. *(RC-006)*
- [ ] **AUD** — *(if handler writes to any tenant-scoped table)* Emits exactly one matching `audit_logs` row via `createAuditLog(...)`. *(RC-010)*
- [ ] **RL**  — *(if `servePublic` or interactive `serveTenant`)* `rateLimit` option is configured with an appropriate `endpoint` key. *(RC-011)*

## SHOULD (Partially Compliant if this is the only miss)

- [ ] **APM** — Entry point emits a `performance_metrics` row per request. Will become MUST after the R4-prep entry-point extension ships. *(RC-009)*

## Out of scope for this checklist

The following are handled by R3 (design) and are not required for RSC in
R2/R4:

- Retry / backoff
- Circuit breaker (generic)
- Idempotency

---

**Verdict:**

- [ ] Runtime Standard Compliant (RSC)
- [ ] Partially Compliant (only RC-009 open)
- [ ] Non-Compliant — items above unchecked
