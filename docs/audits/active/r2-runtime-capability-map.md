# R2 Appendix — Runtime Capability Map

> **Status:** Informative appendix to the R2 Runtime Standard RFC.
> **Normative weight:** None. This document does not add, alter, or relax any rule defined in `r2-runtime-standard-rfc.md`. It exists solely as an executive index for readers who need a fast overview of which platform capabilities are already provided by shared infrastructure and which are still missing.
> **Source of truth:** `docs/audits/active/r2-runtime-standard-rfc.md` (capabilities `RSC.CTX`…`RSC.RL` and rules `RC-001`…`RC-011`).

---

## Purpose

Provide a single-table view answering the question:

> "For each capability required by the Runtime Standard, does the platform already have a shared provider, and in what state?"

This appendix is intended as the first artifact a new engineer reads before diving into the full RFC.

---

## Capability Map

Capability IDs marked as **RFC** are defined normatively in `r2-runtime-standard-rfc.md`. IDs marked as **Proposed (R3)** are placeholders for primitives that do not yet exist in the RFC and will only become normative if approved in R3.

| #  | Capability            | RFC ID           | Provider (shared)               | State   | Owner        | Notes                                                                                     |
|----|-----------------------|------------------|---------------------------------|---------|--------------|-------------------------------------------------------------------------------------------|
| 1  | Request Context       | `RSC.CTX`        | `_shared/serve-*` wrappers      | Ready   | Runtime      | Injected by `serveTenant`, `servePublic`, `serveAgent`, `serveInternal`, `serveHoneypot`. |
| 2  | Correlation ID        | `RSC.COR`        | `_shared/serve-public.ts` et al | Ready   | Runtime      | Canonical trace header naming is a Deferred Architectural Decision (see RFC).             |
| 3  | Structured Logger     | `RSC.LOG`        | `_shared/logger.ts`             | Ready   | Runtime      | Adopted by 70/74 functions (R1.5).                                                        |
| 4  | Duration Tracking     | `RSC.DUR`        | `logger.timed` (in `logger.ts`) | Ready   | Runtime      | Automatic per-handler duration deferred to a future `serve-*` extension.                  |
| 5  | Error Handling        | `RSC.ERR`        | `_shared/error-handler.ts`      | Ready   | Runtime      | Standard error shape `{ error: { code, message, requestId } }`.                           |
| 6  | Tenant Assertion      | `RSC.TEN`        | `_shared/serve-tenant.ts`       | Ready   | Runtime      | Enforces active tenant scoping for tenant-scoped handlers.                                |
| 7  | Fetch Timeout         | `RSC.TMO`        | `_shared/fetch-with-timeout.ts` | Ready   | Runtime      | Provider exists; adoption gap tracked for R4, not for R2.                                 |
| 8  | Handler Timeout       | `RSC.HTMO`       | No provider (planned)           | Partial | Runtime      | Requires `ErrorCode.TIMEOUT` — Deferred Architectural Decision recorded in RFC.           |
| 9  | APM / Metrics         | `RSC.APM`        | `_shared/apm.ts`                | Ready   | Runtime      | Provider exists; only 2/74 functions currently emit metrics (adoption belongs to R4).     |
| 10 | Audit Trail           | `RSC.AUD`        | `_shared/audit.ts`              | Ready   | Runtime      | Compatible with the standard; no signature change required.                               |
| 11 | Rate Limiting         | `RSC.RL`         | Per-function ad-hoc             | Partial | Runtime      | No unified provider. Not in scope for R3 unless promoted explicitly.                      |
| 12 | Retry / Backoff       | *Proposed (R3)*  | —                               | Missing | TBD (R3)     | No shared primitive. To be designed in R3.                                                |
| 13 | Circuit Breaker       | *Proposed (R3)*  | AI Gateway only                 | Partial | TBD (R3)     | Domain-specific implementation (`_shared/ai-circuit-breaker.ts`); no general-purpose primitive. To be designed in R3. |
| 14 | Idempotency           | *Proposed (R3)*  | —                               | Missing | TBD (R3)     | No shared primitive. To be designed in R3.                                                |

---

## Legend

- **Ready** — A shared provider exists, is compatible with the Runtime Standard as defined in R2, and requires no signature change to satisfy its capability.
- **Partial** — A provider exists but covers only a subset of use cases (specific domain, specific consumer, or specific transport). Full coverage requires design work.
- **Missing** — No shared provider exists. The capability, when needed, is currently implemented ad-hoc per function, or not implemented at all.

The **State** column reflects the *availability of a shared provider*, not the *adoption rate* across Edge Functions. Adoption is measured separately by R1 / R1.5 and will be re-measured during R4.

The **Owner** column identifies the team responsible for the provider's contract and evolution. "Runtime" refers to the platform runtime team that owns `_shared/`. `TBD (R3)` marks capabilities that do not yet have an approved contract; ownership will be assigned when the R3 design block is approved.

---

## Relationship to Other Blocks

- **R1** established the observability baseline (what is emitted today).
- **R1.5** established the runtime capability inventory (what shared code exists and who consumes it).
- **R2 RFC** established the normative contract for each capability.
- **R2 Appendix (this document)** provides a one-page reading of that contract.
- **R3** will design the three Missing / Partial primitives listed as *Proposed (R3)*: Retry, Circuit Breaker (generic), Idempotency.
- **R4** will drive adoption of the Ready providers and of the R3 primitives once approved.
- **R5** will score reliability using the `RC-001`…`RC-011` rules.

---

## Change Control

This appendix is regenerated, not edited in place, whenever the RFC changes. Any discrepancy between this table and the RFC must be resolved in favor of the RFC. New rows may only be promoted from *Proposed* to a real `RSC.*` ID after the corresponding capability has been normatively defined in the RFC.
