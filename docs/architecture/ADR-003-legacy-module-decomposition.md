# ADR-003 — Phase 6: Legacy Module Decomposition

**Status:** Accepted (in progress) — 2026-06-18
**Supersedes:** nothing
**Builds on:** ADR-002 (hexagonal refactor — Phases 0-5 closed)

## Context

Phase 5 closed with the hexagonal layers (`ports/`, `domain/`, `application/`,
`adapters/`, `composition/` ex-`CompatShims.ps1`) hard-required by
`Poll-Jobs`, `Submit-JobResult`, and `Start-HeartbeatLoop`. The `no-new-globals`
CI gate prevents any new `$Global:*` reference in those layers.

What remains:

1. **155 `$Global:*` references** distributed across 13 legacy modules under
   `agents/windows/modules/` (post-Phase-6.1 baseline below).
2. **`CompatShims.ps1`** still bridges Container ⇄ Globals so un-migrated
   modules keep working — its deletion is the Phase 6 endgame.
3. **`CYBERSHIELD_LEGACY_FALLBACK`** + `_PollJobs_Legacy` /
   `_SubmitJobResult_Legacy` exist as emergency escape hatches (SLA-bound
   to 24h since the Phase 5 closure addendum). They must also be retired.

## Decision

Phase 6 = staged, measurable decomposition. Each sub-phase deletes globals
from one (or a tightly coupled pair of) module(s) and commits a strictly
lower baseline snapshot. The CI gate is **monotonic-decrease against the
committed baseline** — any per-module count that goes up fails the build.

### Sub-phases (order chosen by smallest blast radius first)

| # | Sub-phase | Modules | Globals to remove | Strategy |
|---|---|---|---|---|
| 6.1 ✅ | Module-private caches | `hmac.ps1`, `update.ps1` | 6 + 6 = 12 | `$script:` scope (no cross-module reads) |
| 6.2 | Security baseline | `security.ps1` | 2 | Move `ProcessBaselineSet` init to module + `Add-ProcessToBaseline` accessor |
| 6.3 | Notification state | `notification.ps1` (+ tests) | 12 | `$script:` + accessors; update Pester fixtures |
| 6.4 | Rollback paths | `state.ps1` | 7 | Read from `Container.Paths` via wiring helper |
| 6.5 | Self-heal flags | `self-heal.ps1` | 10 | Read/write via Container.State |
| 6.6 | Config surface | `config.ps1`, `collection.ps1` | 7 + 4 = 11 | Container.Config accessor in legacy modules |
| 6.7 | Crypto identity | `crypto.ps1` | 10 | DPAPI secret store + Container.Crypto |
| 6.8 | Heartbeat/job-runner | `heartbeat.ps1`, `job-runner.ps1` | 7 + 8 = 15 | Already container-aware; remove leftover global writes |
| 6.9 | Network | `network.ps1` | 27 | Container.Http + `$script:` caches |
| 6.10 | Evidence | `evidence.ps1` | 49 | Container.EventBus + `$script:` aggregation buffers |
| 6.11 | CompatShims removal | `composition/CompatShims.ps1` | — | Delete file; remove workflow exclusion |
| 6.12 | Legacy fallback retirement | `legacy-fallback.ps1`, env var, `_*Legacy` paths | — | Delete after 30 days with sentinel never tripped |

### Acceptance criteria for Phase 6 closure

- [ ] `agents/windows/modules/` contains **0 `$Global:*`** references except the
      allowlist `AgentVersion` (immutable identity field).
- [ ] `composition/CompatShims.ps1` is deleted.
- [ ] `.github/workflows/agent-windows-pester.yml` removes both
      `CompatShims.ps1` exclusions (strict lint + globals gate).
- [ ] `CYBERSHIELD_LEGACY_FALLBACK`, `_PollJobs_Legacy`,
      `_SubmitJobResult_Legacy`, and `legacy-fallback.ps1` are deleted.
- [ ] CI gate flips from "monotonic decrease" to "exact match: 1 allowed
      global (`AgentVersion`)".

### CI gate (added this sub-phase)

`.github/workflows/agent-windows-pester.yml` gains a `legacy-globals baseline gate`
step that:

1. Reads `agents/windows/tests/baseline-globals.json` (committed snapshot).
2. Re-counts `$Global:*` in every file under `agents/windows/modules/`.
3. Fails the build if any per-module count is **greater** than the baseline.
4. Warns (non-fatal) if any count is lower — operator should refresh the
   baseline in the same PR that did the migration.

This makes regressions impossible without a deliberate baseline bump.

## Consequences

**Positive**
- Every Phase 6.x PR has a single objective evidence: the baseline number
  goes down.
- No "big bang" CompatShims deletion — modules migrate one at a time, each
  independently revertable.

**Negative / risk**
- Sub-phases 6.9 (network) and 6.10 (evidence) carry 76 of the remaining
  155 globals and will dominate the work.
- Tests that poke `$Global:*` directly (`notification.Tests.ps1`,
  `agent.tests.ps1`) must be rewritten to use accessors in the same PR as
  the migration.

## Baseline snapshot

See [`agents/windows/tests/baseline-globals.json`](../../agents/windows/tests/baseline-globals.json).
Total at Phase 6.1: **155**. Target at Phase 6.12: **1** (`AgentVersion`).
