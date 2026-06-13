<#
.SYNOPSIS
    Phase 4 split of remediation.ps1 — disk + network diagnostics.
#>

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
