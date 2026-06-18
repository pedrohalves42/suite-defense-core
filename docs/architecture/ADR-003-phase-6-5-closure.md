# ADR-003 — Phase 6.5 Closure: CurrentState / StatePath migration

**Date:** 2026-06-18
**Status:** Accepted
**Phase:** 6.5 (last sub-phase of the `state.ps1` ownership transfer)

## Context

`Set-AgentState`, `Get-SavedAgentState`, and the FSM persistence path were
still reaching into `$Global:CurrentState` and `$Global:StatePath`. After
Phases 6.2 (security baseline), 6.3 (notification), and 6.4 (rollback
path), `state.ps1` was the last module whose own runtime state lived in
the global namespace.

## Decision

Move ownership of the FSM current-state and persisted-state path into
`modules/state.ps1` as `$script:CurrentState` and `$script:StatePath`,
mirroring the Phase 6.2–6.4 pattern.

### Accessors

| Function | Purpose |
| --- | --- |
| `Get-AgentCurrentState` | Read the current FSM state. |
| `Set-AgentCurrentState -State <X>` | Direct (non-FSM) setter for bootstrap / restore / tests. |
| `Set-AgentState -NewState <X>` | FSM-validated transition (unchanged signature). |
| `Get-StatePath` | Read the persisted-state JSON path. |
| `Set-StatePath -Path <P>` | Override the persisted-state JSON path. |

Defaults are baked into the module so it remains safe to load before
`main.ps1` calls the setters.

### Bridge updates (`composition/CompatShims.ps1`)

`CompatShims.ps1` continues to mirror `$Global:CurrentState` and
`$Global:StatePath` for the un-migrated hex tests, but now:

- `Sync-ContainerToGlobals` *also* invokes `Set-AgentCurrentState` and
  `Set-StatePath` so `state.ps1` sees the container's view.
- `Sync-GlobalsToContainer` *first* refreshes the legacy globals from
  the accessors, so an FSM transition made via `Set-AgentState` is
  always reflected back into the container.

`Get-Command` guards keep the shim functional in tests that don't load
`state.ps1` (e.g. `container.Tests.ps1`).

### `main.ps1`

- Removed `$Global:CurrentState = "INITIALIZING"` and
  `$Global:StatePath = "..."` initializations.
- Container build now reads the path via `Get-StatePath`.

## Baseline (tokenizer count)

| Module | Phase 6.4 | Phase 6.5 |
| --- | ---: | ---: |
| `state.ps1` | 5 | **0** |
| **Total** | 152 | **147** |

Monotonic-decrease gate satisfied. `baseline-globals.json` refreshed.

## Tests

- `tests/state.Tests.ps1` rewritten around accessors; legacy
  `$Global:CurrentState` / `$Global:StatePath` removed.
- New `Phase 6.5 — CurrentState / StatePath migration` describe block:
  accessor exposure, empty-input rejection, and a regression guard that
  confirms `Set-AgentState` does NOT recreate `$Global:CurrentState`.
- `tests/agent.tests.ps1` updated to call `Set-StatePath` /
  `Set-AgentCurrentState` after dot-sourcing `state.ps1`.
- `tests/container.Tests.ps1` left untouched on purpose — those tests
  verify the compat-shim global bridge, which is the one place still
  allowed to write to `$Global:CurrentState`.

## Phase 6 audit (post-6.5)

| Module | Globals | Notes |
| --- | ---: | --- |
| evidence.ps1 | 56 | Largest remaining surface — candidate for Phase 7. |
| network.ps1 | 31 | DNS/HTTP caches + TLS state. |
| crypto.ps1 | 12 | Key material — needs a secure store port. |
| self-heal.ps1 | 11 | Overlaps with `update.ps1` (`UpdateInProgress`, `BootScriptHash`). |
| update.ps1 | 9 | |
| job-runner.ps1 | 8 | |
| config.ps1 | 7 | Persists boot hash + crypto keys. |
| heartbeat.ps1 | 7 | |
| collection.ps1 | 4 | |
| notification.ps1 | 2 | Reads `LocalDetectionStats` / `AgentVersion` only. |
| **state.ps1** | **0** | Closed in Phase 6.5. |
| **security.ps1** | **0** | Closed in Phase 6.2. |
| hmac.ps1, legacy-fallback.ps1, remediation.ps1, telemetry.ps1, utils.ps1 | 0 | Already clean. |

Hex layer scan (`ports`, `domain`, `application`, `adapters`,
`composition` minus `CompatShims.ps1`) is at **0** `$Global:*`
references — the strict CI gate still passes.

## Verified gaps closed in this turn

1. `main.ps1` no longer initializes `$Global:CurrentState` /
   `$Global:StatePath` — single source of truth lives in `state.ps1`.
2. `Sync-GlobalsToContainer` previously dropped FSM mutations made via
   `Set-AgentState` when nothing else touched the global. Refresh-from-
   accessor at the top of the function fixes that subtle dataflow gap.
3. `Sync-ContainerToGlobals` previously didn't tell `state.ps1` about
   container-driven overrides (e.g. a relocated state path). Added
   reverse-propagation through accessors.
4. Container test suite still validates the bridge in isolation;
   accessor-availability guards prevent breaking tests that don't load
   the full module stack.

## Follow-ups (Phase 7 candidates)

- `evidence.ps1` global cluster (56 refs) — largest single-module
  outstanding surface.
- `network.ps1` TLS / DNS caches (31 refs).
- `crypto.ps1` key-material globals (12 refs) — best migrated together
  with an `ISecretStore` adapter to avoid moving secrets between scopes
  unnecessarily.
