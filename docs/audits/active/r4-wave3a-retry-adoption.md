# R4 Wave 3A.1 — Retry adoption (first migration)

Status: **implemented, awaiting staging observation**
Date: 2026-07-07

## Scope (single function)

| Function | Wrapper | Calls migrated | Rationale |
|---|---|---|---|
| `validate-build-pipeline` | `serveTenant` | 2 × GET to `api.github.com` (workflows list + repo metadata) | Only function in the repo that meets all 6 Wave 3A criteria: GET, outbound external, read-only, no DB writes, transient errors plausible (GitHub 429/5xx), trivial rollback. |

Selection was driven by a static scan of all 74 edge functions for real
`fetch()` / `fetchWithTimeout` / `httpJson` outbound usage. Only 5 functions
issue any HTTP outbound at all; of those, `validate-build-pipeline` was the
only P1. Selection method matched the R4.5 discipline: inventory → classify
→ pick → adopt → measure.

## Change surface

- No contract change (same request/response shape, same status codes on failure).
- No persistence change.
- `fetchWithTimeout` preserved as the per-attempt timeout (Retry does not replace it).
- Retry envelope is scoped to the two GitHub GETs via a local `githubGet()`
  helper; nothing else in the handler is retried.

## Retry policy

```
maxAttempts    : 3
baseDelayMs    : 200
maxDelayMs     : 2000
totalBudgetMs  : 6000
jitter         : full
method         : GET
idempotent     : true
```

Retriable HTTP statuses (408, 425, 429, 5xx except 501) are converted into a
classifier-friendly `Error` with `status` and, when present, `retryAfterMs`
extracted from the `Retry-After` header. The R3.1 default classifier then
decides transient vs permanent; permanent statuses (400/401/403/404/409/etc.)
are returned to the handler without retry, exactly as before.

## Closure criteria (§6-style, adapted for 3A.1)

1. Functional behavior identical when no transient failures occur.
2. Retry occurs only for errors classified `transient` by R3.1.
3. `fetchWithTimeout` continues to bound each individual attempt.
4. Total retry budget respected (`totalBudgetMs = 6000`).
5. Telemetry emits `reliability.retry.attempt` per attempt and
   `reliability.retry.exhausted` on budget/attempt exhaustion.
6. R4.5 inventory reflects adoption ONLY on `validate-build-pipeline`,
   with no accidental adoption elsewhere.

## R4.5 inventory delta (auto-generated)

| Wrapper | Fns | Retry (before → after) |
|---|---|---|
| `serveTenant` | 25 | 0 → **1** (`validate-build-pipeline`) |
| all others | 49 | 0 → 0 (unchanged) |

Overall Retry coverage across all wrappers: **1 / 74 = 1.35 %.**
This is the intended baseline for Wave 3A — a real, non-decorative first
adoption. The R5 Reliability Score can now compute a non-zero Retry axis
with a single truthful data point instead of a fabricated one.

## Rollback

Revert the diff to `supabase/functions/validate-build-pipeline/index.ts`
(remove the `withRetry` import, remove `githubGet`, restore the two direct
`fetchWithTimeout` calls). Re-run the inventory scanner to confirm return
to zero adoption. No schema, no data, no config dependency.

## Next

- Observe in staging / production over several days (or run a controlled
  suite injecting 429/5xx/timeout) to validate telemetry paths.
- Only after that, consider **3A.2** = `scan-virus` (requires scoping Retry
  strictly to the external VirusTotal / Hybrid-Analysis lookups, excluding
  the DB persistence step).
