# ADR-003 — Phase 6.1 Closure

**Status:** Closed — 2026-06-18
**Scope:** First measurable reduction + monotonic-decrease CI gate online.

## What landed in 6.1

### Migrations (in-module private state — no caller impact)

| File | Globals removed | New scope |
|---|---:|---|
| `agents/windows/modules/hmac.ps1` | 6 | `$script:CachedHmacObject`, `$script:CachedHmacSecret` |
| `agents/windows/modules/update.ps1` | 6 | `$script:ToctouFailures` |

Both variables had **zero cross-module readers** (confirmed via `grep` across
`modules/`, `composition/`, `tests/`), so moving them off the global surface
is observably a no-op for runtime behaviour.

### Infrastructure (the part that protects every future sub-phase)

- **Baseline committed** — `agents/windows/tests/baseline-globals.json`
  records per-module `$Global:*` counts. Total: **155** (down from 165
  pre-6.1; the doc-block `$Global:` mentions inside the new hmac/update
  comments register as 2+4 residual matches and are accepted — they're
  documentation, not references).
- **CI gate added** — `.github/workflows/agent-windows-pester.yml` gains
  `Legacy modules — monotonic-decrease baseline gate`. Any per-module count
  greater than the committed baseline fails CI. Lower counts log an
  improvement notice (refresh the snapshot in the same PR).
- **ADR-003 published** — `docs/architecture/ADR-003-legacy-module-decomposition.md`
  enumerates sub-phases 6.1 → 6.12 with target counts.

## Explicitly NOT in 6.1 (tracked for later sub-phases)

| Item | Owning sub-phase |
|---|---|
| `CompatShims.ps1` deletion | 6.11 (endgame) |
| `_PollJobs_Legacy` / `_SubmitJobResult_Legacy` removal | 6.12 |
| `CYBERSHIELD_LEGACY_FALLBACK` retirement | 6.12 (after 30d sentinel-clean window) |
| Strict lint applied to `CompatShims.ps1` | 6.11 |
| Notification/security/state/self-heal/etc. migrations | 6.2 – 6.10 |

These were intentionally deferred: they require coordinated test-fixture
rewrites or Container-injection plumbing that's out of scope for a "safe
first slice" sub-phase. The monotonic-decrease gate guarantees nobody can
silently re-introduce globals while those sub-phases land one at a time.

## How to extend (template for sub-phases 6.2+)

1. Pick a module from ADR-003's table.
2. Convert each `$Global:X` to either:
   - `$script:X` (in-module private state), or
   - a Container-bound accessor (`$container.State.X` etc.).
3. Update any Pester fixture that pokes `$Global:X` to use the accessor.
4. Re-run `python3` baseline generator and commit a strictly lower
   `baseline-globals.json` snapshot in the same PR.
5. CI gate confirms no regression elsewhere.

Phase 6.1 is closed. The Phase 6 machine is now self-policing.
