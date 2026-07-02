# GOV-RPC — Governance Backlog

> Origin: **D21-C Baseline v1** (`docs/audits/active/d21-c-baseline-v1.md`)
> Status: **Backlog**, not an incident. Each item is picked up independently
> as normal engineering, tracked by the automatic RPC inventory.

The 6 RISK items from the D21-C baseline are classified below. This file is
the **index only** — no remediation, no scope, no authorization. Each ID
opens its own block when picked up.

| ID          | Class                                | Items                                                              |
|-------------|--------------------------------------|--------------------------------------------------------------------|
| GOV-RPC-01  | Internal grants — small hotfix       | `assert_partition_rls(text)`, `ensure_partition_rls(text)`         |
| GOV-RPC-02  | Grant review — architectural         | `has_role(uuid, text, uuid)`                                       |
| GOV-RPC-03  | Grant review — architectural         | `check_tenant_suspension(uuid)`                                    |
| GOV-RPC-04  | Trigger-function grants review       | `enforce_critical_job_evidence()`                                  |
| GOV-RPC-05  | Directed investigation (blocked)     | `check_blast_radius(uuid, text, integer, text)`                    |

Classification comes verbatim from the D21-C baseline discussion; the
rationale for each grouping is in that file. This index exists so a future
maintainer can find the trail without re-reading the campaign history.

## Program state at handoff

- **Incident:** 🟢 closed
- **Hardening:** 🟢 closed
- **Governance:** 🟢 institutionalized (D21-B partition RLS gate + D21-C RPC inventory)
- **Backlog:** 5 IDs above, all detectable by the weekly inventory run

No further D21-* blocks are open. Any new work on these items starts a new,
scoped block with its own authorization.
