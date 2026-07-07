# Reliability Runtime — RC-1 (frozen)

Date: 2026-07-07
Status: **Release Candidate 1 — frozen**

This document formally freezes the reliability runtime at the boundary
between build phase and observation phase. No further primitives, wrappers
or adoption changes are made under RC-1; only observation of Wave 3A.1 in
staging/production and preparation (spec only) of R5.

## Frozen scope

| Block | Status |
| --- | --- |
| R1 (inventory) | ✅ frozen |
| R1.5 (inventory closure) | ✅ frozen |
| R2 (Runtime Standard RFC) | ✅ frozen |
| R3 (Retry / Timeout / Breaker / Idempotency RFC) | ✅ frozen |
| R3.1 (error classifier) | ✅ frozen |
| R4-prep | ✅ frozen |
| R4 Wave 1 (wrappers via `composePipeline`) | ✅ frozen |
| R4 Wave 2 (staging equivalence) | ✅ frozen |
| R4 Wave 3A.1 (`validate-build-pipeline` Retry) | ✅ RC-1 closed |
| R4 Wave 3A.2 (`scan-virus` external-lookup Retry) | 🟡 shipped, observing — RC-2 window OPEN since 2026-07-07T13:15:00Z (`reliability-rc2-evidence-report.md`) |
| R5 (Reliability Score) | 🔒 spec-only, no computation |

## Frozen invariants under RC-1

1. `withRetry` is used in exactly **two** production edge functions:
   - `validate-build-pipeline` — around the two GitHub GET calls only
     (RC-1, closed).
   - `scan-virus` — around the Hybrid Analysis and VirusTotal lookup
     GETs only (Wave 3A.2, currently under RC-2 observation). The DB
     insert into `virus_scans`, the `update_quota_usage` RPC, and the
     `auto-quarantine` invoke remain OUTSIDE the retry envelope.
2. `fetchWithTimeout` is preserved per attempt; Retry does not replace it.
3. No handler is wrapped in Retry as a whole.
4. No HTTP contract, payload, header, or status code changed.
5. No Circuit Breaker adoption in production.
6. No Idempotency adoption in production.
7. R5 Score is **not** computed. The R4.5 inventory remains the only
   quantitative artifact.
8. R4.5 inventory scanner remains the single source of truth for
   adoption metrics.

## What is explicitly out of scope while RC-2 observes Wave 3A.2

- Adopting Retry in any additional function (`ai-router`, `ops-gateway`,
  any POST path, etc.).
- Any change to `_shared/reliability/*` primitives.
- Any change to `serve*` wrappers or `composePipeline`.
- Creation of `idempotency_records` table or related infra.
- Recomputation or publication of any Reliability Score.

## Exit criteria (RC-1 → GA / next wave)

RC-1 exits — either promoting to GA or opening Wave 3A.2 — only when the
observation window for Wave 3A.1 produces evidence of:

1. No functional regression on `validate-build-pipeline`.
2. Retry telemetry (`reliability.retry.attempt`,
   `reliability.retry.exhausted`) matches the R3.1 behavior table.
3. No unexpected side effects: no relevant p95 increase, no excessive
   attempts, no misclassification of permanent errors as transient.
4. R4.5 inventory continues to report exactly one function with Retry
   enabled — no accidental adoption elsewhere.

Until then, the runtime is treated as **frozen** and no additional
reliability changes ship.
