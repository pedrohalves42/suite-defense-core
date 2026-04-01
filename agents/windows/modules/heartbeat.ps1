<#
.SYNOPSIS
    CyberShield Agent v6.0 - Heartbeat, Poll & Submit Module
.DESCRIPTION
    Send-Heartbeat, Poll-Jobs, Submit-JobResult, Execute-Job dispatcher.
    Depends on: network.ps1, crypto.ps1, state.ps1, evidence.ps1, telemetry.ps1, security.ps1
#>

function Poll-Jobs {
    try {
        Write-Log "[POLL-JOBS] Checking for pending jobs..." "DEBUG"
        
        $body = @{
            agent_name    = $Global:AgentName
            agent_version = $Global:AgentVersion
            timestamp     = [DateTime]::UtcNow.ToString("o")
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/poll-jobs" `
            -Method "POST" `
            -Body $body `
            -MaxRetries 2 `
            -TimeoutSec 15
        
        if (-not $result.Success) {
            $Global:ConsecutivePollErrors++
            if ($Global:ConsecutivePollErrors % 10 -eq 1) {
                Write-Log "[POLL-JOBS] Failed to poll ($($Global:ConsecutivePollErrors) consecutive): $($result.Error)" "WARN"
            }
            return @()
        }
        
        $Global:ConsecutivePollErrors = 0
        $response = $result.Content | ConvertFrom-Json
        
        $jobsList = $null
        $jobsPropPoll = $response.PSObject.Properties['jobs']
        if ($response.PSObject -and $jobsPropPoll) {
            $jobsList = @($jobsPropPoll.Value)
            $pollIntervalProp = $response.PSObject.Properties['poll_interval_seconds']
            if ($pollIntervalProp -and $pollIntervalProp.Value -and $pollIntervalProp.Value -ge 10) {
                $newInterval = [int]$pollIntervalProp.Value
                if ($newInterval -ne $Global:JobPollIntervalSeconds) {
                    Write-Log "[POLL-JOBS] Server adjusted job poll interval: $($Global:JobPollIntervalSeconds)s -> ${newInterval}s" "INFO"
                    $Global:JobPollIntervalSeconds = $newInterval
                }
            }
        } elseif ($response -is [System.Array]) {
            $jobsList = @($response)
        } else {
            $jobsList = @()
        }
        
        if ($jobsList -and $jobsList.Count -gt 0) {
            foreach ($job in $jobsList) {
                if ($job -and (-not $job.job_type) -and $job.type) {
                    $job | Add-Member -NotePropertyName "job_type" -NotePropertyValue $job.type -Force
                }
            }
            Write-Log "[POLL-JOBS] Received $($jobsList.Count) job(s)" "INFO"
            return $jobsList
        }
        
        return @()
        
    } catch {
        Write-Log "[POLL-JOBS] Error: $($_.Exception.Message)" "ERROR"
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
    
    try {
        $finishedAt = (Get-Date).ToString("o")
        
        $signature = Invoke-SignResult `
            -ExecutionId $Job.execution_id `
            -JobId $Job.id `
            -Status $Result.status `
            -OutputHash $Result.output_hash `
            -FinishedAt $finishedAt
        
        $payload = @{
            execution_id             = $Job.execution_id
            job_id                   = $Job.id
            status                   = $Result.status
            output                   = $Result.output
            output_hash              = $Result.output_hash
            error_message            = $Result.error_message
            finished_at              = $finishedAt
            result_signature         = $signature
            execution_hash           = $Result.execution_hash
            previous_execution_hash  = $Result.previous_execution_hash
            execution_index          = $Result.execution_index
            agent_version            = $Global:AgentVersion
        }
        
        Write-Log "[SUBMIT] Submitting result for job $($Job.id)..." "DEBUG"
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-job-result" `
            -Method "POST" `
            -Body $payload `
            -MaxRetries 3 `
            -TimeoutSec 30
        
        if ($result.Success) {
            Write-Log "[SUBMIT] Result submitted successfully for job $($Job.id)" "SUCCESS"
            return $true
        }
        
        Write-Log "[SUBMIT] Failed to submit result: $($result.Error)" "ERROR"
        return $false
        
    } catch {
        Write-Log "[SUBMIT] Error submitting result: $($_.Exception.Message)" "ERROR"
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
