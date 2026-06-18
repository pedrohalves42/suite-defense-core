<#
.SYNOPSIS
    CyberShield Agent v6.0 - State Machine (FSM) Module
.DESCRIPTION
    Manages agent state transitions, rollback state persistence.
    Depends on: utils.ps1 (Write-Log)

.NOTES
    Phase 6.4 (ADR-003): the rollback-state file path is module-private
    ($script:RollbackStatePath). Callers set it via Set-RollbackStatePath
    (main.ps1 does this at boot) and read it via Get-RollbackStatePath.
    Default value is the same path main.ps1 used previously, so the
    module is safe to load even before Set-RollbackStatePath is invoked.
#>

# --- Module-private rollback state path (Phase 6.4) ---------------------
$script:RollbackStatePath = "$env:ProgramData\CyberShield\data\rollback_state.json"

function Set-RollbackStatePath {
    <#
    .SYNOPSIS
        Configure the rollback-state JSON file location.
    #>
    param([Parameter(Mandatory)][string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "RollbackStatePath cannot be empty"
    }
    $script:RollbackStatePath = $Path
}

function Get-RollbackStatePath {
    <#
    .SYNOPSIS
        Return the currently configured rollback-state path.
    #>
    return $script:RollbackStatePath
}


function Set-AgentState {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("INITIALIZING", "AUTHENTICATING", "SYNCING", "ENFORCING", "DEGRADED", "SAFE_MODE")]
        [string]$NewState,
        
        [Parameter(Mandatory = $false)]
        [string]$Reason = ""
    )
    
    $oldState = $Global:CurrentState

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
    
    $Global:CurrentState = $NewState
    
    Write-Log "[FSM] State transition: $oldState -> $NewState (Reason: $Reason)" "INFO"
    
    try {
        @{
            state          = $NewState
            previous_state = $oldState
            transition_at  = (Get-Date).ToString("o")
            reason         = $Reason
        } | ConvertTo-Json | Out-File $Global:StatePath -Encoding UTF8
    } catch { }
    
    return $true
}

function Get-SavedAgentState {
    try {
        if (Test-Path $Global:StatePath) {
            $saved = Get-Content $Global:StatePath -Raw | ConvertFrom-Json
            return $saved.state
        }
    } catch { }
    return $null
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
