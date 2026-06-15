# ADR-002 — Phase 5 Closure Addendum

**Status:** Phase 5 fully closed — 2026-06-15
**Supersedes nothing.** Adds the final gap closures listed in the post-Phase-5 audit.

## Real gaps closed in this round

### 1. `CYBERSHIELD_LEGACY_FALLBACK` had no SLA enforcement or telemetry
Operators could leave the emergency flag set indefinitely with no signal. Closed by:

- **New module** `agents/windows/modules/legacy-fallback.ps1`
  - `Get-LegacyFallbackSentinelPath` — `%ProgramData%\CyberShield\data\legacy_fallback.sentinel`
  - `Test-LegacyFallbackAllowed -Caller <tag>` — only callable from legacy modules
    1. Returns `$false` when `$env:CYBERSHIELD_LEGACY_FALLBACK ≠ '1'`.
    2. Stamps sentinel with first-activation UTC timestamp on first honored call.
    3. Refuses (returns `$false` + ERROR log) once sentinel age exceeds **24h**. Operator must delete the sentinel and re-set the env var to re-arm, forcing acknowledgement.
    4. Emits `auto_repair / legacy_fallback_used` telemetry to `submit-agent-evidence` on every honored call, with caller tag, sentinel age, SLA, and first-activation timestamp.

- **Call sites updated** (`Poll-Jobs`, `Submit-JobResult`, `Start-HeartbeatLoop`):
  - Before: bare `if ($env:CYBERSHIELD_LEGACY_FALLBACK -eq '1')`
  - After: prefer `Test-LegacyFallbackAllowed -Caller '<TAG>'`, fall back to env check only if helper isn't loaded (boot ordering safety).

- **Boot order** (`main.ps1`): `legacy-fallback.ps1` loaded right before `heartbeat.ps1`, after `notification.ps1` (so `Send-AutoRepairTelemetry` is available).

- **Pester** `tests/legacy-fallback.Tests.ps1` covers the three contract paths: flag-off, first-use telemetry+sentinel, post-24h refusal.

## Items intentionally NOT addressed here (deferred to ADR-003 / Phase 6)
- `CompatShims.ps1` deletion (149 `$Global:*` still in `modules/`).
- Removal of `_PollJobs_Legacy`, `_SubmitJobResult_Legacy`, and the env flag itself.
- Hex strict lint extended to `composition/CompatShims.ps1`.
- Baseline snapshot of `$Global:*` per file for Phase 6's monotonic-decrease CI gate.

These belong to ADR-003 "Legacy Module Decomposition" and remain open by design — they are not Phase 5 acceptance criteria.

## Phase 5 — final acceptance

| Criterion | Status |
|---|---|
| Hard cutover: container required for Poll/Submit/Heartbeat | ✅ |
| Emergency flag exists, SLA-bound, telemetry-instrumented | ✅ (this addendum) |
| Strict PSScriptAnalyzer on hex layers + composition (ex CompatShims) | ✅ |
| `no-new-globals` CI gate across all hex layers | ✅ |
| Pester ≥80% on `application/` + `domain/` | ✅ |
| CI green on `windows-latest` | ✅ |
| ADR-002 acceptance criteria all `[x]` | ✅ |

Phase 5 is now closed. Phase 6 entry conditions are met.
