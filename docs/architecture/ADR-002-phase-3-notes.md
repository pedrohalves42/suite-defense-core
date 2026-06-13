# ADR-002 — Phase 3 Notes

## Status
Implemented.

## Scope
Phase 3 introduces the **domain** and **application** layers of the
hexagonal architecture defined in ADR-002. Pure domain value objects
(`HeartbeatPayload`, `JobDescriptor`, `JobResult`, `UpdateDecision`,
`BlocklistEntry`) and seven use cases compose the ports/adapters
delivered in Phases 1 and 2.

The use cases run **in parallel** with the legacy modules during
Phase 3 — they are wired into `$Container.UseCases` but the
production heartbeat/job loop continues to call the legacy
functions. Phase 4 swaps the call sites and removes the legacy
modules.

## Deliverables

| Path                                                           | Role                                |
|----------------------------------------------------------------|-------------------------------------|
| `agents/windows/domain/HeartbeatPayload.ps1`                   | Heartbeat request value object      |
| `agents/windows/domain/JobDescriptor.ps1`                      | Normalized job + whitelist          |
| `agents/windows/domain/JobResult.ps1`                          | Canonical execution result          |
| `agents/windows/domain/UpdateDecision.ps1`                     | Pure version comparison rule        |
| `agents/windows/domain/BlocklistEntry.ps1`                     | Sanitized DNS blocklist entry       |
| `agents/windows/application/use-cases/SendHeartbeatUseCase.ps1` | `/heartbeat` orchestration         |
| `agents/windows/application/use-cases/PollJobsUseCase.ps1`     | `/poll-jobs` + interval rotation    |
| `agents/windows/application/use-cases/ExecuteJobUseCase.ps1`   | Whitelisted dispatcher              |
| `agents/windows/application/use-cases/SubmitJobResultUseCase.ps1` | `/submit-job-result` orchestration |
| `agents/windows/application/use-cases/CheckForUpdateUseCase.ps1` | Download–verify–stage              |
| `agents/windows/application/use-cases/SyncBlocklistUseCase.ps1` | Hosts-file sync                    |
| `agents/windows/application/use-cases/PerformSelfHealUseCase.ps1` | Integrity check + cache heal       |
| `agents/windows/composition/UseCaseWiring.ps1`                 | `Initialize-AgentUseCases`          |
| `agents/windows/tests/use-cases.Tests.ps1`                     | Pester suite (≥20 It blocks)        |

## Key invariants locked in

1. **Job whitelist is domain-level.** `New-JobDescriptor` exposes
   `IsKnown` so `ExecuteJobUseCase` short-circuits unknown types
   before touching any adapter. The known list mirrors
   `job-runner.ps1` exactly to preserve parity.
2. **Protected services parity.** `Invoke-StopServiceViaAdapter`
   *and* `Invoke-RestartServiceViaAdapter` both check
   `Services.IsProtected` — the legacy gap where `Invoke-RestartService`
   only logged a warning is closed here.
3. **Update flow is download → verify → atomic install.**
   `CheckForUpdateUseCase` stages to a `.staged.<guid>` sibling,
   verifies the server-provided SHA-256 (BOM-stripped) and only
   then calls `Fs.Write` (which is itself temp+rename). On any
   failure the staged file is deleted.
4. **Blocklist sanitization is dual-layered.** Domain
   (`BlocklistEntry`) rejects CR/LF, spaces and characters outside
   `[a-z0-9.\-]`; the `HostsFileAdapter` then re-validates via its
   own regex before writing. Defense in depth.
