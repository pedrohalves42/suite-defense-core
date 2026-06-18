# ADR-003 — Phase 6.3 Closure

**Status:** Closed — 2026-06-18
**Scope:** `notification.ps1` state migration + Pester fixture rewrite.

## What landed

### Migration

| File | Globals removed | Replacement |
|---|---:|---|
| `agents/windows/modules/notification.ps1` | 9 of 12 | `$script:BurntToastAvailable`, `$script:AlertCooldownTracker`, `$script:AlertCooldownSeconds`, `$script:LocalDetectionStats` + 5 accessors |
| `agents/windows/tests/notification.Tests.ps1` | rewritten | uses `Reset-NotificationState`, `Set-AlertCooldownSeconds`, `Get-LocalDetectionStats`, `Get-AlertCooldownTracker` |
| `agents/windows/tests/agent.tests.ps1` | 4 fixture inits removed | module self-initializes |

**Accessors exposed:**
- `Reset-NotificationState` — clears tracker + stats + BurntToast probe (test fixture entrypoint)
- `Set-AlertCooldownSeconds -Seconds <int>` — validates `>=0`
- `Get-AlertCooldownSeconds` / `Get-AlertCooldownTracker` / `Get-LocalDetectionStats`

### Latent bug fixed as a side effect

`$Global:AlertCooldownTracker` was **never initialised in `main.ps1`** —
only in test fixtures. The first call to `Invoke-PushAlert` in production
would have thrown `NullReferenceException` on `.ContainsKey(...)`. By
moving init into the module's load-time `$script:` assignment, this is now
guaranteed-initialised on every boot path that dot-sources the file.

### Pester guards (`tests/notification.Tests.ps1`)

- Original 3 behavioural tests preserved, rewritten through accessors.
- New `Phase 6.3 — global hygiene` describe block:
  - 4 globals (`BurntToastAvailable`, `AlertCooldownTracker`,
    `AlertCooldownSeconds`, `LocalDetectionStats`) must not exist in
    `Global` scope after module load — fails immediately on regression.
  - `Set-AlertCooldownSeconds -Seconds -1` must throw.
  - `Reset-NotificationState` must zero tracker + stats.

### Baseline

`agents/windows/tests/baseline-globals.json`:
- Total: **153 → 144** (-9 active references; the 3 remaining hits in
  `notification.ps1` are `$Global:AgentVersion` + `$Global:AgentName` reads
  and a docstring mention, all deferred to the identity sub-phase).
- `notification.ps1`: **12 → 3** ✅
- All other modules unchanged (monotonic-decrease gate confirms).

## What's deferred

- `$Global:AgentVersion` / `$Global:AgentName` — owned by the identity
  sub-phase (planned 6.6 in ADR-003); same reads exist across
  `collection.ps1`, `update.ps1`, `network.ps1`, etc. Will migrate as a
  single coordinated change reading from the Container.
