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

    # Phase 6.5: propagate into modules/state.ps1 script-private store
    # so state.ps1 internals (Set-AgentState, Get-SavedAgentState, ...)
    # stay aligned with the container's view of the world.
    if (Get-Command -Name Set-AgentCurrentState -ErrorAction SilentlyContinue) {
        if ($st.CurrentState) { Set-AgentCurrentState -State $st.CurrentState }
    }
    if (Get-Command -Name Set-StatePath -ErrorAction SilentlyContinue) {
        if ($cfg.StatePath) { Set-StatePath -Path $cfg.StatePath }
    }
}

function Sync-GlobalsToContainer {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$Container)

    $st  = $Container.State
    $cfg = $Container.Config

    # Phase 6.5: if modules/state.ps1 has mutated CurrentState via Set-AgentState,
    # the legacy global mirror is stale. Refresh it from the accessor first so
    # the rest of this function still works through the global bridge.
    if (Get-Command -Name Get-AgentCurrentState -ErrorAction SilentlyContinue) {
        $accState = Get-AgentCurrentState
        if ($accState) { $Global:CurrentState = $accState }
    }
    if (Get-Command -Name Get-StatePath -ErrorAction SilentlyContinue) {
        $accPath = Get-StatePath
        if ($accPath) { $Global:StatePath = $accPath }
    }

    # --- mutable runtime state -----------------------------------------
    if (Get-Variable -Name 'CurrentState'           -Scope Global -ErrorAction SilentlyContinue) { $st.CurrentState           = $Global:CurrentState }
    if (Get-Variable -Name 'BootScriptHash'         -Scope Global -ErrorAction SilentlyContinue) { $st.BootScriptHash         = $Global:BootScriptHash }
    if (Get-Variable -Name 'UpdateInProgress'       -Scope Global -ErrorAction SilentlyContinue) { $st.UpdateInProgress       = $Global:UpdateInProgress }
    if (Get-Variable -Name 'ConsecutivePollErrors'  -Scope Global -ErrorAction SilentlyContinue) { $st.ConsecutivePollErrors  = $Global:ConsecutivePollErrors }
    if (Get-Variable -Name 'RestartRequested'       -Scope Global -ErrorAction SilentlyContinue) { $st.RestartRequested       = $Global:RestartRequested }
    if (Get-Variable -Name 'LoopTimestamp'          -Scope Global -ErrorAction SilentlyContinue) { $st.LoopTimestamp          = $Global:LoopTimestamp }

    # --- server-driven configuration overrides --------------------------
    if (Get-Variable -Name 'JobPollIntervalSeconds' -Scope Global -ErrorAction SilentlyContinue) { $cfg.JobPollInterval       = $Global:JobPollIntervalSeconds }
    if (Get-Variable -Name 'TlsPinnedThumbprint'    -Scope Global -ErrorAction SilentlyContinue) { $cfg.TlsPinnedThumbprint   = $Global:TlsPinnedThumbprint }
    if (Get-Variable -Name 'AgentToken'             -Scope Global -ErrorAction SilentlyContinue) { $cfg.AgentToken            = $Global:AgentToken }
    if (Get-Variable -Name 'HmacSecret'             -Scope Global -ErrorAction SilentlyContinue) { $cfg.HmacSecret            = $Global:HmacSecret }
    if (Get-Variable -Name 'ServerUrl'              -Scope Global -ErrorAction SilentlyContinue) { $cfg.ServerUrl             = $Global:ServerUrl }
}

function Get-GlobalAllowlist { return $script:GlobalAllowlist }
