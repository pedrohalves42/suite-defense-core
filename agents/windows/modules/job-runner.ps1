<#
.SYNOPSIS
    Job execution with timeout, circuit breaker, and typed job dispatcher.
    NO arbitrary command execution — all jobs routed through whitelisted handlers.
#>

$script:ConsecutiveFailures = 0
$script:CircuitBreakerOpen = $false
$script:CircuitBreakerCooldown = 300

# ============================================
#  PROTECTED RESOURCES
# ============================================
$script:ProtectedProcesses = @(
    'system', 'smss', 'csrss', 'wininit', 'winlogon', 'services',
    'lsass', 'svchost', 'explorer', 'dwm', 'spoolsv', 'msdtc'
)
$script:ProtectedServices = @(
    'wuauserv', 'WinDefend', 'EventLog', 'Dhcp', 'Dnscache',
    'LanmanServer', 'LanmanWorkstation', 'RpcSs', 'Schedule', 'Spooler'
)

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
                    $result = Invoke-AgentJob -JobId $cmd.id -JobType $cmd.job_type -Payload $cmd.payload -Timeout ($cmd.timeout_seconds)
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

# ============================================
#  JOB DISPATCHER (whitelisted job types only)
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
            "software_inventory_collect" { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Get-SoftwareInventory } }
            "collect_antivirus_status"   { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Get-AntivirusStatus } }
            "collect_network_info"       { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Get-NetworkInfo } }
            "kill_process"               { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Stop-TargetProcess -Payload $Payload } }
            "stop_service"               { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Stop-TargetService -Payload $Payload } }
            "disable_service"            { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Disable-TargetService -Payload $Payload } }
            "restart_service"            { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Restart-TargetService -Payload $Payload } }
            "collect_web_activity"       { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Get-WebActivity } }
            "light_vuln_scan"            { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Get-LightVulnScan } }
            "update_agent"               { @{ success = $true; message = "Update delegated to heartbeat force_update mechanism"; agent_version = $script:Config.Version } }
            "scan"                       { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Get-SecurityScan } }
            "report"                     { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Get-SystemReport } }
            "collect_info"               { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Get-SystemInfo } }
            "reinstall_agent"            { @{ success = $true; message = "Reinstall delegated to force_update mechanism" } }
            "collect_dns_blocks"         { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Get-DnsBlocks } }
            "integration_test_v3"        { @{ pong = $true; agent_version = $script:Config.Version; timestamp = (Get-Date -Format "o"); hostname = $env:COMPUTERNAME } }
            "disk_cleanup"               { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-DiskCleanup } }
            "network_diagnostics"        { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Test-NetworkDiagnostics -Payload $Payload } }
            "service_health_check"       { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Get-ServiceHealthCheck -Payload $Payload } }
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
# ============================================
function Invoke-JobWithTimeout {
    param(
        [string]$JobId,
        [int]$Timeout = 30,
        [scriptblock]$Handler
    )

    $job = Start-Job -ScriptBlock $Handler
    $completed = $job | Wait-Job -Timeout $Timeout

    if ($null -eq $completed) {
        Stop-Job $job -ErrorAction SilentlyContinue
        Remove-Job $job -Force -ErrorAction SilentlyContinue
        Write-Log "Job $JobId timed out" "WARN"
        return @{ success = $false; error = "Timeout after ${Timeout}s"; exit_code = -1; output = "" }
    }

    $output = Receive-Job $job
    Remove-Job $job -Force -ErrorAction SilentlyContinue

    return @{ success = $true; output = ($output | Out-String); exit_code = 0 }
}

# ============================================
#  TYPED JOB HANDLERS
# ============================================

function Get-SoftwareInventory {
    $apps = Get-ItemProperty "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
                              "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName } |
        Select-Object DisplayName, DisplayVersion, Publisher, InstallDate |
        ForEach-Object { @{ name = $_.DisplayName; version = $_.DisplayVersion; publisher = $_.Publisher } }
    @{ software_count = ($apps | Measure-Object).Count; software_list = @($apps); collected_at = (Get-Date -Format "o") }
}