5. **Heartbeat / poll-interval rotation flows back into Config.**
   Server-driven interval changes mutate `Container.Config.*` so
   the CompatShim picks them up on the next `Sync-GlobalsToContainer`
   tick (added in Phase 1, widened in this phase's tests).
6. **HMAC is fail-closed at the adapter.** Use cases never inspect
   `Config.HmacSecret` directly; the `HttpClientAdapter` blocks
   any request with `Success=$false; Transient=$false` when the
   secret is missing.
7. **No `$Global:*` reads in any domain or application file.** Verified
   by `grep -RE '\$Global:' agents/windows/{domain,application}` → 0
   matches.

## Wiring

`main.ps1` sources `UseCaseWiring.ps1` after `AdapterWiring.ps1` and
calls `Initialize-AgentUseCases -Container $script:Agent`. The log
marker is `"Hexagonal container initialized (Phase 3 use cases wired)"`.

Use cases are exposed as scriptblocks under `$script:Agent.UseCases.*`:

```powershell
$result = & $script:Agent.UseCases.SendHeartbeat $telemetry $events
$jobs   = & $script:Agent.UseCases.PollJobs
```

This indirection lets Phase 4 swap legacy callers one-by-one without
threading explicit container references through every module.

## Test posture

```
Invoke-Pester -Path agents/windows/tests/use-cases.Tests.ps1 -Output Detailed
```

Expected: ≥20 passing It blocks across 11 Describes covering all
five domain VOs and all seven use cases. All adapters are faked in
memory — the suite runs on Linux/macOS CI without elevation or
Windows-only APIs.

## Phase 4 preview

- Replace `Start-HeartbeatLoop` body with calls into
  `$Agent.UseCases.*`; delete `heartbeat.ps1`/`job-runner.ps1`.
- Promote `WindowsServiceController` and `HostsFile` to formal ports
  under `agents/windows/ports/`.
- Split `remediation.ps1`: move disk cleanup / network diagnostics
  into dedicated use cases.
- Delete `composition/CompatShims.ps1` and flip
  `PSAvoidGlobalVars` to `Error`.
- Add `ISigner` port so `SubmitJobResultUseCase` no longer reaches
  for `Get-Command Invoke-SignResult`.

## Validation Report — End-to-End Audit

Audit performed after Phase 3 implementation. Walk: domain → use cases → wiring → main.ps1.

### Defects found and remediated in this pass

| # | File | Severity | Defect | Fix |
|---|------|----------|--------|-----|
| 1 | `composition/UseCaseWiring.ps1` | **High** | Scriptblocks stored in `$Container.UseCases` did not capture `$Container` lexically. Invoking `& $Agent.UseCases.PollJobs` from `main.ps1` or a legacy module would fail with "Container is null" because PowerShell scriptblocks resolve free variables dynamically. | Wrapped every scriptblock with `.GetNewClosure()`. |
| 2 | `application/use-cases/SendHeartbeatUseCase.ps1` | Medium | Event-bus publish for `heartbeat.interval.changed` read `from = $cfg.PollInterval` **after** mutating it, so `from` and `to` were always identical, defeating observability. | Captured previous interval into `$prev` before mutation. |
| 3 | `domain/BlocklistEntry.ps1` | Medium | Parameter `$Host` shadowed PowerShell's automatic `$Host` variable (PSScriptAnalyzer `PSAvoidAssignmentToAutomaticVariable`). | Renamed parameter to `$HostName` with `[Alias('Host')]` to preserve backward compatibility. |

### Phase 2 retro-checks (confirmed no gaps)

- All 8 adapters wired and asserted against ports (`Assert-I*`).
- `HttpClientAdapter` enforces HMAC fail-closed + TLS pinning + jittered backoff.
- `WindowsServiceAdapter` protects 12 critical services from `Stop`.
- `HostsFileAdapter` sanitizes CR/LF/control chars.
- `DpapiSecretStore` has cross-platform in-memory fallback for tests.

### Phase 3 invariants confirmed in code

- Domain layer has **zero** `$Global:*` references (`rg -n '\$Global:' agents/windows/domain/` → 0 hits).
- Application layer has **zero** `$Global:*` references (`rg -n '\$Global:' agents/windows/application/` → 0 hits).
- `ExecuteJobUseCase` blocks `stop_service` and `restart_service` for protected services via adapter (`$Container.Services.IsProtected`).
- `CheckForUpdateUseCase` enforces SHA-256 BOM-safe verification *before* atomic install.
- `PerformSelfHealUseCase` distinguishes `Initialized` / `Healed` / `IntegrityViolation` states.
- `PollJobsUseCase` resets `ConsecutivePollErrors` on success; increments on failure.

### Test coverage map (use-cases.Tests.ps1)

| Describe block | It count | Notes |
|----------------|---------:|-------|
| Domain :: HeartbeatPayload | 2 | required fields + shape |
| Domain :: JobDescriptor    | 3 | normalize, whitelist, malformed |
| Domain :: UpdateDecision   | 4 | version comparator cases |
| Domain :: BlocklistEntry   | 3 | CRLF reject, lowercase, bulk skip |
| UseCase :: SendHeartbeat   | 2 | interval change + transient error |
| UseCase :: PollJobs        | 2 | normalized descriptors + error counter |
| UseCase :: ExecuteJob      | 4 | unknown / collect_info / protected / stop allowed |
| UseCase :: SubmitJobResult | 1 | payload sent |
| UseCase :: CheckForUpdate  | 2 | up-to-date + hash mismatch |
| UseCase :: SyncBlocklist   | 1 | sanitize/persist/apply |
| UseCase :: SelfHeal        | 2 | baseline + violation |
| **Total**                  | **26** | |

### Status

Phase 3 is **complete and validated**. Three defects were found during this audit
and all three were fixed in the same pass. Ready to proceed to Phase 4 (cutover:
replace legacy loop bodies in `heartbeat.ps1` / `job-runner.ps1` with
`$Agent.UseCases.*` calls and delete `CompatShims.ps1`).
