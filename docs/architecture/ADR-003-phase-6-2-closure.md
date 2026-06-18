# ADR-003 — Phase 6.2 Closure

**Status:** Closed — 2026-06-18
**Scope:** `security.ps1` ProcessBaselineSet migration + Pester coverage.

## What landed

### Migration

| File | Globals removed | Replacement |
|---|---:|---|
| `agents/windows/modules/security.ps1` | 2 | `$script:ProcessBaselineSet` + `Add-ProcessToBaseline` / `Clear-ProcessBaseline` / `Get-ProcessBaselineCount` accessors |
| `agents/windows/main.ps1` | 1 | Init line removed — module owns lifecycle now |

`Test-ProcessInBaseline` keeps its signature so existing call sites (and the
`remediation.Tests.ps1` stub) are unaffected.

### Pester coverage (`tests/security-baseline.Tests.ps1`)

7 contracts:
1. Fresh `Clear-ProcessBaseline` leaves count = 0.
2. Empty baseline → `Test-ProcessInBaseline` fail-open `$true`.
3. Added name → `$true`.
4. Case-insensitive match (`Explorer.EXE` ≡ `explorer.exe`).
5. Absent name with non-empty baseline → `$false`.
6. `Add-ProcessToBaseline` idempotent (HashSet semantics).
7. **Guarantee:** `$Global:ProcessBaselineSet` must not exist after module load.

Test #7 is the regression guard — if anyone re-introduces the global it
fails immediately, complementing the workflow-level baseline gate.

### Baseline

`agents/windows/tests/baseline-globals.json`:
- Total: **155 → 153** (-2)
- `security.ps1`: **2 → 0** ✅
- All other modules: unchanged (gate confirms no regression)

## Next sub-phase

**6.3 — notification.ps1** (12 globals: `BurntToastAvailable`,
`AlertCooldownTracker`, `AlertCooldownSeconds`, plus reads of
`LocalDetectionStats` / `AgentVersion` / `AgentName`). This one also touches
`tests/notification.Tests.ps1` and `tests/agent.tests.ps1` fixtures, which
must be rewritten to use accessors in the same PR.
