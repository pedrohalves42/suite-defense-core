<#
.SYNOPSIS
    Domain rule: should the agent update?
.DESCRIPTION
    Pure function. Mirrors Test-AgentVersion semantics from
    legacy update.ps1 (Major > local OR Minor > local OR Build > local).
#>

function Test-ShouldUpdate {
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)][string]$LocalVersion,
        [string]$RemoteVersion
    )

    if ([string]::IsNullOrWhiteSpace($RemoteVersion)) { return $false }

    try {
        $local  = [Version]$LocalVersion
        $remote = [Version]$RemoteVersion
    } catch {
        return $false
    }

    if ($remote.Major -gt $local.Major) { return $true }
    if ($remote.Major -lt $local.Major) { return $false }
    if ($remote.Minor -gt $local.Minor) { return $true }
    if ($remote.Minor -lt $local.Minor) { return $false }
    if ($remote.Build -gt $local.Build) { return $true }
    return $false
}
