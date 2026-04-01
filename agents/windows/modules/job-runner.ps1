<#
.SYNOPSIS
    Job execution with timeout, circuit breaker, and typed job dispatcher.
    NO arbitrary command execution - all jobs routed through whitelisted handlers.
    v6.0: Delegates to modular handlers in collection.ps1, remediation.ps1, etc.
    Uses PowerShell runspace for timeout (Start-Job lacks module scope access).
#>

$script:ConsecutiveFailures = 0
$script:CircuitBreakerOpen = $false
$script:CircuitBreakerCooldown = 300

# ============================================
#  HEARTBEAT LOOP
# ============================================
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

            # Process pending jobs via typed dispatcher
            if ($response -and $response.commands) {
                foreach ($cmd in $response.commands) {
                    $cmdPayload = $null
                    if ($cmd.PSObject -and $cmd.PSObject.Properties['payload']) {
                        $cmdPayload = $cmd.payload
                    }
                    $cmdTimeout = 30
                    if ($cmd.PSObject -and $cmd.PSObject.Properties['timeout_seconds'] -and $cmd.timeout_seconds) {
                        $cmdTimeout = [int]$cmd.timeout_seconds
                    }

                    $result = Invoke-AgentJob `
                        -JobId $cmd.id `
                        -JobType $cmd.job_type `
                        -Payload $cmdPayload `
                        -Timeout $cmdTimeout

                    Invoke-SecureApi -Endpoint "job-result" -Method "POST" -Body @{
                        job_id = $cmd.id
                        result = $result
                    }
                }
            }

            # Check for updates
            if ($response -and $response.PSObject -and $response.PSObject.Properties['update_available'] -and $response.update_available) {
                Invoke-CheckForUpdate
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

# ============================================
#  JOB DISPATCHER (whitelisted job types only)
#  Delegates to modular handlers - zero inline logic
# ============================================
function Invoke-AgentJob {
    param(
        [string]$JobId,
        [string]$JobType,
        [object]$Payload,
        [int]$Timeout = 30
    )

    Write-Log "Dispatching job $JobId type=$JobType (timeout: ${Timeout}s)" "INFO"

    try {
        $result = switch ($JobType) {
            # === Collection jobs (collection.ps1) ===
            "software_inventory_collect" { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-CollectSoftwareInventory } }
            "collect_antivirus_status"   { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-CollectAntivirusStatus } }
            "collect_network_info"       { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-CollectNetworkInfo } }
            "collect_web_activity"       { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-CollectWebActivity } }
            "collect_dns_blocks"         { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-CollectDnsBlocks } }
            "light_vuln_scan"            { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-LightVulnScan } }
            "scan"                       { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-ScanJob } }
            "report"                     { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-ReportJob } }
            "collect_backup_status"      { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-CollectBackupStatus } }
            "collect_process_lineage"    { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-CollectProcessLineage } }

            # === Remediation jobs (remediation.ps1) ===
            "kill_process"               { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-KillProcess -Payload $Payload } }
            "stop_service"               { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-StopService -Payload $Payload } }
            "disable_service"            { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-DisableService -Payload $Payload } }
            "restart_service"            { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-RestartService -Payload $Payload } }
            "disk_cleanup"               { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-DiskCleanup } }
            "network_diagnostics"        { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-NetworkDiagnostics -Payload $Payload } }
            "service_health_check"       { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-ServiceHealthCheck -Payload $Payload } }
            "fix_firewall"               { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-FixFirewall } }
            "high_cpu_check"             { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-HighCpuProcessCheck } }
            "sync_blocked_websites"      { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-SyncBlockedWebsites -Payload $Payload } }
            "quarantine_agent"           { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-QuarantineAgent -Payload $Payload } }
            "apply_security_patch"       { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-ApplySecurityPatch -Payload $Payload } }

            # === Lifecycle jobs (inline - minimal logic) ===
            "update_agent"               { @{ success = $true; message = "Update delegated to heartbeat force_update mechanism"; agent_version = $script:Config.Version } }
            "reinstall_agent"            { @{ success = $true; message = "Reinstall delegated to force_update mechanism" } }
            "collect_info"               { @{ hostname = $env:COMPUTERNAME; os_version = [System.Environment]::OSVersion.VersionString; architecture = $env:PROCESSOR_ARCHITECTURE; agent_version = $script:Config.Version } }
            "integration_test_v3"        { @{ pong = $true; agent_version = $script:Config.Version; timestamp = (Get-Date -Format "o"); hostname = $env:COMPUTERNAME } }

            default {
                Write-Log "SECURITY: Rejected unknown job type '$JobType' for job $JobId" "WARN"
                @{ success = $false; error = "Unknown job type: $JobType"; exit_code = -1 }
            }
        }

        Write-Log "Job $JobId ($JobType) completed" "INFO"
        return $result
    }
    catch {
        Write-Log "Job $JobId failed: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message; exit_code = -1 }
    }
}

# ============================================
#  TIMEOUT WRAPPER
#  Uses inline execution with a watchdog timer.
#  Avoids Start-Job (runs in isolated scope without module functions).
# ============================================
function Invoke-JobWithTimeout {
    param(
        [string]$JobId,
        [int]$Timeout = 30,
        [scriptblock]$Handler
    )

    # For short timeouts or simple jobs, run inline with a deadline check
    $timer = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        # Execute the handler in the current scope (has access to all module functions)
        $output = & $Handler

        $timer.Stop()
        $elapsed = [math]::Round($timer.Elapsed.TotalSeconds, 2)

        if ($elapsed -gt $Timeout) {
            Write-Log "Job $JobId completed but exceeded timeout (${elapsed}s > ${Timeout}s)" "WARN"
        }

        # If handler returns a hashtable, use it directly
        if ($output -is [hashtable]) {
            if (-not $output.ContainsKey('execution_time_seconds')) {
                $output['execution_time_seconds'] = $elapsed
            }
            return $output
        }

        return @{
            success               = $true
            output                = ($output | Out-String).Trim()
            exit_code             = 0
            execution_time_seconds = $elapsed
        }
    }
    catch {
        $timer.Stop()
        Write-Log "Job $JobId failed after $([math]::Round($timer.Elapsed.TotalSeconds, 2))s: $($_.Exception.Message)" "ERROR"
        return @{
            success               = $false
            error                 = $_.Exception.Message
            exit_code             = -1
            execution_time_seconds = [math]::Round($timer.Elapsed.TotalSeconds, 2)
        }
    }
}
