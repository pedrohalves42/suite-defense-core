# ADR-003 — Phase 6.6 Closure: Bootstrap lockfile & version validation

**Status:** Accepted
**Date:** 2026-06-18
**Scope:** Windows agent build/test toolchain (CI + dev)

## Context

Phase 6.1–6.5 closed the `$Global:*` → `$script:*` migration and tightened the
hexagonal layer gates, but the Windows agent build was still implicitly
depending on whatever versions `windows-latest` happened to ship. A silent
bump of `ps2exe`, `Pester`, Node, npm or the .NET SDK could change the EXE
output bit-for-bit and break the SHA256-pinned release pipeline without any
PR signal.

## Decision

Introduce a single, authoritative lockfile and a side-effect-free
verifier that runs on every CI job and is available to developers locally.

### Artifacts

- **`agents/windows/bootstrap.lock.json`** — declarative pins for
  `tools` (node, npm, pwsh, dotnet), `powershell_modules` (ps2exe, Pester,
  PSScriptAnalyzer), `winget_packages` (optional), the npm lockfile, and
  the gate switches (`fail_on_missing_tool`, `fail_on_version_drift`,
  `winget_strict`). Each pin supports `exact` / `min` / `max` / `optional`.
- **`agents/windows/bootstrap.ps1`** — verifier with three modes:
  `-Verify` (default, used in CI), `-Report` (dev, non-fatal),
  `-List` (dump resolved pins). Never installs or mutates state.
- **`agents/windows/tests/bootstrap.Tests.ps1`** — Pester suite for the
  lockfile shape and the `Test-Pin` comparator (exact/min/max, "v" prefix,
  missing observations).

### CI wiring

- `.github/workflows/agent-windows-pester.yml` — runs
  `bootstrap.ps1 -Verify` immediately after installing Pester/PSScriptAnalyzer
  so any drift between the installed modules and the lockfile fails fast.
- `.github/workflows/build-agent-exe.yml` — runs `bootstrap.ps1 -Verify`
  after `npm ci`, before any ps2exe compilation step.

### Dev workflow

```pwsh
pwsh -File agents/windows/bootstrap.ps1 -Report   # non-fatal, prints drift
pwsh -File agents/windows/bootstrap.ps1 -Verify   # fail on drift (CI parity)
pwsh -File agents/windows/bootstrap.ps1 -List     # dump resolved lockfile
```

## Consequences

- Build reproducibility: any toolchain drift is surfaced as a red CI step
  with a single-line `Reason`, rather than as a binary hash change weeks
  later.
- Lockfile becomes part of the change-control surface — bumping `ps2exe`
  or Pester now requires a PR that updates `bootstrap.lock.json` and the
  corresponding `Install-Module -RequiredVersion` line in the workflow.
- `winget_packages` are pinned `optional: true` by default; the
  `winget_strict` gate flips them to hard requirements for environments
  (e.g. self-hosted runners) that provision via winget.
- Zero runtime impact on the deployed agent — the bootstrap touches only
  the build/test surface.

## Follow-ups (Phase 6.7+)

- Extend the lockfile with `dns-filter` (Go toolchain) and the Linux/macOS
  shellcheck/bats versions to give every agent the same reproducibility
  guarantee.
- Generate a signed `bootstrap.lock.sig` alongside the JSON so the
  release pipeline can refuse to build against an unsigned lockfile.
