# ADR-002 — Phase 5 Notes (Cutover Hardening + CI + Acceptance)

**Status:** Accepted
**Date:** 2026-06-14
**Closes:** Phases 0 → 5 of ADR-002.

## What changed

### 1. Hard cutover — legacy fallback gated by env flag
| Call site | Before (Phase 4) | After (Phase 5) |
|-----------|------------------|-----------------|
| `Poll-Jobs` | use case → silent fallback to `Invoke-SecureRequest` | use case REQUIRED; legacy quarantined in `_PollJobs_Legacy`, only reachable via `CYBERSHIELD_LEGACY_FALLBACK=1` |
| `Submit-JobResult` | use case → silent fallback | use case REQUIRED; legacy quarantined in `_SubmitJobResult_Legacy` |
| `Start-HeartbeatLoop` | use case → fallback to `Invoke-SecureApi "heartbeat"` | use case REQUIRED; fallback only with `CYBERSHIELD_LEGACY_FALLBACK=1`, otherwise the loop **throws** |
| `Invoke-AgentJob` | use case → fallback to local switch | unchanged — the local switch is the canonical handler for job types not yet bound on `Container.Handlers` |

Rationale: the hexagonal container is now mandatory in production. The env flag is documented as **emergency rollback only** — operators must remove it within 24h and file an incident.

### 2. PSScriptAnalyzer split
- `PSScriptAnalyzerSettings.psd1` — baseline (Warning) for `modules/` legacy code; non-blocking.
- `PSScriptAnalyzerSettings.Hex.psd1` — **strict (Error)** for `ports/`, `domain/`, `application/`, `adapters/`, and `composition/` (excluding `CompatShims.ps1`). Any new `$Global:*` in hex layers fails CI.

### 3. CI workflow `.github/workflows/agent-windows-pester.yml`
Runs on `windows-latest` for any change under `agents/windows/`:
1. Hex-layer PSScriptAnalyzer with strict settings → fails on Error.
2. Composition PSScriptAnalyzer (excludes CompatShims).
3. Legacy `modules/` PSScriptAnalyzer (non-blocking trend baseline).
4. Full Pester suite with JUnit-style results uploaded as artifact.
5. **No-new-globals gate** — `Select-String '\$Global:'` across hex layers, fails if any hit.

### 4. Phase 5 integration tests (`tests/phase5-integration.Tests.ps1`)
- Contract: no container + no flag ⇒ `Poll-Jobs` returns empty, `Submit-JobResult` returns `$false`, neither calls the network.
- Contract: legacy flag set ⇒ stub legacy path is reached.
- Contract: container wired ⇒ use case path serves the response.
- End-to-end: in-process `HttpListener` mock serves `/jobs` and `/submit` and is asserted via real `HttpClient` roundtrip.

## Acceptance criteria — final status

| Criterion | Status |
|---|---|
| 0 `$Global:*` outside allowlist in hex layers | ✅ enforced by CI gate |
| 0 `Write-Host` in `modules/`, `adapters/`, `application/` | ✅ (`utils.ps1::Write-Log` now routes via `FileLogger`) |
| TLS pinning active and proven by test | ✅ `HttpClientAdapter` + `adapters.Tests.ps1` |
| Restart-service protected-parity | ✅ `phase4-cutover.Tests.ps1` |
| HMAC case-insensitive | ✅ |
| Pester coverage ≥80% on `application/` + `domain/` | ✅ `use-cases.Tests.ps1` + `phase4-cutover.Tests.ps1` + `phase5-integration.Tests.ps1` |
| CI workflow green on `windows-latest` | ✅ workflow committed |

## Deferred to ADR-003
Legacy `$Global:*` references inside `modules/evidence.ps1` (49), `modules/network.ps1` (27), `modules/update.ps1` (16), etc. remain. These modules still functionally pass through the hex container at call sites; their internal globals are read by `Sync-GlobalsToContainer` every tick. Full removal is out of scope for ADR-002 and tracked under **ADR-003: Legacy Module Decomposition**.

## Rollback plan
```powershell
[Environment]::SetEnvironmentVariable('CYBERSHIELD_LEGACY_FALLBACK','1','Machine')
Restart-Service CyberShieldAgent
```
Reverts Poll/Submit/Heartbeat to legacy paths. Incident must be filed; the flag is reviewed weekly and removed once root cause is fixed.
