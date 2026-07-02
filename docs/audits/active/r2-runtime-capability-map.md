# R2 Appendix — Runtime Capability Map

> **Status:** Informative appendix to the R2 Runtime Standard RFC.
> **Normative weight:** None. This document does not add, alter, or relax any rule defined in `r2-runtime-standard-rfc.md`. It exists solely as an executive index for readers who need a fast overview of which platform capabilities are already provided by shared infrastructure and which are still missing.
> **Source of truth:** `docs/audits/active/r2-runtime-standard-rfc.md` (capabilities RSC.CTX…RSC.RL and rules RC-001…RC-011).

---

## Purpose

Provide a single-table view answering the question:

> "For each capability required by the Runtime Standard, does the platform already have a shared provider, and in what state?"

This appendix is intended as the first artifact a new engineer reads before diving into the full RFC.

---

## Capability Map

| # | Capability          | RFC ID   | Provider (shared)               | State    | Notes                                                                                     |
|---|---------------------|----------|---------------------------------|----------|-------------------------------------------------------------------------------------------|
| 1 | Request Context     | RSC.CTX  | `_shared/serve-*` wrappers      | Ready    | Injected by `serveTenant`, `servePublic`, `serveAgent`, `serveInternal`, `serveHoneypot`. |
| 2 | Structured Logger   | RSC.LOG  | `_shared/logger.ts`             | Ready    | Adopted by 70/74 functions (R1.5).                                                        |
| 3 | Fetch Timeout       | RSC.TO   | `_shared/fetch-with-timeout.ts` | Ready    | Provider exists; adoption gap tracked for R4, not for R2.                                 |
| 4 | Error Handling      | RSC.ERR  | `_shared/error-handler.ts`      | Ready    | Standard error shape `{ error: { code, message, requestId } }`.                           |
| 5 | Duration Tracking   | RSC.DUR  | `logger.timed` (in `logger.ts`) | Ready    | Automatic per-handler duration deferred to a future `serve-*` extension.                  |
| 6 | Correlation ID      | RSC.COR  | `_shared/serve-public.ts` et al | Ready    | Canonical trace header naming is a Deferred Architectural Decision (see RFC).             |
| 7 | APM / Metrics       | RSC.APM  | `_shared/apm.ts`                | Ready    | Provider exists; only 2/74 functions currently emit metrics (adoption belongs to R4).     |
| 8 | Audit Trail         | RSC.AUD  | `_shared/audit.ts`              | Ready    | Compatible with the standard; no signature change required.                               |
| 9 | Retry / Backoff     | RSC.RTY  | —                               | Missing  | No shared primitive. To be designed in R3.                                                |
|10 | Circuit Breaker     | RSC.CB   | AI Gateway only                 | Partial  | Localized breaker for AI providers; no general-purpose primitive. To be designed in R3.   |
|11 | Idempotency         | RSC.IDM  | —                               | Missing  | No shared primitive. To be designed in R3.                                                |
|12 | Rate Limiting       | RSC.RL   | Per-function ad-hoc             | Partial  | No unified provider. Not in scope for R3 unless promoted explicitly.                      |

---

## Legend

- **Ready** — A shared provider exists, is compatible with the Runtime Standard as defined in R2, and requires no signature change to satisfy its capability.
- **Partial** — A provider exists but covers only a subset of use cases (specific domain, specific consumer, or specific transport). Full coverage requires design work.
- **Missing** — No shared provider exists. The capability, when needed, is currently implemented ad-hoc per function, or not implemented at all.

The **State** column reflects the *availability of a shared provider*, not the *adoption rate* across Edge Functions. Adoption is measured separately by R1 / R1.5 and will be re-measured during R4.

---

## Relationship to Other Blocks

- **R1** established the observability baseline (what is emitted today).
- **R1.5** established the runtime capability inventory (what shared code exists and who consumes it).
- **R2 RFC** established the normative contract for each capability.
- **R2 Appendix (this document)** provides a one-page reading of that contract.
- **R3** will design the three Missing/Partial primitives: Retry, Circuit Breaker (generic), Idempotency.
- **R4** will drive adoption of the Ready providers and of the R3 primitives once approved.
- **R5** will score reliability using the RC-001…RC-011 rules.

---

## Change Control

This appendix is regenerated, not edited in place, whenever the RFC changes. Any discrepancy between this table and the RFC must be resolved in favor of the RFC.
