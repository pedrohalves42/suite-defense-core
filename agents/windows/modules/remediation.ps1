<#
.SYNOPSIS
    CyberShield Agent v6.0 - Remediation Module
.DESCRIPTION
    Process kill, service stop/disable/restart, firewall fix, quarantine,
    patch apply, disk cleanup, high CPU check, sync blocked websites,
    service health check, network diagnostics.
    Depends on: utils.ps1, network.ps1, notification.ps1, heartbeat.ps1 (Send-AutoRepairTelemetry)
#>

function Invoke-KillProcess {
    param([object]$Payload)
    
    try {
        $processName = $Payload.process_name
        $force = if ($null -ne $Payload.force) { $Payload.force } else { $false }
        
        if (-not $processName) {
            return @{ success = $false; error = "Missing process_name in payload" }
        }
        
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

function Invoke-StopService {
    param([object]$Payload)
    
    try {
        $serviceName = $Payload.service_name
        $force = if ($null -ne $Payload.force) { $Payload.force } else { $false }
        
        if (-not $serviceName) { return @{ success = $false; error = "Missing service_name in payload" } }
        
        if ($Global:ProtectedServices -contains $serviceName) {
            Write-Log "[STOP-SERVICE] BLOCKED: $serviceName is a protected service" "WARN"
            return @{ success = $false; error = "SECURITY_BLOCK: $serviceName is a protected system service"; blocked = $true; service_name = $serviceName }
        }
        
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if (-not $service) { return @{ success = $false; error = "Service not found: $serviceName" } }
        if ($service.Status -eq 'Stopped') { return @{ success = $true; service_name = $serviceName; status = "already_stopped" } }
        
        if ($force) { Stop-Service -Name $serviceName -Force -ErrorAction Stop }
        else { Stop-Service -Name $serviceName -ErrorAction Stop }
        
        Write-Log "[STOP-SERVICE] Stopped: $serviceName" "SUCCESS"
        return @{ success = $true; service_name = $serviceName; previous_status = $service.Status.ToString(); new_status = "Stopped"; stopped_at = (Get-Date).ToString("o") }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-DisableService {
    param([object]$Payload)
    
    try {
        $serviceName = $Payload.service_name
        if (-not $serviceName) { return @{ success = $false; error = "Missing service_name in payload" } }
        
        if ($Global:ProtectedServices -contains $serviceName) {
            Write-Log "[DISABLE-SERVICE] BLOCKED: $serviceName is a protected service" "WARN"
            return @{ success = $false; error = "SECURITY_BLOCK: $serviceName is a protected system service"; blocked = $true; service_name = $serviceName }
        }
        
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if (-not $service) { return @{ success = $false; error = "Service not found: $serviceName" } }
        
        $previousStatus = $service.Status.ToString()
        $previousStartType = (Get-CimInstance Win32_Service -Filter "Name='$serviceName'").StartMode
        
        if ($service.Status -ne 'Stopped') { Stop-Service -Name $serviceName -Force -ErrorAction Stop }
        Set-Service -Name $serviceName -StartupType Disabled -ErrorAction Stop
        
        Write-Log "[DISABLE-SERVICE] Disabled: $serviceName" "SUCCESS"
        return @{ success = $true; service_name = $serviceName; previous_status = $previousStatus; previous_startup = $previousStartType; new_status = "Stopped"; new_startup = "Disabled"; disabled_at = (Get-Date).ToString("o") }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-RestartService {
    param([object]$Payload)
    
    try {
        $serviceName = $Payload.service_name
        $timeout = if ($Payload.timeout_seconds) { $Payload.timeout_seconds } else { 30 }
        
        if (-not $serviceName) { return @{ success = $false; error = "Missing service_name in payload" } }
        
        if ($Global:ProtectedServices -contains $serviceName) {
            Write-Log "[RESTART-SERVICE] WARNING: Restarting protected service $serviceName" "WARN"
        }
        
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if (-not $service) { return @{ success = $false; error = "Service not found: $serviceName" } }
        
        $previousStatus = $service.Status.ToString()
        Restart-Service -Name $serviceName -Force -ErrorAction Stop
        $service.WaitForStatus('Running', (New-TimeSpan -Seconds $timeout))
        $newService = Get-Service -Name $serviceName
        
        Write-Log "[RESTART-SERVICE] Restarted: $serviceName" "SUCCESS"
        return @{ success = $true; service_name = $serviceName; previous_status = $previousStatus; new_status = $newService.Status.ToString(); restarted_at = (Get-Date).ToString("o") }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-FixFirewall {
    param([object]$Payload)
    
    try {
        $results = @{}
        if ($Payload.enable_public) { Set-NetFirewallProfile -Profile Public -Enabled True -ErrorAction Stop; $results.public = "enabled" }
        if ($Payload.enable_private) { Set-NetFirewallProfile -Profile Private -Enabled True -ErrorAction Stop; $results.private = "enabled" }
        if ($Payload.enable_domain) { Set-NetFirewallProfile -Profile Domain -Enabled True -ErrorAction Stop; $results.domain = "enabled" }
        
        return @{ success = $true; changes = $results; applied_at = (Get-Date).ToString("o") }
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-DiskCleanup {
    param([Parameter(Mandatory = $false)][int]$ThresholdPercent = $Global:DiskCleanupThresholdPercent)
    
    try {
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
        $usedPercent = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1)
        
        if ($usedPercent -lt $ThresholdPercent) {
            return @{ cleaned = $false; reason = "disk_ok"; usage_percent = $usedPercent }
        }
        
        Write-Log "[DISK-CLEANUP] Disk usage at $usedPercent% (threshold: $ThresholdPercent%). Starting cleanup..." "WARN"
        
        $freedBytes = 0
        $actions = @()
        
        try { $tempPath = $env:TEMP; $tempFiles = Get-ChildItem -Path $tempPath -Recurse -Force -ErrorAction SilentlyContinue; $tempSize = ($tempFiles | Measure-Object -Property Length -Sum).Sum; Remove-Item "$tempPath\*" -Recurse -Force -ErrorAction SilentlyContinue; $freedBytes += $tempSize; $actions += "user_temp" } catch { }
        try { $winTempPath = "C:\Windows\Temp"; $winTempFiles = Get-ChildItem -Path $winTempPath -Recurse -Force -ErrorAction SilentlyContinue; $winTempSize = ($winTempFiles | Measure-Object -Property Length -Sum).Sum; Remove-Item "$winTempPath\*" -Recurse -Force -ErrorAction SilentlyContinue; $freedBytes += $winTempSize; $actions += "windows_temp" } catch { }
        try { Remove-Item "C:\Windows\Prefetch\*.pf" -Force -ErrorAction SilentlyContinue; $actions += "prefetch" } catch { }
        try {
            $cleanMgrPath = "C:\Windows\System32\cleanmgr.exe"
            if (Test-Path $cleanMgrPath) {
                $regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VolumeCaches"
                foreach ($cache in @("Temporary Files", "Temporary Setup Files", "Old ChkDsk Files", "Recycle Bin")) {
                    $cachePath = "$regPath\$cache"
                    if (Test-Path $cachePath) { Set-ItemProperty -Path $cachePath -Name "StateFlags0100" -Value 2 -ErrorAction SilentlyContinue }
                }
                $process = Start-Process "cleanmgr.exe" -ArgumentList "/sagerun:100" -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
                if ($process.ExitCode -eq 0) { $actions += "cleanmgr" }
            }
        } catch { }
        
        $diskAfter = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
        $usedPercentAfter = [math]::Round((($diskAfter.Size - $diskAfter.FreeSpace) / $diskAfter.Size) * 100, 1)
        $freedGB = [math]::Round(($diskAfter.FreeSpace - $disk.FreeSpace) / 1GB, 2)
        
        Write-Log "[DISK-CLEANUP] Completed. Usage: $usedPercent% -> $usedPercentAfter% (freed: ${freedGB}GB)" "SUCCESS"
        
        $Global:AutoRepairStats.disk_cleanups++
        $Global:AutoRepairStats.last_disk_cleanup = (Get-Date).ToString("o")
        
        Send-AutoRepairTelemetry -Event "disk_cleanup" -Data @{ event = "disk_cleanup"; before_percent = $usedPercent; after_percent = $usedPercentAfter; freed_gb = $freedGB; actions = $actions }
        
        return @{ cleaned = $true; before_percent = $usedPercent; after_percent = $usedPercentAfter; freed_gb = $freedGB; actions = $actions }
        
    } catch {
        Write-Log "[DISK-CLEANUP] Error: $($_.Exception.Message)" "ERROR"
        return @{ cleaned = $false; error = $_.Exception.Message }
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
            $procId = $proc.Key
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

function Invoke-SyncBlockedWebsites {
    param([object]$Payload)
    
    try {
        Write-Log "[SYNC-BLOCKED] Syncing blocked websites..." "INFO"
        
        $hostsPath = "C:\Windows\System32\drivers\etc\hosts"
        $markerStart = "# === CyberShield Blocked Websites Start ==="
        $markerEnd = "# === CyberShield Blocked Websites End ==="
        
        $urls = @()
        $payloadDomains = $null
        if ($null -ne $Payload) {
            if ($Payload -is [hashtable]) {
                if ($Payload.ContainsKey("blocked_domains")) { $payloadDomains = $Payload["blocked_domains"] }
                elseif ($Payload.ContainsKey("urls")) { $payloadDomains = $Payload["urls"] }
                elseif ($Payload.ContainsKey("domains")) { $payloadDomains = $Payload["domains"] }
            } else {
                try {
                    $props = @($Payload.PSObject.Properties | ForEach-Object { $_.Name })
                    if ($props -contains "blocked_domains") { $payloadDomains = $Payload.blocked_domains }
                    elseif ($props -contains "urls") { $payloadDomains = $Payload.urls }
                    elseif ($props -contains "domains") { $payloadDomains = $Payload.domains }
                } catch { Write-Log "[SYNC-BLOCKED] Payload property access error (non-fatal): $($_.Exception.Message)" "DEBUG" }
            }
        }
        if ($payloadDomains) { $urls = @($payloadDomains) }
        else {
            $result = Invoke-SecureRequest -Path "/functions/v1/serve-dns-filter" -Method "POST" -Body @{ agent_name = $Global:AgentName; timestamp = [DateTime]::UtcNow.ToString("o") } -MaxRetries 2 -TimeoutSec 15
            if ($result.Success) {
                $response = $result.Content | ConvertFrom-Json
                try { $responseProps = @($response.PSObject.Properties | ForEach-Object { $_.Name }); if ($responseProps -contains "domains") { $urls = @($response.domains) } elseif ($responseProps -contains "blocked_domains") { $urls = @($response.blocked_domains) } } catch { Write-Log "[SYNC-BLOCKED] Response parse error: $($_.Exception.Message)" "WARN" }
            }
        }
        
        if ($urls.Count -eq 0) { return @{ success = $true; blocked_count = 0; message = "No URLs to block" } }
        
        $hostsContent = Get-Content $hostsPath -Raw -ErrorAction SilentlyContinue
        if ($hostsContent -match [regex]::Escape($markerStart)) {
            $hostsContent = $hostsContent -replace "(?s)$([regex]::Escape($markerStart)).*?$([regex]::Escape($markerEnd))", ""
        }
        
        $blockEntries = @($markerStart)
        foreach ($url in $urls) {
            $domain = $url -replace "^https?://", "" -replace "/.*$", ""
            $blockEntries += "0.0.0.0 $domain"
            $blockEntries += "0.0.0.0 www.$domain"
        }
        $blockEntries += $markerEnd
        
        $newContent = $hostsContent.TrimEnd() + "`r`n" + ($blockEntries -join "`r`n") + "`r`n"
        Set-Content -Path $hostsPath -Value $newContent -Encoding ASCII -Force
        ipconfig /flushdns | Out-Null
        @{ domains = $urls; updated_at = (Get-Date).ToString("o") } | ConvertTo-Json | Out-File $Global:DnsBlocklistPath -Encoding UTF8
        
        Write-Log "[SYNC-BLOCKED] Blocked $($urls.Count) websites via hosts file" "SUCCESS"
        return @{ success = $true; blocked_count = $urls.Count; blocked_domains = $urls; method = "hosts_file"; synced_at = (Get-Date).ToString("o") }
        
    } catch {
        Write-Log "[SYNC-BLOCKED] Error: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-ServiceHealthCheck {
    param([object]$Payload)
    
    try {
        Write-Log "[SVC-HEALTH] Running service health check..." "INFO"
        
        $serviceNames = @()
        if ($Payload.services) { $serviceNames = @($Payload.services) }
        else { $serviceNames = @("WinDefend", "mpssvc", "EventLog", "wuauserv", "Dnscache", "BITS", "Schedule", "W32Time") }
        
        $results = @()
        $unhealthy = 0
        
        foreach ($svcName in $serviceNames) {
            $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
            if ($svc) {
                $startType = (Get-CimInstance Win32_Service -Filter "Name='$svcName'" -ErrorAction SilentlyContinue).StartMode
                $isHealthy = ($svc.Status -eq 'Running') -or ($startType -eq 'Disabled' -or $startType -eq 'Manual')
                if (-not $isHealthy) { $unhealthy++ }
                $results += @{ name = $svcName; display_name = $svc.DisplayName; status = $svc.Status.ToString(); start_type = $startType; healthy = $isHealthy }
            } else {
                $results += @{ name = $svcName; status = "not_found"; healthy = $false }
                $unhealthy++
            }
        }
        
        $svcLogLevel = if ($unhealthy -gt 0) { "WARN" } else { "SUCCESS" }
        Write-Log "[SVC-HEALTH] Checked $($results.Count) services, $unhealthy unhealthy" $svcLogLevel
        return @{ success = $true; services_checked = $results.Count; unhealthy_count = $unhealthy; services = $results; checked_at = (Get-Date).ToString("o") }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-NetworkDiagnostics {
    param([object]$Payload)
    
    try {
        Write-Log "[NET-DIAG] Running network diagnostics..." "INFO"
        
        $targets = @()
        if ($Payload.targets) { $targets = @($Payload.targets) }
        else { $targets = @("8.8.8.8", "1.1.1.1", $Global:ServerUrl -replace "^https?://", "") }
        
        $diagnostics = @()
        
        foreach ($target in $targets) {
            $diag = @{ target = $target }
            try { $ping = Test-Connection -ComputerName $target -Count 3 -ErrorAction Stop; $diag.ping = @{ success = $true; avg_ms = [math]::Round(($ping | Measure-Object -Property ResponseTime -Average).Average, 1); min_ms = ($ping | Measure-Object -Property ResponseTime -Minimum).Minimum; max_ms = ($ping | Measure-Object -Property ResponseTime -Maximum).Maximum; packets_sent = 3; packets_received = $ping.Count } } catch { $diag.ping = @{ success = $false; error = $_.Exception.Message } }
            try { $dns = Resolve-DnsName -Name $target -ErrorAction Stop | Select-Object -First 3; $diag.dns = @{ success = $true; records = @($dns | ForEach-Object { @{ name = $_.Name; type = $_.Type.ToString(); ip = $_.IPAddress } }) } } catch { $diag.dns = @{ success = $false; error = $_.Exception.Message } }
            try { $trace = Test-NetConnection -ComputerName $target -TraceRoute -ErrorAction Stop; $diag.traceroute = @{ success = $true; hops = @($trace.TraceRoute | Select-Object -First 10); remote_port = $trace.RemotePort; tcp_succeeded = $trace.TcpTestSucceeded } } catch { $diag.traceroute = @{ success = $false; error = $_.Exception.Message } }
            $diagnostics += $diag
        }
        
        Write-Log "[NET-DIAG] Completed diagnostics for $($targets.Count) targets" "SUCCESS"
        return @{ success = $true; targets_checked = $targets.Count; diagnostics = $diagnostics; checked_at = (Get-Date).ToString("o") }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-QuarantineAgent {
    param([object]$Payload)
    
    try {
        $action = if ($Payload.action -eq "release") { "release" } else { "quarantine" }
        Write-Log "[QUARANTINE] Action: $action" "WARN"
        
        $ruleName = "CyberShield-Quarantine"
        $serverHost = ([System.Uri]$Global:ServerUrl).Host
        
        if ($action -eq "quarantine") {
            New-NetFirewallRule -DisplayName "$ruleName-BlockAll" -Direction Outbound -Action Block -Profile Any -Enabled True -ErrorAction SilentlyContinue | Out-Null
            $serverIPs = [System.Net.Dns]::GetHostAddresses($serverHost) | ForEach-Object { $_.IPAddressToString }
            foreach ($ip in $serverIPs) {
                New-NetFirewallRule -DisplayName "$ruleName-AllowServer-$ip" -Direction Outbound -Action Allow -RemoteAddress $ip -Protocol TCP -Profile Any -Enabled True -ErrorAction SilentlyContinue | Out-Null
            }
            New-NetFirewallRule -DisplayName "$ruleName-AllowDNS" -Direction Outbound -Action Allow -RemotePort 53 -Protocol UDP -Profile Any -Enabled True -ErrorAction SilentlyContinue | Out-Null
            Write-Log "[QUARANTINE] Agent quarantined - only server communication allowed" "WARN"
            return @{ success = $true; action = "quarantined"; server_host = $serverHost; server_ips = $serverIPs; reason = $Payload.reason; quarantined_at = (Get-Date).ToString("o") }
        } else {
            Get-NetFirewallRule -DisplayName "$ruleName*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
            Write-Log "[QUARANTINE] Agent released from quarantine" "SUCCESS"
            return @{ success = $true; action = "released"; released_at = (Get-Date).ToString("o") }
        }
        
    } catch {
        Write-Log "[QUARANTINE] Error: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-ApplySecurityPatch {
    param([object]$Payload)
    
    try {
        Write-Log "[PATCH] Applying security patch..." "INFO"
        $kbId = $Payload.kb_id
        $cveId = $Payload.cve_id
        
        if ($kbId) {
            $installed = Get-HotFix -Id $kbId -ErrorAction SilentlyContinue
            if ($installed) {
                Write-Log "[PATCH] KB $kbId already installed" "INFO"
                return @{ success = $true; status = "already_installed"; kb_id = $kbId; installed_on = $installed.InstalledOn.ToString("o") }
            }
            
            try {
                $session = New-Object -ComObject Microsoft.Update.Session
                $searcher = $session.CreateUpdateSearcher()
                $searchResult = $searcher.Search("IsInstalled=0 AND Type='Software'")
                
                $targetUpdate = $null
                foreach ($update in $searchResult.Updates) {
                    foreach ($kb in $update.KBArticleIDs) {
                        if ("KB$kb" -eq $kbId -or $kb -eq ($kbId -replace "^KB", "")) { $targetUpdate = $update; break }
                    }
                    if ($targetUpdate) { break }
                }
                
                if ($targetUpdate) {
                    $updatesToInstall = New-Object -ComObject Microsoft.Update.UpdateColl
                    $updatesToInstall.Add($targetUpdate) | Out-Null
                    $downloader = $session.CreateUpdateDownloader()
                    $downloader.Updates = $updatesToInstall
                    $downloadResult = $downloader.Download()
                    $installer = $session.CreateUpdateInstaller()
                    $installer.Updates = $updatesToInstall
                    $installResult = $installer.Install()
                    
                    Write-Log "[PATCH] KB $kbId installed successfully (reboot: $($installResult.RebootRequired))" "SUCCESS"
                    return @{ success = $true; status = "installed"; kb_id = $kbId; reboot_required = $installResult.RebootRequired; patched_at = (Get-Date).ToString("o") }
                } else {
                    Write-Log "[PATCH] KB $kbId not found in available updates" "WARN"
                    return @{ success = $false; status = "not_found"; kb_id = $kbId; message = "Update not available via Windows Update" }
                }
                
            } catch {
                Write-Log "[PATCH] Windows Update COM failed: $($_.Exception.Message)" "WARN"
                return @{ success = $false; status = "wu_error"; error = $_.Exception.Message }
            }
        }
        
        return @{ success = $false; error = "No kb_id specified" }
        
    } catch {
        Write-Log "[PATCH] Error: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message }
    }
}
