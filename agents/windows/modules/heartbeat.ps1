<#
.SYNOPSIS
    CyberShield Agent v6.0 - Heartbeat, Poll & Submit Module
.DESCRIPTION
    Send-Heartbeat, Poll-Jobs, Submit-JobResult, Execute-Job dispatcher.
    Depends on: network.ps1, crypto.ps1, state.ps1, evidence.ps1, telemetry.ps1, security.ps1
#>

function Poll-Jobs {
    # Phase 5 hard cutover: hexagonal use case is REQUIRED.
    # Legacy fallback is removed; container must be initialized by main.ps1.
    # Emergency rollback: set $env:CYBERSHIELD_LEGACY_FALLBACK = '1' to re-enable.
    if (-not ($script:Agent -and $script:Agent.UseCases -and $script:Agent.UseCases.PollJobs)) {
        if (Get-Command Test-LegacyFallbackAllowed -ErrorAction SilentlyContinue) {
            if (-not (Test-LegacyFallbackAllowed -Caller 'POLL-JOBS')) {
                Write-Log "[POLL-JOBS] FATAL: hexagonal container not wired; aborting poll" "ERROR"
                return @()
            }
        } elseif ($env:CYBERSHIELD_LEGACY_FALLBACK -ne '1') {
            Write-Log "[POLL-JOBS] FATAL: hexagonal container not wired; aborting poll" "ERROR"
            return @()
        }
        return _PollJobs_Legacy
    }

    try {
        $r = & $script:Agent.UseCases.PollJobs
        if (-not ($r -and $r.Success)) { return @() }

        $out = @()
        foreach ($jd in @($r.Jobs)) {
            $out += [PSCustomObject]@{
                id              = $jd.Id
                execution_id    = $jd.ExecutionId
                job_type        = $jd.Type
                type            = $jd.Type
                payload         = $jd.Payload
                timeout_seconds = $jd.TimeoutSec
            }
        }
        if ($out.Count -gt 0) { Write-Log "[POLL-JOBS] Received $($out.Count) job(s) via use case" "INFO" }
        return $out
    } catch {
        Write-Log "[POLL-JOBS] Use-case failure: $($_.Exception.Message)" "ERROR"
        return @()
    }
}

function _PollJobs_Legacy {
    # Quarantined legacy path. Only reachable via CYBERSHIELD_LEGACY_FALLBACK=1.
    try {
        Write-Log "[POLL-JOBS] LEGACY FALLBACK ENABLED — polling via Invoke-SecureRequest" "WARN"
        $body = @{
            agent_name    = $Global:AgentName
            agent_version = $Global:AgentVersion
            timestamp     = [DateTime]::UtcNow.ToString("o")
        }
        $result = Invoke-SecureRequest -Path "/functions/v1/poll-jobs" -Method "POST" -Body $body -MaxRetries 2 -TimeoutSec 15
        if (-not $result.Success) {
            $Global:ConsecutivePollErrors++
            return @()
        }
        $Global:ConsecutivePollErrors = 0
        if ($result.Content) {
            $parsed = $result.Content | ConvertFrom-Json -ErrorAction Stop
            if ($parsed -and $parsed.jobs) { return @($parsed.jobs) }
        }
        return @()
    } catch {
        Write-Log "[POLL-JOBS] Legacy fallback error: $($_.Exception.Message)" "ERROR"
        return @()
    }
}

function Submit-JobResult {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Job,

        [Parameter(Mandatory = $true)]
        [object]$Result
    )

    # Phase 5 hard cutover: hexagonal use case is REQUIRED.
    if (-not ($script:Agent -and $script:Agent.UseCases -and $script:Agent.UseCases.SubmitJobResult)) {
        if (Get-Command Test-LegacyFallbackAllowed -ErrorAction SilentlyContinue) {
            if (-not (Test-LegacyFallbackAllowed -Caller 'SUBMIT')) {
                Write-Log "[SUBMIT] FATAL: hexagonal container not wired; submission aborted for job $($Job.id)" "ERROR"
                return $false
            }
        } elseif ($env:CYBERSHIELD_LEGACY_FALLBACK -ne '1') {
            Write-Log "[SUBMIT] FATAL: hexagonal container not wired; submission aborted for job $($Job.id)" "ERROR"
            return $false
        }
        return (_SubmitJobResult_Legacy -Job $Job -Result $Result)
    }

    try {
        $jd = [PSCustomObject]@{
            Id          = $Job.id
            ExecutionId = $Job.execution_id
            Type        = $(if ($Job.PSObject.Properties['job_type']) { $Job.job_type } else { $Job.type })
            Payload     = $(if ($Job.PSObject.Properties['payload']) { $Job.payload } else { $null })
        }
        $r = & $script:Agent.UseCases.SubmitJobResult $jd $Result
        if ($r -and $r.Success) {
            Write-Log "[SUBMIT] Result submitted for job $($Job.id) (use case)" "SUCCESS"
            return $true
        }
        Write-Log "[SUBMIT] Use-case submit failed: $($r.Error)" "ERROR"
        return $false
    } catch {
        Write-Log "[SUBMIT] Use-case error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function _SubmitJobResult_Legacy {
    param($Job, $Result)
    try {
        Write-Log "[SUBMIT] LEGACY FALLBACK ENABLED for job $($Job.id)" "WARN"
        $finishedAt = (Get-Date).ToString("o")
        $signature = Invoke-SignResult -ExecutionId $Job.execution_id -JobId $Job.id -Status $Result.status -OutputHash $Result.output_hash -FinishedAt $finishedAt
        $payload = @{
            execution_id     = $Job.execution_id
            job_id           = $Job.id
            status           = $Result.status
            output           = $Result.output
            output_hash      = $Result.output_hash
            error_message    = $Result.error_message
            finished_at      = $finishedAt
            result_signature = $signature
            agent_version    = $Global:AgentVersion
        }
        $r = Invoke-SecureRequest -Path "/functions/v1/submit-job-result" -Method "POST" -Body $payload -MaxRetries 3 -TimeoutSec 30
        return [bool]$r.Success
    } catch {
        Write-Log "[SUBMIT] Legacy fallback error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}


function Send-AutoRepairTelemetry {
    param(
        [string]$Event,
        [object]$Data
    )
    
    try {
        $payload = @{
            agent_name    = $Global:AgentName
            agent_version = $Global:AgentVersion
            event_type    = "auto_repair"
            event_name    = $Event
            event_data    = $Data
            timestamp     = (Get-Date).ToString("o")
            hostname      = $env:COMPUTERNAME
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-agent-evidence" `
            -Method "POST" `
            -Body $payload `
            -MaxRetries 2 `
            -TimeoutSec 10
        
        if (-not $result.Success) {
            Write-Log "[TELEMETRY] Failed to send $Event event" "WARN"
        }
        
    } catch {
        Write-Log "[TELEMETRY] Error sending $Event event: $($_.Exception.Message)" "WARN"
    }
}
