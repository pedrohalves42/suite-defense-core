# ADR-002 — Phase 2 Notes

## Status
Implemented.

## Scope
Phase 2 introduces real adapters for every port defined in Phase 1, plus
two Windows-specific adapters (`WindowsServiceAdapter`, `HostsFileAdapter`)
that are not yet formal ports but are required for the remediation
migration in Phase 3.

## Deliverables

| Path                                                  | Role                          |
|-------------------------------------------------------|-------------------------------|
| `agents/windows/adapters/ClockAdapter.ps1`            | IClock — system wall clock    |
| `agents/windows/adapters/FileLogger.ps1`              | ILogger — file rotation, no Write-Host |
| `agents/windows/adapters/FileSystemAdapter.ps1`       | IFileSystem — atomic write + backup |
| `agents/windows/adapters/EventBusAdapter.ps1`         | IEventBus — fire-and-forget, isolated handlers |
| `agents/windows/adapters/DpapiSecretStore.ps1`        | ISecretStore — DPAPI + in-memory fallback |
| `agents/windows/adapters/HttpClientAdapter.ps1`       | IHttpClient — **active TLS pinning**, HMAC, retry+jitter |
| `agents/windows/adapters/WindowsServiceAdapter.ps1`   | Service control with parity protection |
| `agents/windows/adapters/HostsFileAdapter.ps1`        | Hosts file edits with sanitization + backup |
| `agents/windows/composition/AdapterWiring.ps1`        | `Initialize-AgentAdapters` — composition root |
| `agents/windows/tests/adapters.Tests.ps1`             | 20 Pester tests across 8 Describes |

## Key behaviors locked in

1. **HttpClientAdapter active pinning** — `ServerCertificateValidationCallback`
   now rejects mismatching thumbprints; Phase 1's `Test-TlsCertificatePin`
   was passive and bypassable. TLS 1.2/1.3 forced.
2. **HMAC fail-closed** — request returns `Success=$false` with
   `Transient=$false` before any network call when `HmacSecret` is missing.
3. **FileSystemAdapter atomic write** — `temp + Move-Item -Force` so
   `agent_state.json`/`evidence_journal.jsonl`/`dns_blocklist.json` are
   never observed half-written. Cleans up the `.tmp.<guid>` on failure.
4. **HostsFileAdapter sanitization** — rejects entries containing CR/LF
   (prevents block-injection that would silently hijack arbitrary hosts).
   Managed block delimited so reapplying is idempotent.
5. **WindowsServiceAdapter parity** — protected list (`WinDefend`, `MpsSvc`,
   `BFE`, …) cannot be stopped or weakened to `Disabled`/`Manual` via the
   adapter. Legacy `remediation.ps1` still has direct calls; Phase 3 will
   route them here.
6. **DpapiSecretStore cross-platform** — falls back to an in-memory store
   on non-Windows hosts so the Pester suite runs in CI containers.

## Wiring

`main.ps1` now sources `composition/AdapterWiring.ps1` and calls
`Initialize-AgentAdapters -Container $script:Agent` right after
`Sync-ContainerToGlobals`. Log line is
`"Hexagonal container initialized (Phase 2 adapters wired)"`.

The legacy modules (`network.ps1`, `heartbeat.ps1`, …) still execute
against `$Global:*` and continue to drive production traffic. The
adapters live in parallel and will become the only path once Phase 3
migrates each use case (`SendHeartbeatUseCase`, `PollJobsUseCase`,
`UploadEvidenceUseCase`, …).

## Validation gate for Phase 3

```
Invoke-Pester -Path agents/windows/tests/adapters.Tests.ps1 -Output Detailed
```

Expected: 20 passing It blocks across 8 Describes. Smoke-run the agent
locally and confirm `"Phase 2 adapters wired"` appears in
`%ProgramData%\CyberShield\Logs\agent_<date>.log`. No production HTTP
behavior should differ — adapters are dormant until use cases consume
them.

## Phase 3 preview

- Promote `WindowsServiceController` and `HostsFile` to formal ports.
- Extract first use cases: `SendHeartbeatUseCase`, `PollJobsUseCase`,
  `UploadEvidenceUseCase`. Each receives `$Container` and stops reading
  `$Global:*` directly.
- Replace `Invoke-SecureRequest` callers one-by-one with
  `$Container.Http.Invoke(...)`.
