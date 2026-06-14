# ADR-002: Hexagonal Refactor of the Windows PowerShell Agent

**Status:** Accepted (Phase 5 closed 2026-06-14 — see `ADR-002-phase-5-notes.md`)
**Date:** 2026-06-13
**Supersedes:** N/A
**Related:** ADR-001 (Hexagonal Architecture for Agent Update System)

## Context

The Windows agent (`agents/windows/`) grew organically across 16 modules with:

- **193 `$Global:*` references** spread across 14 of 16 modules (worst: `evidence.ps1` = 49, `network.ps1` = 27).
- **TLS pinning code exists but is never invoked** (`Test-TlsCertificatePin` in `network.ps1`).
- **Inconsistent protection semantics** — `Invoke-StopService` / `Invoke-DisableService` block protected services; `Invoke-RestartService` only logs a warning.
- **`Write-Host` in `Write-Log`** — output is lost when the agent runs as a service.
- **`remediation.ps1` ~490 lines** mixing service control, hosts-file editing, disk cleanup, and network diagnostics in one module.
- **No dependency injection** — modules are dot-sourced and communicate via globals, making unit tests fragile and integration tests impossible without a full Windows box.

## Decision

Adopt **Ports & Adapters (Hexagonal)** for the Windows agent, mirroring ADR-001's pattern already proven for Edge Functions. Migration is **phased and gated** — each phase ships behind a Pester regression suite and is rolled out canary-style via `agent_releases`.

### Target layout

```
agents/windows/
  domain/        # Pure logic — no I/O
  ports/         # Interface contracts (PSCustomObject scriptblocks)
  adapters/      # Infra implementations (HTTP, FS, DPAPI, EventLog, Services)
  application/   # Use cases composing ports
  composition/   # New-AgentContainer (manual DI)
  modules/       # Legacy shims during migration; removed in Phase 4
  main.ps1       # Bootstraps container, runs main loop
```

State flows via an injected `$script:Agent` container instead of `$Global:*`.

## Phases

| Phase | Scope | Gate |
|-------|-------|------|
| 0 | Baseline: lint config, test doubles, `Run-Baseline.ps1` captures current Pester + lint + globals inventory | Pester green; baseline artifacts committed |
| 1 | Ports + Container scaffolding; compat shims keep legacy `$Global:*` alive | Smoke test heartbeat on dev VM |
| 2 | Adapters (HttpClient with **real TLS pinning**, DpapiSecretStore, FileLogger, WindowsServiceAdapter, HostsFileAdapter) | Each adapter ≥80% Pester coverage |
| 3 | Domain + Use Cases (`SendHeartbeatUseCase`, `ExecuteJobUseCase`, `SyncBlocklistUseCase`, `CheckForUpdateUseCase`, `PerformSelfHealUseCase`) | ≥30 new unit tests; legacy suite still green |
| 4 | Cutover legacy modules; split `remediation.ps1`; remove compat shims; **flip `PSAvoidGlobalVars` to Error** | Zero `$Global:` outside allowlist; integration smoke on Win10 + Server 2019 |
| 5 | Integration tests with mock HttpListener; CI workflow; ADR-002 marked Accepted | All gates green in CI; canary rollout 1%→10%→100% |

## Security fixes piggy-backed on the refactor

1. **TLS certificate pinning** — `HttpClientAdapter` registers `ServerCertificateValidationCallback` that delegates to `Test-TlsCertificatePin`. No more silent trust of the OS CA store.
2. **Protected-service parity** — `Invoke-RestartService` blocks the same `$ProtectedServices` list as Stop/Disable. Bypass requires an explicit signed override payload.
3. **Hosts file safety** — `HostsFileAdapter` performs atomic backup + sanitization regex `[^\w\.\-]` + admin-privilege check before writing.
4. **HMAC case-insensitive** — `Verify-HMAC` lowercases both signatures before constant-time comparison.
5. **DPAPI-protected secrets** — `agent_token` and `hmac_secret` stored cipher-at-rest, decrypted only on demand.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Field-agent breakage | Compat shims in Phase 1; canary rollout via `agent_releases` |
| Log loss during `Write-Host` removal | FileLogger active from Phase 2; `Write-Host` removed only in Phase 4 |
| HMAC/auth regression | Property-based tests + replay of captured staging payloads |
| DPAPI under SYSTEM service account | Fallback documented to `LocalMachine` scope; tested under `psexec -s` |
| PR review fatigue | One PR per phase, ≤800 net LOC |

## Acceptance criteria (global) — closed 2026-06-14

- [x] 0 `$Global:*` outside allowlist in hex layers (`ports/`, `domain/`, `application/`, `adapters/`, `composition/` ex-CompatShims) — enforced by CI gate `no-new-globals` in `.github/workflows/agent-windows-pester.yml`.
- [x] 0 `Write-Host` in `adapters/` and `application/`; `modules/utils.ps1::Write-Log` routes through `FileLogger` when the container is wired and only falls back to `Write-Host` for genuine interactive sessions (`UserInteractive -and Host.Name -ne 'ServerRemoteHost'`).
- [x] TLS pinning active — `HttpClientAdapter` registers `ServerCertificateValidationCallback`; proven by `tests/adapters.Tests.ps1`.
- [x] `Invoke-RestartService` blocks the same `$ProtectedServices` list as Stop/Disable — proven by `tests/phase4-cutover.Tests.ps1`.
- [x] HMAC verification case-insensitive on both client and server.
- [x] Pester coverage ≥80% on `application/` + `domain/` via `use-cases.Tests.ps1`, `phase4-cutover.Tests.ps1`, `phase5-integration.Tests.ps1`.
- [x] CI workflow `.github/workflows/agent-windows-pester.yml` green on `windows-latest` with strict `PSScriptAnalyzerSettings.Hex.psd1` (Errors fail the build).
- [x] Hard cutover: `Poll-Jobs`, `Submit-JobResult`, `Start-HeartbeatLoop` require the hex container; legacy paths are quarantined behind `CYBERSHIELD_LEGACY_FALLBACK=1` (emergency rollback only — see Phase 5 notes).

Deferred to **ADR-003 (Legacy Module Decomposition)**: residual `$Global:*` inside `modules/evidence.ps1`, `modules/network.ps1`, `modules/update.ps1`, etc. These are bridged each tick by `Sync-GlobalsToContainer` and are out of scope for ADR-002.

## References

- ADR-001 — Hexagonal Architecture for Agent Update System
- Alistair Cockburn — *Hexagonal Architecture* (Ports & Adapters)
- `agents/windows/PSScriptAnalyzerSettings.psd1` — guard-rail rules
- `agents/windows/tests/Run-Baseline.ps1` — Phase 0 baseline capture
- `agents/windows/tests/helpers/Container-TestDouble.ps1` — fake ports for unit tests
