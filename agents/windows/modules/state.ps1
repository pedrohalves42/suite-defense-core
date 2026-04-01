<#
.SYNOPSIS
    CyberShield Agent v6.0 - State Machine (FSM) Module
.DESCRIPTION
    Manages agent state transitions, rollback state persistence.
    Depends on: utils.ps1 (Write-Log)
#>

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
        "SAFE_MODE"      = @("INITIALIZING", "SYNCING")
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
        $statePath = $Global:RollbackPaths.RollbackState
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
        $statePath = $Global:RollbackPaths.RollbackState
        if ($statePath) {
            $State | ConvertTo-Json -Depth 5 | Out-File $statePath -Encoding UTF8 -Force
        }
    } catch {
        Write-Log "[ROLLBACK] Failed to save rollback state: $($_.Exception.Message)" "WARN"
    }
}
