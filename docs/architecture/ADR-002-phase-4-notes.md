# ADR-002 — Phase 4 Notes (Cutover)

## Status
Implemented.

## Scope
Phase 4 is the **cutover** phase of the hexagonal refactor (ADR-002).
Legacy modules now delegate to the use cases wired in Phase 3 when the
container is present, while preserving the legacy code path as a safe
fallback for rolling upgrades.

Three structural deliverables land in this phase:

1. **Loop cutover** — `Start-HeartbeatLoop` (`job-runner.ps1`) calls
   `$script:Agent.UseCases.SendHeartbeat` and
   `$script:Agent.UseCases.CheckForUpdate` instead of `Invoke-SecureApi`
   / `Invoke-CheckForUpdate` directly. The legacy paths remain as
   fallback when the container did not initialize (defense in depth).
2. **Module thin-wrappers** — `Poll-Jobs` and `Submit-JobResult` in
   `heartbeat.ps1` and `Invoke-SyncBlockedWebsites` in the remediation
   surface now route through `UseCases.PollJobs`, `UseCases.SubmitJobResult`
   and `UseCases.SyncBlocklist` respectively, with legacy fallbacks.
3. **`remediation.ps1` split** — the 490-line monolith is replaced by a
   thin loader that dot-sources five focused sub-modules:

   | File                                                | Responsibility                                   |
   |-----------------------------------------------------|--------------------------------------------------|
   | `modules/remediation/ServiceControl.ps1`            | Stop / Disable / Restart / FixFirewall / Health  |
   | `modules/remediation/ProcessControl.ps1`            | KillProcess / HighCpuProcessCheck                |
   | `modules/remediation/HostsFile.ps1`                 | SyncBlockedWebsites (prefers UseCase path)       |
   | `modules/remediation/Diagnostics.ps1`               | DiskCleanup / NetworkDiagnostics                 |
   | `modules/remediation/Quarantine.ps1`                | QuarantineAgent / ApplySecurityPatch             |

## Security fix landed in this phase

- **Protected-services parity is now ENFORCED end-to-end.** The legacy
  `Invoke-RestartService` previously only **logged** a WARN when a
  protected service was passed and then proceeded to restart it. After
  Phase 4 it returns the same `SECURITY_BLOCK` payload as
  `Invoke-StopService` / `Invoke-DisableService`. The hexagonal
  `Invoke-RestartServiceViaAdapter` (Phase 3) already enforced this
  invariant; Phase 4 closes the gap in the legacy code path.

## Deliverables

| Path                                                | Role                                             |
|-----------------------------------------------------|--------------------------------------------------|
| `agents/windows/modules/remediation.ps1`            | Phase-4 thin loader (was 490-line monolith)      |
| `agents/windows/modules/remediation/ServiceControl.ps1` | Service control surface                      |
| `agents/windows/modules/remediation/ProcessControl.ps1` | Process control surface                      |
| `agents/windows/modules/remediation/HostsFile.ps1`  | Hosts-file sync (UseCase-preferred)              |
| `agents/windows/modules/remediation/Diagnostics.ps1`| Disk + network diagnostics                       |
| `agents/windows/modules/remediation/Quarantine.ps1` | Quarantine + Windows Update patching             |
| `agents/windows/modules/heartbeat.ps1` (edited)     | Poll-Jobs / Submit-JobResult thin wrappers       |
| `agents/windows/modules/job-runner.ps1` (edited)    | Start-HeartbeatLoop calls UseCases.SendHeartbeat |
| `agents/windows/tests/phase4-cutover.Tests.ps1`     | Pester suite (4 Describe / 5 It)                 |

## Invariants verified

1. **Use case primacy.** Every cutover site guards on
   `$script:Agent -and $script:Agent.UseCases -and $script:Agent.UseCases.X`
   *before* invoking; failure of the use case path logs a WARN and
   surrenders to legacy fallback — never throws to the caller.
2. **Shape compatibility.** `Poll-Jobs` translates the canonical
   `JobDescriptor[]` returned by `UseCases.PollJobs` into the legacy
   `[PSCustomObject]@{ id; execution_id; job_type; type; payload;
   timeout_seconds }` shape so the existing dispatcher
   (`Invoke-AgentJob` switch table) keeps working unchanged.
3. **Protected-services parity** — Restart now blocks identically to
   Stop and Disable (legacy gap closed).
4. **Atomic / sanitized blocklist writes** — the `SyncBlockedWebsites`
   legacy fallback now also rejects domains failing the
   `^[a-zA-Z0-9._-]+$` regex (defense in depth alongside the
   `BlocklistEntry` domain VO).
5. **No new globals.** Phase 4 added zero `$Global:*` references in
   `application/`, `domain/`, `adapters/`, `composition/` or the new
   `modules/remediation/*.ps1` sub-files.

## Deferred to Phase 5

- **Flip `PSAvoidGlobalVars` to Error.** Still blocked by the
  bootstrap allowlist in `main.ps1` (~50 startup-only globals) and the
  legacy fallback bodies that intentionally mutate `$Global:*` to keep
  rolling upgrades safe. Phase 5 will:
    1. Move bootstrap globals into `New-AgentContainer` defaults.
    2. Delete the legacy `Invoke-SecureApi('heartbeat', …)` and
       `Invoke-SecureRequest('/poll-jobs', …)` fallbacks once telemetry
       confirms `$script:Agent.UseCases.*` is live in 100 % of
       canary fleet.
    3. Remove `CompatShims.ps1` and the per-loop `Sync-GlobalsToContainer`
       call.
    4. Then flip `PSAvoidGlobalVars` to `Error` in
       `PSScriptAnalyzerSettings.psd1`.

## Validation gate

- `tests/phase4-cutover.Tests.ps1` — green
- `tests/use-cases.Tests.ps1` (Phase 3) — still green
- `tests/adapters.Tests.ps1` (Phase 2) — still green
- `tests/container.Tests.ps1` (Phase 1) — still green
- `Run-Baseline.ps1` — globals inventory unchanged outside the
  bootstrap allowlist; protected-services parity now reports zero gaps.
