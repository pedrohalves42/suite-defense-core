# Phase 1 — Ports & Container (ADR-002)

**Status:** Shipped — runs in compat mode alongside legacy `$Global:*`.

## What this phase did

- Defined six output port contracts under `agents/windows/ports/`:
  `IHttpClient`, `ISecretStore`, `ILogger`, `IClock`, `IFileSystem`, `IEventBus`.
  Each ships an `Assert-I<Name>` validator (PowerShell has no interfaces).

- Built a manual DI container at `agents/windows/composition/Container.ps1`
  exposing `New-AgentConfig` and `New-AgentContainer`. The container
  carries `Config` + `State` + injected adapters in a single
  `PSCustomObject`.

- Added bidirectional shims at `agents/windows/composition/CompatShims.ps1`:
  - `Sync-ContainerToGlobals` publishes container fields to `$Global:*`
    so legacy modules still work.
  - `Sync-GlobalsToContainer` pulls legacy mutations back into the
    container after each loop iteration.

- Wired the container into `main.ps1` immediately after `Initialize-Config`.
  Zero behavior change for production agents.

- Added Pester suite `agents/windows/tests/container.Tests.ps1` covering:
  config defaults & URL normalization, container DI overrides, port
  assertions (positive + negative), and round-trip sync.

## Allowlist for Phase 4

Only `$Global:AgentVersion` survives the final cutover. Enforced by
`Get-GlobalAllowlist`.

## Files added

```
agents/windows/
├── ports/
│   ├── IHttpClient.ps1
│   ├── ISecretStore.ps1
│   ├── ILogger.ps1
│   ├── IClock.ps1
│   ├── IFileSystem.ps1
│   └── IEventBus.ps1
├── composition/
│   ├── Container.ps1
│   └── CompatShims.ps1
└── tests/
    └── container.Tests.ps1
```

## Validation gate before Phase 2

Run on a Windows host:

```powershell
pwsh -File agents/windows/tests/Run-Baseline.ps1
Invoke-Pester agents/windows/tests/container.Tests.ps1 -Output Detailed
```

Expected:
- All existing tests still green (no regression).
- `container.Tests.ps1`: 100% pass.
- Smoke test: agent starts, completes heartbeat cycle, logs
  `"Hexagonal container initialized (Phase 1 shim mode)"`.

## Next: Phase 2 — Adapters

Real implementations of every port, including:
- `HttpClientAdapter` with **active TLS pinning**.
- `WindowsServiceAdapter` with **parity protection for Restart**.
- `HostsFileAdapter` with atomic backup + domain sanitization.
- `DpapiSecretStore`, `FileLogger` (no more `Write-Host`).

---

## Patch — Loop sync gap closed

**Status:** Resolved.

After initial Phase 1 ship, the loop-iteration sync called for in ADR-002
was missing. Closed end-to-end:

1. **`Start-HeartbeatLoop`** (`modules/job-runner.ps1`): calls
   `Sync-GlobalsToContainer` at the top of every iteration, guarded by
   `Get-Command` so it is a no-op when the container is not loaded
   (preserves test isolation and backwards compat for the bundle build).

2. **`Start-Watchdog`** (`modules/self-heal.ps1`): same hook in the
   watchdog loop so update/integrity state stays mirrored.

3. **`Sync-GlobalsToContainer`** (`composition/CompatShims.ps1`):
   widened to also pull server-driven Config overrides
   (`JobPollInterval`, `TlsPinnedThumbprint`, rotated `AgentToken`,
   rotated `HmacSecret`, `ServerUrl`) — not just runtime State. This
   matters because the backend pushes new poll intervals in heartbeat
   responses and legacy code writes them to `$Global:JobPollIntervalSeconds`.

4. **`container.Tests.ps1`**: +4 tests cover the widened sync
   (poll interval rotation, TLS pin rotation, credential rotation,
   idempotency).

Both `try { … } catch { }` wrappers make the sync calls fail-safe — a
shim bug can never crash the loop.
