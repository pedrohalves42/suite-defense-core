<#
.SYNOPSIS
    CyberShield Agent v6.0 - Remediation Module (Phase 4 facade)
.DESCRIPTION
    Phase 4 split: this file is now a thin loader that dot-sources the
    focused sub-modules. Function names and contracts are preserved so
    job-runner.ps1 and external callers continue to work unchanged.

    Sub-modules (in load order):
      - ServiceControl.ps1 : Stop/Disable/Restart/FixFirewall/HealthCheck
      - ProcessControl.ps1 : KillProcess / HighCpuProcessCheck
      - HostsFile.ps1      : SyncBlockedWebsites (prefers UseCase path)
      - Diagnostics.ps1    : DiskCleanup / NetworkDiagnostics
      - Quarantine.ps1     : QuarantineAgent / ApplySecurityPatch

    Phase 5 will remove this facade once all callers switch to
    $script:Agent.UseCases / $Container.Handlers exclusively.
#>

$remediationRoot = Join-Path $PSScriptRoot 'remediation'

. (Join-Path $remediationRoot 'ServiceControl.ps1')
. (Join-Path $remediationRoot 'ProcessControl.ps1')
. (Join-Path $remediationRoot 'HostsFile.ps1')
. (Join-Path $remediationRoot 'Diagnostics.ps1')
. (Join-Path $remediationRoot 'Quarantine.ps1')
