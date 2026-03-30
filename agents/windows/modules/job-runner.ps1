<#
.SYNOPSIS
    Job execution with timeout and circuit breaker
#>

$script:ConsecutiveFailures = 0
$script:CircuitBreakerOpen = $false
$script:CircuitBreakerCooldown = 300

function Start-HeartbeatLoop {
    Write-Log "Starting heartbeat loop (interval: $($script:Config.HeartbeatInterval)s)" "INFO"

    while ($true) {
        try {
            if ($script:CircuitBreakerOpen) {
                Write-Log "Circuit breaker open - waiting cooldown" "WARN"
                Start-Sleep -Seconds $script:CircuitBreakerCooldown
                $script:CircuitBreakerOpen = $false
                $script:ConsecutiveFailures = 0
                continue
            }

            $telemetry = Get-SystemTelemetry
            $securityEvents = Get-SecurityEvents -Hours 1

            $payload = @{
                telemetry       = $telemetry
                security_events = $securityEvents
                agent_version   = $script:Config.Version
            }

            $response = Invoke-SecureApi -Endpoint "heartbeat" -Method "POST" -Body $payload
            $script:ConsecutiveFailures = 0

            # Process pending commands
            if ($response -and $response.commands) {
                foreach ($cmd in $response.commands) {
                    $result = Invoke-AgentJob -JobId $cmd.id -Command $cmd.command -Timeout ($cmd.timeout_seconds)
                    Invoke-SecureApi -Endpoint "job-result" -Method "POST" -Body @{
                        job_id = $cmd.id
                        result = $result
                    }
                }
            }

            # Check for updates
            if ($response -and $response.update_available) {
                Check-ForUpdate
            }
        }
        catch {
            $script:ConsecutiveFailures++
            Write-Log "Heartbeat error (#$($script:ConsecutiveFailures)): $($_.Exception.Message)" "ERROR"

            if ($script:ConsecutiveFailures -ge $script:Config.MaxRetries) {
                Write-Log "Circuit breaker tripped after $($script:ConsecutiveFailures) failures" "ERROR"
                $script:CircuitBreakerOpen = $true
            }
        }

        Start-Sleep -Seconds $script:Config.HeartbeatInterval
    }
}

function Invoke-AgentJob {
    param(
        [string]$JobId,
        [string]$Command,
        [int]$Timeout = 30
    )

    Write-Log "Executing job $JobId (timeout: ${Timeout}s)" "INFO"

    try {
        $job = Start-Job -ScriptBlock {
            param($cmd)
            $output = & cmd.exe /c $cmd 2>&1
            return $output
        } -ArgumentList $Command

        $completed = $job | Wait-Job -Timeout $Timeout

        if ($null -eq $completed) {
            Stop-Job $job -ErrorAction SilentlyContinue
            Remove-Job $job -Force -ErrorAction SilentlyContinue
            Write-Log "Job $JobId timed out" "WARN"
            return @{ success = $false; error = "Timeout after ${Timeout}s"; exit_code = -1 }
        }

        $output = Receive-Job $job
        $exitCode = $job.ChildJobs[0].JobStateInfo.Reason.ExitCode
        Remove-Job $job -Force -ErrorAction SilentlyContinue

        Write-Log "Job $JobId completed (exit: $exitCode)" "INFO"
        return @{ success = $true; output = ($output | Out-String); exit_code = $exitCode }
    }
    catch {
        Write-Log "Job $JobId failed: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message; exit_code = -1 }
    }
}
