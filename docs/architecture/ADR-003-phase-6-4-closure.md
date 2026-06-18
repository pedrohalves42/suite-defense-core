# ADR-003 — Phase 6.4 Closure

**Status:** Closed — 2026-06-18
**Scope:** `state.ps1` — `RollbackPaths` migration to module-private state
with configurable accessor.

## What landed

### Migration

| File | Globals removed | Replacement |
|---|---:|---|
| `agents/windows/modules/state.ps1` | 2 | `$script:RollbackStatePath` + `Set-RollbackStatePath` / `Get-RollbackStatePath` |
| `agents/windows/main.ps1` | 3 (init block) | Default lives in the module; main.ps1 no longer assigns the global |
| `agents/windows/tests/state.Tests.ps1` | fixture rewritten | uses accessor; 3 new regression-guard tests |
| `agents/windows/tests/agent.tests.ps1` | fixture rewritten | calls `Set-RollbackStatePath` after dot-sourcing `state.ps1` |

### Why a string instead of the previous hashtable?

The original `$Global:RollbackPaths = @{ RollbackState = ... }` was a
hashtable with a single key. No caller ever read any other key, including
in tests. Phase 6.4 flattens it to a string (`$script:RollbackStatePath`)
to remove dead surface area — if a future sub-phase needs more paths,
they can ship as additional accessors (`Set-RollbackHistoryPath`, etc.)
without resurrecting a free-form hashtable.

### Default-safety guarantee

`state.ps1` initialises `$script:RollbackStatePath` to
`"$env:ProgramData\CyberShield\data\rollback_state.json"` at load time —
the same path `main.ps1` used. This means the module is fully functional
even if `Set-RollbackStatePath` is never invoked, which matches the
existing production behaviour exactly.

### Pester guards (`tests/state.Tests.ps1`)

New `Phase 6.4 — RollbackPaths migration` describe block:
1. Accessor returns a non-empty path.
2. `Set-RollbackStatePath -Path ''` must throw.
3. `$Global:RollbackPaths` must not exist after module load
   (regression guard — fails immediately if the global is reintroduced).

### Baseline

`agents/windows/tests/baseline-globals.json` (tokenizer-precise, matches
the CI gate):

| Module | Phase 6.3 | Phase 6.4 |
|---|---:|---:|
| `state.ps1` | 7 | **5** |
| **TOTAL**   | 154 | **152** |

The 5 remaining hits in `state.ps1` are `$Global:CurrentState` (×2) and
`$Global:StatePath` (×3) — both cross-cutting identity/runtime state owned
by main.ps1 / Container. They are deferred to the identity sub-phase
(planned 6.6 in ADR-003) because every other legacy module also reads
those two globals and a coordinated migration is the right unit of work.

### Validation pass

- ✅ Parse-clean on all 4 touched files (`Parser.ParseFile`).
- ✅ Baseline regenerated via the same tokenizer the CI gate uses.
- ✅ Gate runs locally with `GATE GREEN`.
- ✅ Hex layers still clean (no `$Global:*` regressions).

## Next sub-phase

Per ADR-003 ordering: **6.5 — `self-heal.ps1`** (11 globals: `UpdateInProgress`,
`BootScriptHash`, etc.). These overlap with the identity/runtime state
deferred above, so 6.5 will likely be merged into a combined
"runtime-state" sub-phase that touches `self-heal.ps1`, `state.ps1`,
`update.ps1`, and the relevant CompatShims surface in one PR.
