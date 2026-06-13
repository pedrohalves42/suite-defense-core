<#
.SYNOPSIS
    Domain value object representing a heartbeat request payload.
.DESCRIPTION
    Pure data — no I/O, no global access. Built by the use case
    layer from telemetry/security inputs and serialized by the
    HTTP adapter.
#>

function New-HeartbeatPayload {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$AgentName,
        [Parameter(Mandatory)][string]$AgentVersion,
        [hashtable]$Telemetry      = @{},
        [object[]] $SecurityEvents = @(),
        [string]   $TimestampIso   = ([DateTime]::UtcNow.ToString('o'))
    )

    if ([string]::IsNullOrWhiteSpace($AgentName))    { throw [System.ArgumentException]::new('AgentName is required') }
    if ([string]::IsNullOrWhiteSpace($AgentVersion)) { throw [System.ArgumentException]::new('AgentVersion is required') }

    return [PSCustomObject]@{
        agent_name      = $AgentName
        agent_version   = $AgentVersion
        telemetry       = $Telemetry
        security_events = $SecurityEvents
        timestamp       = $TimestampIso
    }
}
