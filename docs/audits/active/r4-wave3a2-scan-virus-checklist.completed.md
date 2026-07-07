# R4 Wave 3A.2 — `scan-virus` adoption checklist (pre-approval)

Date: 2026-07-07
Status: **deferred — do not implement under RC-1**

This checklist is frozen *before* implementation so that, when the
observation window on Wave 3A.1 closes, Wave 3A.2 is a mechanical
execution and not a re-discussion.

## Preconditions (all must hold before starting)

- [ ] RC-1 observation window on `validate-build-pipeline` closed with
      no functional regression.
- [ ] `reliability.retry.attempt` / `reliability.retry.exhausted`
      observed in real traffic, matching R3.1 behavior table.
- [ ] R4.5 inventory still reports exactly 1 function with Retry
      enabled at the moment 3A.2 starts (no drift).
- [ ] No open incident or hotfix touching `scan-virus`.

## Scope (single function, minimal surface)

Target: `supabase/functions/scan-virus/index.ts`.

Retry MUST wrap only the external lookup calls (VirusTotal /
Hybrid-Analysis). Persistence steps MUST remain outside the retry
envelope. The handler itself MUST NOT be wrapped.

## Per-call checklist (apply to each external lookup)

- [ ] Call is a GET (or documented-idempotent) request.
- [ ] `fetchWithTimeout` preserved as per-attempt timeout.
- [ ] `withRetry` wraps only the outbound HTTP call, not the DB write.
- [ ] Retriable statuses use the same helper pattern as
      `validate-build-pipeline` (408, 425, 429, 5xx except 501; parse
      `Retry-After`).
- [ ] Non-retriable statuses (400, 401, 403, 404, 409, 422, 501) return
      to the handler unchanged.
- [ ] No new event names introduced beyond the RELIABILITY_EVENTS set.
- [ ] No change to request/response shape, headers, or status codes.

## Persistence invariants

- [ ] No write is duplicated across retries (writes happen only after
      the retried lookup resolves).
- [ ] On retry exhaustion, the persistence step is skipped and the
      original error is returned; no partial state is written.
- [ ] Any existing dedup key on scan results is preserved.

## Telemetry

- [ ] `reliability.retry.attempt` observed at least once in staging
      before promoting to production.
- [ ] `requestId` / correlation id preserved across attempts.
- [ ] No PII (URLs may contain user file hashes only, not filenames).

## Rollback

- [ ] Revert of the `scan-virus/index.ts` diff restores prior behavior
      exactly; no schema, no data, no config dependency.
- [ ] R4.5 scanner returns to 1 function with Retry enabled after
      rollback.

## Explicit non-goals (still deferred after 3A.2)

- Circuit Breaker adoption anywhere.
- Idempotency adoption anywhere.
- Retry adoption on `ai-router`, `ops-gateway`, or any POST path.
- Mass migration of edge functions.
- Any R5 score computation.
