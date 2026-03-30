<#
.SYNOPSIS
    System telemetry collection (CPU, RAM, disk, processes)
#>

function Get-SystemTelemetry {
    $telemetry = @{
        agent_id   = $script:Config.AgentId
        tenant_id  = $script:Config.TenantId
        timestamp  = (Get-Date -Format "o")
        hostname   = $env:COMPUTERNAME
        os_version = ""
        system_metrics = @{}
        processes  = @{}
    }

    try {
        $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
        if ($os) {
            $telemetry.os_version = $os.Caption
            $totalMem = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
            $freeMem = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
            $telemetry.system_metrics.memory_total_gb = $totalMem
            $telemetry.system_metrics.memory_free_gb = $freeMem
            $telemetry.system_metrics.memory_used_percent = if ($totalMem -gt 0) { [math]::Round((($totalMem - $freeMem) / $totalMem) * 100, 1) } else { 0 }
        }
    }
    catch {
        Write-Log "Failed to collect OS info: $($_.Exception.Message)" "WARN"
    }

    try {
        $cpu = Get-Counter "\Processor(_Total)\% Processor Time" -SampleInterval 1 -MaxSamples 1 -ErrorAction SilentlyContinue
        if ($cpu) {
            $telemetry.system_metrics.cpu_percent = [math]::Round($cpu.CounterSamples[0].CookedValue, 1)
        }
    }
    catch {
        Write-Log "Failed to collect CPU metrics: $($_.Exception.Message)" "WARN"
    }

    try {
        $drive = Get-PSDrive C -ErrorAction SilentlyContinue
        if ($drive) {
            $telemetry.system_metrics.disk_total_gb = [math]::Round(($drive.Used + $drive.Free) / 1GB, 2)
            $telemetry.system_metrics.disk_free_gb = [math]::Round($drive.Free / 1GB, 2)
            $total = $drive.Used + $drive.Free
            $telemetry.system_metrics.disk_used_percent = if ($total -gt 0) { [math]::Round(($drive.Used / $total) * 100, 1) } else { 0 }
        }
    }
    catch {
        Write-Log "Failed to collect disk metrics: $($_.Exception.Message)" "WARN"
    }

    try {
        $procs = Get-Process -ErrorAction SilentlyContinue | Sort-Object CPU -Descending | Select-Object -First 10
        $telemetry.processes.total_processes = (Get-Process -ErrorAction SilentlyContinue).Count
        $telemetry.processes.top_by_cpu = @($procs | ForEach-Object {
            @{
                pid        = $_.Id
                name       = $_.ProcessName
                cpu_seconds = [math]::Round($_.CPU, 2)
                memory_mb  = [math]::Round($_.WorkingSet64 / 1MB, 2)
            }
        })
    }
    catch {
        Write-Log "Failed to collect process metrics: $($_.Exception.Message)" "WARN"
    }

    return $telemetry
}
