<#
.SYNOPSIS
    CyberShield Agent v6.0 - Heartbeat, Poll & Submit Module
.DESCRIPTION
    Send-Heartbeat, Poll-Jobs, Submit-JobResult, Execute-Job dispatcher.
    Depends on: network.ps1, crypto.ps1, state.ps1, evidence.ps1, telemetry.ps1, security.ps1
#>

function Poll-Jobs {
    # Phase 4 cutover: prefer hexagonal use case when wired.
    if ($script:Agent -and $script:Agent.UseCases -and $script:Agent.UseCases.PollJobs) {
        try {
            $r = & $script:Agent.UseCases.PollJobs
            if ($r -and $r.Success) {
                # Map JobDescriptor[] back to the legacy psobject shape expected by the dispatcher.
                $out = @()
                foreach ($jd in @($r.Jobs)) {
                    $out += [PSCustomObject]@{
                        id            = $jd.Id
                        execution_id  = $jd.ExecutionId
                        job_type      = $jd.Type
                        type          = $jd.Type
                        payload       = $jd.Payload
                        timeout_seconds = $jd.TimeoutSec
                    }
                }
                return $out
            }
            return @()
        } catch {
            Write-Log "[POLL-JOBS] Use-case path threw ($($_.Exception.Message)); falling back to legacy" "WARN"
        }
    }

    try {
        Write-Log "[POLL-JOBS] Checking for pending jobs (legacy path)..." "DEBUG"

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

    # Phase 4 cutover: prefer hexagonal use case.
    if ($script:Agent -and $script:Agent.UseCases -and $script:Agent.UseCases.SubmitJobResult) {
        try {
            $jd = [PSCustomObject]@{
                Id          = $Job.id
                ExecutionId = $Job.execution_id
                Type        = $(if ($Job.PSObject.Properties['job_type']) { $Job.job_type } else { $Job.type })
                Payload     = $(if ($Job.PSObject.Properties['payload']) { $Job.payload } else { $null })
            }
            $r = & $script:Agent.UseCases.SubmitJobResult $jd $Result
            if ($r -and $r.Success) {
                Write-Log "[SUBMIT] Result submitted successfully for job $($Job.id) (via use case)" "SUCCESS"
                return $true
            }
            Write-Log "[SUBMIT] Use-case submit failed: $($r.Error); falling back to legacy" "WARN"
        } catch {
            Write-Log "[SUBMIT] Use-case path threw ($($_.Exception.Message)); falling back to legacy" "WARN"
        }
    }

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

        Write-Log "[SUBMIT] Submitting result for job $($Job.id) (legacy path)..." "DEBUG"

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
