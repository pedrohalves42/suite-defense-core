<#
.SYNOPSIS
    Phase 1 compat shims — bidirectional sync between the new
    hexagonal container and legacy $Global:* variables.

.DESCRIPTION
    Lets the new container coexist with un-migrated modules
    (heartbeat.ps1, network.ps1, etc.) so we can land the
    skeleton without breaking the running agent.

    DEPRECATION: this entire file is deleted in Phase 4 once every
    module reads from the container directly.

    Direction of truth: CONTAINER -> GLOBALS at startup; GLOBALS
    -> CONTAINER on every loop iteration (so legacy modules that
    still mutate globals stay reflected).
#>

# Allowlisted globals that survive Phase 4 (immutable identity fields).
$script:GlobalAllowlist = @('AgentVersion')

function Sync-ContainerToGlobals {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$Container)

    $cfg = $Container.Config
    $Global:AgentName             = $cfg.AgentName
    $Global:AgentVersion          = $cfg.AgentVersion
    $Global:AgentToken            = $cfg.AgentToken
    $Global:HmacSecret            = $cfg.HmacSecret
    $Global:ServerUrl             = $cfg.ServerUrl
    $Global:TlsPinnedThumbprint   = $cfg.TlsPinnedThumbprint
    $Global:StatePath             = $cfg.StatePath
    $Global:DnsBlocklistPath      = $cfg.DnsBlocklistPath
    $Global:EvidenceJournalPath   = $cfg.EvidenceJournalPath
    $Global:JobPollIntervalSeconds = $cfg.JobPollInterval

    $st = $Container.State
    $Global:CurrentState           = $st.CurrentState
    $Global:BootScriptHash         = $st.BootScriptHash
    $Global:UpdateInProgress       = $st.UpdateInProgress
    $Global:ConsecutivePollErrors  = $st.ConsecutivePollErrors
    $Global:RestartRequested       = $st.RestartRequested
    $Global:LoopTimestamp          = $st.LoopTimestamp
}

function Sync-GlobalsToContainer {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$Container)

    $st = $Container.State
    if (Get-Variable -Name 'CurrentState'           -Scope Global -ErrorAction SilentlyContinue) { $st.CurrentState           = $Global:CurrentState }
    if (Get-Variable -Name 'BootScriptHash'         -Scope Global -ErrorAction SilentlyContinue) { $st.BootScriptHash         = $Global:BootScriptHash }
    if (Get-Variable -Name 'UpdateInProgress'       -Scope Global -ErrorAction SilentlyContinue) { $st.UpdateInProgress       = $Global:UpdateInProgress }
    if (Get-Variable -Name 'ConsecutivePollErrors'  -Scope Global -ErrorAction SilentlyContinue) { $st.ConsecutivePollErrors  = $Global:ConsecutivePollErrors }
    if (Get-Variable -Name 'RestartRequested'       -Scope Global -ErrorAction SilentlyContinue) { $st.RestartRequested       = $Global:RestartRequested }
    if (Get-Variable -Name 'LoopTimestamp'          -Scope Global -ErrorAction SilentlyContinue) { $st.LoopTimestamp          = $Global:LoopTimestamp }
}

function Get-GlobalAllowlist { return $script:GlobalAllowlist }
