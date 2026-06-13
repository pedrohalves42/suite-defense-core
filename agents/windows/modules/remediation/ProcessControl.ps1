<#
.SYNOPSIS
    Phase 4 split of remediation.ps1 — process control surface.
#>

function Invoke-KillProcess {
    param([object]$Payload)

    try {
        $processName = $Payload.process_name
        $force = if ($null -ne $Payload.force) { $Payload.force } else { $false }

        if (-not $processName) { return @{ success = $false; error = "Missing process_name in payload" } }

        $normalizedName = $processName.ToLower() -replace '\.exe$', ''
        if ($Global:ProtectedProcesses -contains $normalizedName) {
            Write-Log "[KILL-PROCESS] BLOCKED: $processName is a protected process" "WARN"
            return @{ success = $false; error = "SECURITY_BLOCK: $processName is a protected system process"; blocked = $true; process_name = $processName }
        }

        $processes = Get-Process -Name $normalizedName -ErrorAction SilentlyContinue
        if (-not $processes -or $processes.Count -eq 0) {
            return @{ success = $true; killed = 0; message = "Process not running: $processName" }
        }

        $killed = 0
        $errors = @()
        foreach ($proc in $processes) {
            try {
                if ($force) { $proc | Stop-Process -Force -ErrorAction Stop }
                else { $proc | Stop-Process -ErrorAction Stop }
                $killed++
                Write-Log "[KILL-PROCESS] Terminated: $($proc.Name) (PID: $($proc.Id))" "SUCCESS"
            } catch {
                $errors += "PID $($proc.Id): $($_.Exception.Message)"
            }
        }

        return @{ success = ($killed -gt 0); process_name = $processName; killed = $killed; total_found = $processes.Count; errors = $errors; killed_at = (Get-Date).ToString("o") }
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-HighCpuProcessCheck {
    param([Parameter(Mandatory = $false)][int]$ThresholdPercent = $Global:HighCpuThresholdPercent)

    if (-not $Global:ProtectedProcessSet) {
        $Global:ProtectedProcessSet = [System.Collections.Generic.HashSet[string]]::new(
            [string[]]@("System", "Idle", "svchost", "csrss", "smss", "wininit", "winlogon", "services", "lsass", "dwm", "explorer", "taskmgr", "RuntimeBroker", "spoolsv", "msdtc", "SearchIndexer", "WmiPrvSE", "powershell", "CyberShield", "dns-filter", "chrome", "firefox", "msedge", "code", "Teams", "Outlook", "slack", "zoom", "OneDrive", "WINWORD", "EXCEL", "POWERPNT"),
            [System.StringComparer]::OrdinalIgnoreCase
        )
    }

    try {
        $cpuSamples = @{}
        $processes1 = Get-Process | Where-Object { $_.CPU -ne $null }
        Start-Sleep -Milliseconds 500
        $processes2 = Get-Process | Where-Object { $_.CPU -ne $null }

        foreach ($p2 in $processes2) {
            $p1 = $processes1 | Where-Object { $_.Id -eq $p2.Id }
            if ($p1) {
                $cpuDelta = $p2.CPU - $p1.CPU
                $cpuPercent = ($cpuDelta / 0.5) * 100 / [Environment]::ProcessorCount
                $cpuSamples[$p2.Id] = @{ Name = $p2.ProcessName; CpuPercent = [math]::Round($cpuPercent, 1); WorkingSetMB = [math]::Round($p2.WorkingSet / 1MB, 1) }
            }
        }

        $highCpuProcesses = $cpuSamples.GetEnumerator() |
            Where-Object { $_.Value.CpuPercent -gt $ThresholdPercent } |
            Where-Object { -not $Global:ProtectedProcessSet.Contains($_.Value.Name) }

        $killedProcesses = @()
        foreach ($proc in $highCpuProcesses) {
            $procName = $proc.Value.Name
            $procId   = $proc.Key
            $cpuPercent = $proc.Value.CpuPercent

            Write-Log "[PROCESS-CHECK] High CPU detected: $procName (PID: $procId) at $cpuPercent%" "WARN"
            try {
                $isBaseline = Test-ProcessInBaseline -ProcessName $procName
                if (-not $isBaseline) {
                    Write-Log "[PROCESS-CHECK] Process $procName NOT in baseline - killing..." "WARN"
                    Stop-Process -Id $procId -Force -ErrorAction Stop
                    $killedProcesses += @{ name = $procName; pid = $procId; cpu_percent = $cpuPercent; reason = "high_cpu_not_baseline" }
                    $Global:AutoRepairStats.processes_killed++
                    Write-Log "[PROCESS-CHECK] Killed: $procName (PID: $procId)" "SUCCESS"
                } else {
                    Write-Log "[PROCESS-CHECK] Process $procName is in baseline - monitoring only" "INFO"
                }
            } catch {
                Write-Log "[PROCESS-CHECK] Failed to kill $procName : $($_.Exception.Message)" "ERROR"
            }
        }

        if ($killedProcesses.Count -gt 0) {
            Send-AutoRepairTelemetry -Event "high_cpu_kill" -Data @{ processes = $killedProcesses; threshold = $ThresholdPercent }
        }

        return @{ checked = $true; killed_count = $killedProcesses.Count; killed = $killedProcesses; threshold = $ThresholdPercent }
    } catch {
        Write-Log "[PROCESS-CHECK] Error: $($_.Exception.Message)" "WARN"
        return @{ checked = $false; error = $_.Exception.Message }
    }
}