function Get-AntivirusStatus {
    $avProducts = @()
    try {
        $products = Get-CimInstance -Namespace "root/SecurityCenter2" -ClassName "AntiVirusProduct" -ErrorAction Stop
        foreach ($p in $products) {
            $avProducts += @{ name = $p.displayName; state = $p.productState; path = $p.pathToSignedProductExe }
        }
    } catch {
        $avProducts += @{ name = "Windows Defender"; state = "query_failed" }
    }
    @{ antivirus_products = $avProducts; collected_at = (Get-Date -Format "o") }
}

function Get-NetworkInfo {
    $adapters = Get-NetAdapter -ErrorAction SilentlyContinue |
        Select-Object Name, MacAddress, Status, LinkSpeed |
        ForEach-Object { @{ name = $_.Name; mac = $_.MacAddress; state = $_.Status } }
    $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -ne "127.0.0.1" } |
        ForEach-Object { @{ ip = $_.IPAddress; prefix = $_.PrefixLength } }
    @{ adapters = @($adapters); ip_addresses = @($ips); collected_at = (Get-Date -Format "o") }
}

function Stop-TargetProcess {
    param([object]$Payload)
    $pname = if ($Payload -and $Payload.process_name) { $Payload.process_name } else { "" }
    if (-not $pname) { return @{ success = $false; error = "Missing process_name" } }

    if ($script:ProtectedProcesses -contains $pname.ToLower()) {
        return @{ success = $false; error = "SECURITY_BLOCK: protected process"; blocked = $true }
    }

    $procs = Get-Process -Name $pname -ErrorAction SilentlyContinue
    if (-not $procs) { return @{ success = $true; killed = 0 } }

    $force = if ($Payload -and $Payload.force) { $Payload.force } else { $false }
    $killed = 0
    foreach ($p in $procs) {
        try {
            if ($force) { $p | Stop-Process -Force -ErrorAction Stop } else { $p | Stop-Process -ErrorAction Stop }
            $killed++
        } catch { }
    }
    @{ success = $true; killed = $killed; total_found = ($procs | Measure-Object).Count }
}

function Stop-TargetService {
    param([object]$Payload)
    $svc = if ($Payload -and $Payload.service_name) { $Payload.service_name } else { "" }
    if (-not $svc) { return @{ success = $false; error = "Missing service_name" } }
    if ($script:ProtectedServices -contains $svc) { return @{ success = $false; error = "SECURITY_BLOCK"; blocked = $true } }

    try {
        Stop-Service -Name $svc -Force -ErrorAction Stop
        @{ success = $true; service = $svc; status = "stopped" }
    } catch {
        @{ success = $false; error = "Failed to stop: $($_.Exception.Message)" }
    }
}

function Disable-TargetService {
    param([object]$Payload)
    $svc = if ($Payload -and $Payload.service_name) { $Payload.service_name } else { "" }
    if (-not $svc) { return @{ success = $false; error = "Missing service_name" } }
    if ($script:ProtectedServices -contains $svc) { return @{ success = $false; error = "SECURITY_BLOCK"; blocked = $true } }

    try {
        Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
        Set-Service -Name $svc -StartupType Disabled -ErrorAction Stop
        @{ success = $true; service = $svc; status = "disabled" }
    } catch {
        @{ success = $false; error = "Failed to disable: $($_.Exception.Message)" }
    }
}

function Restart-TargetService {
    param([object]$Payload)
    $svc = if ($Payload -and $Payload.service_name) { $Payload.service_name } else { "" }
    if (-not $svc) { return @{ success = $false; error = "Missing service_name" } }

    try {
        Restart-Service -Name $svc -Force -ErrorAction Stop
        @{ success = $true; service = $svc; status = "restarted" }
    } catch {
        @{ success = $false; error = "Failed to restart: $($_.Exception.Message)" }
    }
}

function Get-WebActivity {
    $dns = @()
    try {
        $dns = Get-DnsClientCache -ErrorAction SilentlyContinue |
            Select-Object -First 50 Entry, RecordName, Data |
            ForEach-Object { @{ entry = $_.Entry; data = $_.Data } }
    } catch { }
    @{ dns_cache = @($dns); browser_history = @(); source = "windows" }
}

