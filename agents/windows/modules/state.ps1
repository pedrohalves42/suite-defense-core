<#
.SYNOPSIS
    CyberShield Agent v6.0 - State Machine (FSM) Module
.DESCRIPTION
    Manages agent state transitions, rollback state persistence.
    Depends on: utils.ps1 (Write-Log)

.NOTES
    Phase 6.4 (ADR-003): the rollback-state file path is module-private
    (script:RollbackStatePath). Set via Set-RollbackStatePath / read via
    Get-RollbackStatePath.

    Phase 6.5 (ADR-003): the FSM current state and persisted-state path
    are also module-private now (script:CurrentState / script:StatePath).
    Accessors:
      Get-AgentCurrentState / Set-AgentCurrentState
      Get-StatePath        / Set-StatePath
    Set-AgentState (FSM transitions) is the only validated mutator.
    Defaults are baked in so the module is safe to load before any
    setter is invoked. In the current boot sequence, reconfiguration
    happens INDIRECTLY via Sync-ContainerToGlobals -> Set-StatePath
    (composition/CompatShims.ps1). main.ps1 does NOT call Set-StatePath
    directly today — when CompatShims is retired in Phase 7, main.ps1
    must take over that call.
#>

# --- Module-private state (Phase 6.5) -----------------------------------
$script:CurrentState      = 'INITIALIZING'
$script:StatePath         = "$env:ProgramData\CyberShield\data\agent_state.json"

# --- Module-private rollback state path (Phase 6.4) ---------------------
$script:RollbackStatePath = "$env:ProgramData\CyberShield\data\rollback_state.json"

function Set-RollbackStatePath {
    param([Parameter(Mandatory)][string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "RollbackStatePath cannot be empty"
    }
    $script:RollbackStatePath = $Path
}

function Get-RollbackStatePath {
    return $script:RollbackStatePath
}

function Set-StatePath {
    param([Parameter(Mandatory)][string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "StatePath cannot be empty"
    }
    $script:StatePath = $Path
}

function Get-StatePath {
    return $script:StatePath
}

function Get-AgentCurrentState {
    return $script:CurrentState
}

function Set-AgentCurrentState {
    param([Parameter(Mandatory)][string]$State)
    if ([string]::IsNullOrWhiteSpace($State)) {
        throw "CurrentState cannot be empty"
    }
    $script:CurrentState = $State
}

function Set-AgentState {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("INITIALIZING", "AUTHENTICATING", "SYNCING", "ENFORCING", "DEGRADED", "SAFE_MODE")]
        [string]$NewState,

        [Parameter(Mandatory = $false)]
        [string]$Reason = ""
    )

    $oldState = $script:CurrentState

    $validTransitions = @{
        "INITIALIZING"   = @("AUTHENTICATING", "DEGRADED", "SAFE_MODE", "SYNCING")
        "AUTHENTICATING" = @("SYNCING", "DEGRADED", "SAFE_MODE")
        "SYNCING"        = @("ENFORCING", "DEGRADED", "SAFE_MODE")
        "ENFORCING"      = @("SYNCING", "DEGRADED", "SAFE_MODE")
        "DEGRADED"       = @("AUTHENTICATING", "SYNCING", "ENFORCING", "SAFE_MODE")
        "SAFE_MODE"      = @("INITIALIZING", "SYNCING", "ENFORCING")
    }

    if ($oldState -eq $NewState) {
        return $true
    }

    if ($NewState -notin $validTransitions[$oldState]) {
        Write-Log "[FSM] Invalid transition: $oldState -> $NewState" "ERROR"
        return $false
    }

    $script:CurrentState = $NewState

    Write-Log "[FSM] State transition: $oldState -> $NewState (Reason: $Reason)" "INFO"

    try {
        # B5 fix: atomic write via temp + Move-Item to avoid leaving the state
        # file truncated/half-written if the process is killed mid-write.
        $payload = @{
            state          = $NewState
            previous_state = $oldState
            transition_at  = (Get-Date).ToString("o")
            reason         = $Reason
        } | ConvertTo-Json

        $stateDir = Split-Path -Parent $script:StatePath
        if ($stateDir -and -not (Test-Path -LiteralPath $stateDir)) {
            New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
        }
        $tmpPath = "$($script:StatePath).tmp"
        $payload | Out-File -LiteralPath $tmpPath -Encoding UTF8 -Force
        Move-Item -LiteralPath $tmpPath -Destination $script:StatePath -Force
    } catch {
        Write-Log "[FSM] Failed to persist state '$NewState' to '$script:StatePath': $($_.Exception.Message)" "WARN"
    }

    return $true
}

function Get-SavedAgentState {
    if (-not (Test-Path -LiteralPath $script:StatePath)) { return $null }
    try {
        $saved = Get-Content -LiteralPath $script:StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
        return $saved.state
    } catch {
        # B4 fix: surface corruption (silent catch was hiding state-file rot).
        # Quarantine the bad file so a fresh boot can rebuild from scratch
        # without retriggering the same parse error on every start.
        Write-Log "[FSM] State file is unreadable/corrupt at '$script:StatePath': $($_.Exception.Message). Quarantining." "WARN"
        try {
            $quarantine = "$($script:StatePath).corrupt-$(Get-Date -Format 'yyyyMMddHHmmss')"
            Move-Item -LiteralPath $script:StatePath -Destination $quarantine -Force -ErrorAction Stop
        } catch {
            Write-Log "[FSM] Failed to quarantine corrupt state file: $($_.Exception.Message)" "WARN"
        }
        return $null
    }
}


function Get-RollbackState {
    try {
        $statePath = $script:RollbackStatePath
        if ($statePath -and (Test-Path $statePath)) {
            return Get-Content $statePath -Raw | ConvertFrom-Json
        }
    } catch {
        Write-Log "[ROLLBACK] Failed to read rollback state: $($_.Exception.Message)" "WARN"
    }
    return @{
        safe_mode        = $false
        rollback_count   = 0
        previous_version = $null
        last_rollback    = $null
    }
}

function Save-RollbackState {
    param(
        [Parameter(Mandatory = $true)]
        $State
    )
    try {
        $statePath = $script:RollbackStatePath
        if ($statePath) {
            $State | ConvertTo-Json -Depth 5 | Out-File $statePath -Encoding UTF8 -Force
        }
    } catch {
        Write-Log "[ROLLBACK] Failed to save rollback state: $($_.Exception.Message)" "WARN"
    }
}