function Get-LightVulnScan {
    $updates = @()
    $total = 0
    try {
        $session = New-Object -ComObject Microsoft.Update.Session -ErrorAction Stop
        $searcher = $session.CreateUpdateSearcher()
        $result = $searcher.Search("IsInstalled=0 AND IsHidden=0")
        $total = $result.Updates.Count
        foreach ($u in ($result.Updates | Select-Object -First 20)) {
            $updates += @{ title = $u.Title; severity = $u.MsrcSeverity }
        }
    } catch { }
    @{ vulnerabilities = $updates; summary = @{ total = $total }; scan_tool = "WindowsUpdate"; platform = "windows" }
}

function Get-SecurityScan {
    $ports = @()
    try {
        $ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 20 LocalAddress, LocalPort, OwningProcess |
            ForEach-Object { @{ address = $_.LocalAddress; port = $_.LocalPort; pid = $_.OwningProcess } }
    } catch { }
    $users = @()
    try {
        $users = query user 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    } catch { }
    @{ open_ports = @($ports); logged_users = @($users) }
}

function Get-SystemReport {
    $disk = @{}
    try {
        $d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction Stop
        $disk = @{ total_gb = [math]::Round($d.Size / 1GB, 2); free_gb = [math]::Round($d.FreeSpace / 1GB, 2); percent = [math]::Round(($d.Size - $d.FreeSpace) / $d.Size * 100, 1) }
    } catch { }
    $mem = @{}
    try {
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
        $mem = @{ total_mb = [math]::Round($os.TotalVisibleMemorySize / 1KB); free_mb = [math]::Round($os.FreePhysicalMemory / 1KB) }
    } catch { }
    @{ agent_version = $script:Config.Version; disk = $disk; memory = $mem }
}

function Get-SystemInfo {
    @{
        hostname      = $env:COMPUTERNAME
        os_version    = [System.Environment]::OSVersion.VersionString
        architecture  = $env:PROCESSOR_ARCHITECTURE
        agent_version = $script:Config.Version
    }
}

function Get-DnsBlocks {
    $blocks = @()
    $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
    if (Test-Path $hostsPath) {
        $blocks = Get-Content $hostsPath -ErrorAction SilentlyContinue |
            Where-Object { $_ -match "^(0\.0\.0\.0|127\.0\.0\.1)" -and $_ -notmatch "localhost" } |
            ForEach-Object { ($_ -split '\s+')[1] } |
            Select-Object -First 100
    }
    @{ blocked_domains = @($blocks); source = "hosts" }
}

function Invoke-DiskCleanup {
    $before = (Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction SilentlyContinue).FreeSpace
    try {
        Get-ChildItem "$env:TEMP\*" -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.LastAccessTime -lt (Get-Date).AddDays(-7) } |
            Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
    } catch { }
    $after = (Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction SilentlyContinue).FreeSpace
    $freed = if ($before -and $after) { [math]::Round(($after - $before) / 1GB, 2) } else { 0 }
    @{ success = $true; freed_gb = $freed }
}

function Test-NetworkDiagnostics {
    param([object]$Payload)
    $targets = if ($Payload -and $Payload.targets) { $Payload.targets } else { @("8.8.8.8") }
    $results = @()
    foreach ($t in $targets) {
        # Validate target is IP or hostname (no shell metacharacters)
        if ($t -notmatch '^[a-zA-Z0-9\.\-]+$') {
            $results += @{ target = $t; reachable = $false; error = "Invalid target format" }
            continue
        }
        $ok = Test-Connection -ComputerName $t -Count 1 -Quiet -ErrorAction SilentlyContinue
        $results += @{ target = $t; reachable = $ok }
    }
    @{ diagnostics = $results }
}

function Get-ServiceHealthCheck {
    param([object]$Payload)
    $svcs = if ($Payload -and $Payload.services) { $Payload.services } else { @("wuauserv", "WinDefend") }
    $results = @()
    foreach ($s in $svcs) {
        $status = "unknown"
        try {
            $svc = Get-Service -Name $s -ErrorAction Stop
            $status = $svc.Status.ToString().ToLower()
        } catch { $status = "not_found" }
        $results += @{ name = $s; status = $status }
    }
    @{ services_checked = $results.Count; services = $results }
}
