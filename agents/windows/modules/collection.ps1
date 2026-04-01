<#
.SYNOPSIS
    CyberShield Agent v6.0 - Data Collection Module
.DESCRIPTION
    Software inventory, AV status, network info, web activity, DNS blocks,
    vuln scan, report, scan, process lineage, EDR telemetry, backup status.
    Depends on: utils.ps1, network.ps1, evidence.ps1
#>

function Invoke-CollectSoftwareInventory {
    param([object]$Payload)
    try {
        $software = @()
        $regPaths = @("HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*")
        foreach ($path in $regPaths) {
            Get-ItemProperty $path -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {
                $software += @{ name = $_.DisplayName; version = $_.DisplayVersion; publisher = $_.Publisher; install_date = $_.InstallDate }
            }
        }
        return @{ software_count = $software.Count; software_list = $software | Select-Object -First 500; collected_at = (Get-Date).ToString("o") }
    } catch { return @{ error = $_.Exception.Message } }
}

function Invoke-CollectAntivirusStatus {
    try {
        $avProducts = Get-CimInstance -Namespace "root/SecurityCenter2" -ClassName AntiVirusProduct -ErrorAction SilentlyContinue
        $avList = @()
        foreach ($av in $avProducts) {
            $avList += @{ name = $av.displayName; state = $av.productState; path = $av.pathToSignedProductExe; source = "SecurityCenter2" }
        }

        $edrSignatures = @(
            @{ Name = "CrowdStrike Falcon";    Services = @("CSFalconService","csagent");         Processes = @("CSFalconContainer.exe","CSFalconService.exe") },
            @{ Name = "SentinelOne";            Services = @("SentinelAgent","SentinelOne");       Processes = @("SentinelAgent.exe","SentinelServiceHost.exe") },
            @{ Name = "Carbon Black";           Services = @("CbDefense","CarbonBlack");           Processes = @("RepMgr.exe","cb.exe") },
            @{ Name = "Cortex XDR";             Services = @("CortexXDR","cyserver");              Processes = @("cortex-xdr.exe","cytray.exe") },
            @{ Name = "Microsoft Defender ATP"; Services = @("Sense","WdNisSvc");                  Processes = @("MsSense.exe","MsMpEng.exe") },
            @{ Name = "Trend Micro Apex One";   Services = @("ntrtscan","TmListen","ds_agent");    Processes = @("ntrtscan.exe","PccNTMon.exe") },
            @{ Name = "Sophos Intercept X";     Services = @("Sophos Endpoint Defense","SAVService"); Processes = @("SophosUI.exe","SSPService.exe") },
            @{ Name = "Symantec Endpoint";      Services = @("SepMasterService","ccSvcHst");       Processes = @("ccSvcHst.exe","smc.exe") },
            @{ Name = "ESET Endpoint";          Services = @("ekrn","ERAAgent");                   Processes = @("ekrn.exe","egui.exe") },
            @{ Name = "Kaspersky Endpoint";     Services = @("AVP","klnagent");                    Processes = @("avp.exe","klnagent.exe") },
            @{ Name = "Bitdefender GravityZone";Services = @("EPSecurityService","BDAuxSrv");      Processes = @("EPSecurityService.exe","bdagent.exe") },
            @{ Name = "FortiClient";            Services = @("FortiClientMonitor","FA_Scheduler");  Processes = @("FortiClient.exe","FortiTray.exe") },
            @{ Name = "Cylance";                Services = @("CylanceSvc");                        Processes = @("CylanceSvc.exe","CylanceUI.exe") },
            @{ Name = "Malwarebytes";          Services = @("MBAMService","MBEndpointAgent","MBAMProtection","MBAMSwissArmy","MBAMChameleon","MBAMFarflt","MBAMWebProtection"); Processes = @("MBAMService.exe","mbamtray.exe","mbam.exe","MBEndpointAgent.exe","MBAMInstallerService.exe") },
            @{ Name = "Webroot";                Services = @("WRSVC");                             Processes = @("WRSA.exe") }
        )

        $knownNames = $avList | ForEach-Object { $_.name.ToLower() }
        foreach ($edr in $edrSignatures) {
            $alreadyDetected = $false
            foreach ($known in $knownNames) { if ($known -like "*$($edr.Name.Split(' ')[0].ToLower())*") { $alreadyDetected = $true; break } }
            if ($alreadyDetected) { continue }
            $foundService = $null; $foundProcess = $null
            foreach ($svcName in $edr.Services) { $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue; if ($svc) { $foundService = $svc; break } }
            if (-not $foundService) { foreach ($procName in $edr.Processes) { $proc = Get-Process -Name ($procName -replace '\.exe$','') -ErrorAction SilentlyContinue; if ($proc) { $foundProcess = $proc; break } } }
            if ($foundService -or $foundProcess) {
                $status = "unknown"
                if ($foundService) { $status = if ($foundService.Status -eq "Running") { "active" } else { "stopped" } } elseif ($foundProcess) { $status = "active" }
                $avList += @{ name = $edr.Name; state = 0; path = if ($foundProcess) { $foundProcess.Path } elseif ($foundService) { $foundService.BinaryPathName } else { "" }; source = "EDR_Process_Detection"; status = $status }
            }
        }

        $installPaths = @( @{ Name = "Malwarebytes"; Paths = @("$env:ProgramFiles\Malwarebytes\Anti-Malware", "${env:ProgramFiles(x86)}\Malwarebytes\Anti-Malware", "$env:ProgramData\Malwarebytes") }, @{ Name = "HitmanPro"; Paths = @("$env:ProgramFiles\HitmanPro", "${env:ProgramFiles(x86)}\HitmanPro") } )
        $currentNames = $avList | ForEach-Object { $_.name.ToLower() }
        foreach ($app in $installPaths) {
            if ($currentNames -contains $app.Name.ToLower()) { continue }
            foreach ($p in $app.Paths) { if (Test-Path $p) { $avList += @{ name = $app.Name; state = 0; path = $p; source = "InstallPath_Detection"; status = "installed" }; break } }
        }

        return @{ antivirus_products = $avList; count = $avList.Count; collected_at = (Get-Date).ToString("o") }
    } catch { return @{ error = $_.Exception.Message } }
}

function Invoke-CollectNetworkInfo {
    $rawAdapters = @()
    try {
        $adapters = @()
        try { $rawAdapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Up" }; foreach ($a in $rawAdapters) { $ipAddr = ""; try { $ipObj = Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1; if ($ipObj) { $ipAddr = $ipObj.IPAddress } } catch {}; $adapters += @{ name = $a.Name; ip_address = $ipAddr; mac_address = $a.MacAddress; status = "Up"; speed = if ($a.LinkSpeed) { $a.LinkSpeed } else { "" } } } } catch {}
        $ipConfig = @(); try { $ipConfig = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -ne "127.0.0.1" } | ForEach-Object { @{ ip = $_.IPAddress; prefix = $_.PrefixLength } }) } catch {}
        $fwDomain = $null; $fwPrivate = $null; $fwPublic = $null
        try { $fwProfiles = Get-NetFirewallProfile -ErrorAction SilentlyContinue; foreach ($p in $fwProfiles) { switch ($p.Name) { "Domain" { $fwDomain = [bool]$p.Enabled } "Private" { $fwPrivate = [bool]$p.Enabled } "Public" { $fwPublic = [bool]$p.Enabled } } } } catch {}
        $openPorts = @(); try { $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -First 50; foreach ($l in $listeners) { $procName = ""; try { $procName = (Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue).ProcessName } catch {}; $openPorts += @{ port = $l.LocalPort; process = $procName; protocol = "TCP" } } } catch {}
        $activeConns = @(); try { $established = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Select-Object -First 100; foreach ($c in $established) { $activeConns += @{ remote_address = $c.RemoteAddress; remote_port = $c.RemotePort; state = "Established" } } } catch {}
        $dnsServers = @(); try { $dnsRaw = Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.ServerAddresses.Count -gt 0 }; $dnsServers = @($dnsRaw.ServerAddresses | Select-Object -Unique | Where-Object { $_ -and $_ -ne "" }) } catch {}
        $gatewayIp = $null; try { $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue | Select-Object -First 1; if ($route) { $gatewayIp = $route.NextHop } } catch {}
        $publicIp = $null; try { $publicIp = (Invoke-RestMethod -Uri "https://api.ipify.org?format=text" -TimeoutSec 3 -ErrorAction SilentlyContinue).Trim() } catch {}
        $dnsTestSuccess = $null; try { $dnsResult = Resolve-DnsName -Name "google.com" -Type A -DnsOnly -ErrorAction SilentlyContinue; $dnsTestSuccess = ($null -ne $dnsResult -and $dnsResult.Count -gt 0) } catch { $dnsTestSuccess = $false }
        $httpsTestSuccess = $null; try { $httpResp = Invoke-WebRequest -Uri "https://www.google.com" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue; $httpsTestSuccess = ($httpResp.StatusCode -eq 200) } catch { $httpsTestSuccess = $false }

        return @{
            adapters = @($rawAdapters | ForEach-Object { @{ Name = $_.Name; MacAddress = $_.MacAddress; LinkSpeed = $_.LinkSpeed } })
            ip_addresses = $ipConfig; network_adapters = $adapters
            firewall_domain = $fwDomain; firewall_private = $fwPrivate; firewall_public = $fwPublic
            open_ports = $openPorts; active_connections = $activeConns
            dns_servers = $dnsServers; gateway_ip = $gatewayIp; public_ip = $publicIp
            dns_test_success = $dnsTestSuccess; https_test_success = $httpsTestSuccess
            collected_at = (Get-Date).ToString("o")
        }
    } catch { return @{ error = $_.Exception.Message } }
}

function ConvertFrom-WebKitTimestamp {
    param([Nullable[Int64]]$timestamp)
    if (-not $timestamp -or $timestamp -le 0) { return $null }
    try { $origin = [DateTime]::new(1601, 1, 1, 0, 0, 0, [DateTimeKind]::Utc); return $origin.AddTicks($timestamp * 10) } catch { return $null }
}

function ConvertFrom-PRTime {
    param([Nullable[Int64]]$timestamp)
    if (-not $timestamp -or $timestamp -le 0) { return $null }
    try { return [DateTimeOffset]::FromUnixTimeMilliseconds([math]::Floor($timestamp / 1000)).UtcDateTime } catch { return $null }
}

function Extract-DomainFromUrl {
    param([string]$url)
    if ([string]::IsNullOrWhiteSpace($url)) { return $null }
    try { $match = [regex]::Match($url, 'https?://([a-zA-Z0-9][a-zA-Z0-9\-\.]*[a-zA-Z0-9]\.[a-zA-Z]{2,})'); if ($match.Success) { return $match.Groups[1].Value } } catch {}
    return $null
}

function Get-BrowserHistorySQLite {
    param([string]$DbPath, [string]$Query, [string]$BrowserName, [string]$UserName)
    $results = New-Object System.Collections.ArrayList
    try {
        $fileInfo = Get-Item $DbPath -ErrorAction Stop
        if ($fileInfo.Length -gt (200 * 1024 * 1024)) { return $null }
        $assembly = $null; try { $assembly = [System.Reflection.Assembly]::LoadWithPartialName("System.Data.SQLite") } catch {}
        if (-not $assembly) { return $null }
        $connectionString = "Data Source=$DbPath;Version=3;Read Only=True;Journal Mode=Off;"
        $connection = New-Object System.Data.SQLite.SQLiteConnection($connectionString); $connection.Open()
        $command = $connection.CreateCommand(); $command.CommandText = $Query; $command.CommandTimeout = 2
        $reader = $command.ExecuteReader()
        while ($reader.Read()) { [void]$results.Add(@{ url = $reader["url"]; last_visit_time = $reader["last_visit_time"]; visit_count = $reader["visit_count"] }) }
        $reader.Close(); $connection.Close()
        return $results
    } catch { Write-Log "[WEB-ACTIVITY] SQLite failed for $BrowserName ($UserName): $($_.Exception.Message)" "DEBUG"; return $null }
}

function Invoke-CollectWebActivity {
    param([object]$Payload)
    Write-Log "[WEB-ACTIVITY-V5] Starting web activity collection (timeout-safe)..." "INFO"
    $maxDomains = 500
    if ($null -ne $Payload) { try { $payloadProps = @($Payload.PSObject.Properties | ForEach-Object { $_.Name }); if ($payloadProps -contains "max_domains") { $maxDomains = [int]$Payload.max_domains } } catch { } }
    try {
        $nowUtc = [DateTime]::UtcNow; $dnsCache = New-Object System.Collections.ArrayList; $browserHistory = New-Object System.Collections.ArrayList; $deadline = $nowUtc.AddSeconds(45)
        Write-Log "[WEB-ACTIVITY-V5] Collecting DNS cache..." "INFO"
        try { $dnsEntries = Get-DnsClientCache -ErrorAction SilentlyContinue; if ($dnsEntries) { $dnsEntries = $dnsEntries | Where-Object { $_.Entry -and $_.Name } | Sort-Object -Property Name -Unique | Select-Object -First 100; foreach ($entry in $dnsEntries) { $domain = $entry.Name; if ([string]::IsNullOrWhiteSpace($domain)) { continue }; if ($domain -like "localhost*" -or $domain -like "*.local" -or $domain -like "local") { continue }; [void]$dnsCache.Add(@{ domain = $domain; Name = $domain; RecordName = $domain; source = "dns_cache"; visited_at = $nowUtc.ToString("o") }) }; Write-Log "[WEB-ACTIVITY-V5] DNS cache: $($dnsCache.Count) domains" "INFO" } } catch { Write-Log "[WEB-ACTIVITY-V5] DNS cache error: $($_.Exception.Message)" "WARN" }
        Write-Log "[WEB-ACTIVITY-V5] Collecting browser history (regex-safe mode)..." "INFO"
        $userProfiles = @(); try { $userProfiles = Get-ChildItem -Path "C:\Users" -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notin @('Public', 'Default', 'Default User', 'All Users') } } catch {}
        foreach ($userProfile in $userProfiles) {
            if ([DateTime]::UtcNow -gt $deadline) { Write-Log "[WEB-ACTIVITY-V5] Timeout reached, stopping browser collection" "WARN"; break }
            $userName = $userProfile.Name; $userPath = $userProfile.FullName
            $browserPaths = @( @{ path = "AppData\Local\Google\Chrome\User Data\Default\History"; browser = "chrome" }, @{ path = "AppData\Local\Microsoft\Edge\User Data\Default\History"; browser = "edge" }, @{ path = "AppData\Roaming\Opera Software\Opera Stable\History"; browser = "opera" }, @{ path = "AppData\Roaming\Opera Software\Opera GX Stable\History"; browser = "opera_gx" }, @{ path = "AppData\Local\BraveSoftware\Brave-Browser\User Data\Default\History"; browser = "brave" }, @{ path = "AppData\Local\Vivaldi\User Data\Default\History"; browser = "vivaldi" } )
            foreach ($bp in $browserPaths) {
                if ([DateTime]::UtcNow -gt $deadline) { break }
                try {
                    $historyPath = Join-Path $userPath $bp.path; if (-not (Test-Path $historyPath)) { continue }
                    $tempPath = "$env:TEMP\$($bp.browser)_history_$(Get-Random).db"; Copy-Item -Path $historyPath -Destination $tempPath -Force -ErrorAction SilentlyContinue; if (-not (Test-Path $tempPath)) { continue }
                    try { $maxBytes = 2 * 1024 * 1024; $fileInfo = Get-Item $tempPath -ErrorAction SilentlyContinue; if ($fileInfo -and $fileInfo.Length -gt 0) { $bytesToRead = [Math]::Min($fileInfo.Length, $maxBytes); $fileStream = [System.IO.File]::OpenRead($tempPath); $buffer = New-Object byte[] $bytesToRead; [void]$fileStream.Read($buffer, 0, $bytesToRead); $fileStream.Close(); $fileStream.Dispose(); if ($buffer) { $dataString = [System.Text.Encoding]::UTF8.GetString($buffer); $urlMatches = [regex]::Matches($dataString, 'https?://([a-zA-Z0-9][a-zA-Z0-9\-\.]*[a-zA-Z0-9]\.[a-zA-Z]{2,})'); $domains = $urlMatches | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -notlike "localhost*" -and $_ -notlike "*.local" -and $_ -notlike "*.localdomain" } | Select-Object -Unique -First 50; foreach ($domain in $domains) { [void]$browserHistory.Add(@{ domain = $domain; source = $bp.browser; browser = $bp.browser; visited_at = $nowUtc.ToString("o"); visit_count = 1 }) }; $buffer = $null; $dataString = $null } } } catch { Write-Log "[WEB-ACTIVITY-V5] $($bp.browser) regex failed for $userName : $($_.Exception.Message)" "DEBUG" }
                    Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
                } catch {}
            }
        }
        Write-Log "[WEB-ACTIVITY-V5] Collected: $($dnsCache.Count) DNS + $($browserHistory.Count) browser entries" "INFO"
        return @{ dns_cache = @($dnsCache); browser_history = @($browserHistory); total_dns = $dnsCache.Count; total_browser = $browserHistory.Count; collected_at = $nowUtc.ToString("o") }
    } catch { Write-Log "[WEB-ACTIVITY-V5] Error: $($_.Exception.Message)" "ERROR"; return @{ error = $_.Exception.Message } }
}

function Invoke-CollectDnsBlocks {
    Write-Log "[JOB] Collecting DNS blocks from hosts file" "INFO"
    try {
        $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"; $blockedDomains = @()
        if (Test-Path $hostsPath) {
            $lines = Get-Content $hostsPath -ErrorAction SilentlyContinue
            foreach ($line in $lines) { $trimmed = $line.Trim(); if ($trimmed -match "^(0\.0\.0\.0|127\.0\.0\.1)\s+(.+)" -and $trimmed -notmatch "localhost") { $domain = $Matches[2].Trim(); if ($domain -and $blockedDomains.Count -lt 100) { $blockedDomains += $domain } } }
        }
        return @{ blocked_domains = $blockedDomains; source = $hostsPath; collected_at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"); count = $blockedDomains.Count }
    } catch { Write-Log "[JOB] DNS blocks collection failed: $_" "WARN"; return @{ blocked_domains = @(); source = "error"; error = $_.ToString(); collected_at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ") } }
}

function Invoke-LightVulnScan {
    param([object]$Payload)
    Write-Log "[VULN-SCAN] Starting light vulnerability scan..." "INFO"
    try {
        $results = @{ timestamp = (Get-Date).ToUniversalTime().ToString("o"); hostname = $env:COMPUTERNAME; scan_engine = "CyberShield VulnScanner v2.1"; scan_type = "light"; vulnerabilities_found = 0; by_severity = @{ critical = 0; high = 0; medium = 0; low = 0 }; top_cves = @(); patches_available = 0; scan_duration_seconds = 0; status = "success" }
        $startTime = Get-Date
        try {
            $updateSession = New-Object -ComObject Microsoft.Update.Session; $searcher = $updateSession.CreateUpdateSearcher(); $searchResult = $searcher.Search("IsInstalled=0 AND IsHidden=0")
            foreach ($update in $searchResult.Updates) {
                $results.vulnerabilities_found++
                $severity = $update.MsrcSeverity
                switch ($severity) { 'Critical' { $results.by_severity.critical++ } 'Important' { $results.by_severity.high++ } 'Moderate' { $results.by_severity.medium++ } default { $results.by_severity.low++ } }
                foreach ($kb in $update.KBArticleIDs) { if ($results.top_cves.Count -lt 20) { $results.top_cves += @{ kb = "KB$kb"; title = $update.Title; severity = $severity; size_mb = [math]::Round($update.MaxDownloadSize / 1MB, 1) } } }
                $results.patches_available++
            }
        } catch { Write-Log "[VULN-SCAN] WU scan error: $($_.Exception.Message)" "WARN"; $results.status = "partial" }
        $results.scan_duration_seconds = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
        Write-Log "[VULN-SCAN] Found $($results.vulnerabilities_found) vulnerabilities ($($results.by_severity.critical) critical)" "INFO"
        return $results
    } catch { Write-Log "[VULN-SCAN] Error: $($_.Exception.Message)" "ERROR"; return @{ status = "failed"; error = $_.Exception.Message } }
}

function Invoke-ReportJob {
    try { return @{ hostname = $env:COMPUTERNAME; agent_version = $Global:AgentVersion; system_info = Get-SystemInfo; collected_at = (Get-Date).ToString("o") } }
    catch { return @{ error = $_.Exception.Message } }
}

function Invoke-ScanJob {
    param([object]$Payload)
    try {
        $scanResult = @{ hostname = $env:COMPUTERNAME; agent_version = $Global:AgentVersion; antivirus = Invoke-CollectAntivirusStatus; network = Invoke-CollectNetworkInfo; software = Invoke-CollectSoftwareInventory -Payload $Payload; vuln_scan = Invoke-LightVulnScan -Payload $Payload; collected_at = (Get-Date).ToString("o") }
        Write-Log "[SCAN] Complete scan finished" "SUCCESS"
        return $scanResult
    } catch { return @{ error = $_.Exception.Message } }
}

function Invoke-CollectBackupStatus {
    param([object]$Payload)
    Write-Log "[BACKUP] Collecting backup status..." "INFO"
    try {
        $backupInfo = @{ windows_backup = @{ enabled = $false; last_backup = $null }; vss_shadows = @(); collected_at = (Get-Date).ToString("o") }
        try { $wbSummary = Get-WBSummary -ErrorAction SilentlyContinue; if ($wbSummary) { $backupInfo.windows_backup = @{ enabled = $true; last_backup = if ($wbSummary.LastBackupTime) { $wbSummary.LastBackupTime.ToString("o") } else { $null }; last_result = $wbSummary.LastBackupResultHR; next_backup = if ($wbSummary.NextBackupTime) { $wbSummary.NextBackupTime.ToString("o") } else { $null } } } } catch { Write-Log "[BACKUP] Windows Backup not available: $($_.Exception.Message)" "DEBUG" }
        try { $shadows = Get-CimInstance Win32_ShadowCopy -ErrorAction SilentlyContinue; if ($shadows) { $backupInfo.vss_shadows = @($shadows | Select-Object -First 10 | ForEach-Object { @{ id = $_.ID; volume = $_.VolumeName; created_at = $_.InstallDate.ToString("o"); size_bytes = $_.MaxSpace } }) } } catch { Write-Log "[BACKUP] VSS check failed: $($_.Exception.Message)" "DEBUG" }
        $backupSoftware = @(); $knownBackupProcesses = @("veeam", "acronis", "carbonite", "backblaze", "crashplan", "cobian")
        $runningProcesses = Get-Process -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName -Unique
        foreach ($bp in $knownBackupProcesses) { $found = $runningProcesses | Where-Object { $_ -like "*$bp*" }; if ($found) { $backupSoftware += @{ name = $bp; running = $true } } }
        $backupInfo['third_party_software'] = $backupSoftware
        Write-Log "[BACKUP] Backup status collected. VSS shadows: $($backupInfo.vss_shadows.Count)" "INFO"
        return $backupInfo
    } catch { Write-Log "[BACKUP] Error: $($_.Exception.Message)" "ERROR"; return @{ error = $_.Exception.Message; collected_at = (Get-Date).ToString("o") } }
}

function Invoke-CollectProcessLineage {
    param([object]$Payload)
    Write-Log "[PROCESS-LINEAGE] Collecting process tree for EDR visibility..." "INFO"
    try {
        $rawProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Select-Object ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath, CreationDate
        $processes = $rawProcesses
        if (-not $processes) { Write-Log "[PROCESS-LINEAGE] No processes found" "WARN"; return @{ processes = @(); count = 0; collected_at = (Get-Date).ToString("o") } }
        $processNameMap = @{}; foreach ($p in $processes) { $processNameMap[$p.ProcessId] = $p.Name }
        $suspiciousTools = [System.Collections.Generic.HashSet[string]]::new(@("mimikatz","lazagne","procdump","sharphound","bloodhound","rubeus","covenant","psexec","wce","fgdump","gsecdump","pwdump","crackmapexec","impacket","cobalt"), [System.StringComparer]::OrdinalIgnoreCase)
        $suspiciousParentChild = @{ "WINWORD" = @("cmd","powershell","wscript","cscript","mshta"); "EXCEL" = @("cmd","powershell","wscript","cscript","mshta"); "OUTLOOK" = @("cmd","powershell"); "POWERPNT" = @("cmd","powershell"); "mshta" = @("powershell","cmd"); "wscript" = @("cmd","powershell"); "cscript" = @("powershell","cmd"); "rundll32" = @("cmd","powershell") }
        $processEntries = @(); $suspiciousCount = 0
        foreach ($proc in $processes) {
            $parentName = if ($processNameMap.ContainsKey($proc.ParentProcessId)) { $processNameMap[$proc.ParentProcessId] } else { $null }
            $procBaseName = [System.IO.Path]::GetFileNameWithoutExtension($proc.Name); $parentBaseName = if ($parentName) { [System.IO.Path]::GetFileNameWithoutExtension($parentName) } else { $null }
            $reasons = @()
            if ($suspiciousTools.Contains($procBaseName)) { $reasons += "Known offensive tool: $($proc.Name)" }
            if ($parentBaseName -and $suspiciousParentChild.ContainsKey($parentBaseName)) { if ($procBaseName -in $suspiciousParentChild[$parentBaseName]) { $reasons += "Suspicious parent-child: $parentName -> $($proc.Name)" } }
            if ($procBaseName -eq "powershell" -and $proc.CommandLine) { $cmd = $proc.CommandLine.ToLower(); if ($cmd -match '-enc\s' -or $cmd -match '-encodedcommand') { $reasons += "Encoded PowerShell command" }; if ($cmd -match 'downloadstring|downloadfile|invoke-webrequest') { $reasons += "PowerShell download detected" }; if ($cmd -match '-windowstyle\s+hidden|-w\s+hidden') { $reasons += "Hidden PowerShell window" } }
            if ($proc.ExecutablePath) { $pathLower = $proc.ExecutablePath.ToLower(); if ($pathLower -match '\\temp\\|\\tmp\\' -and $procBaseName -notin @("msiexec","setup")) { $reasons += "Process running from temp directory" } }
            $isSuspicious = $reasons.Count -gt 0; if ($isSuspicious) { $suspiciousCount++ }
            $startTime = $null; if ($proc.CreationDate) { try { $startTime = $proc.CreationDate.ToUniversalTime().ToString("o") } catch { } }
            $userName = "UNKNOWN"
            if ($isSuspicious) { try { $cimProc = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ProcessId)" -ErrorAction SilentlyContinue; if ($cimProc) { $owner = Invoke-CimMethod -InputObject $cimProc -MethodName GetOwner -ErrorAction SilentlyContinue; if ($owner -and $owner.Domain) { $userName = "$($owner.Domain)\$($owner.User)" } elseif ($owner -and $owner.User) { $userName = $owner.User } } } catch { } }
            $processEntries += @{ name = $proc.Name; pid = $proc.ProcessId; ppid = $proc.ParentProcessId; parent_name = $parentName; cmd = if ($proc.CommandLine) { $proc.CommandLine.Substring(0, [Math]::Min($proc.CommandLine.Length, 2048)) } else { $null }; user = $userName; start_time = $startTime; path = $proc.ExecutablePath; is_suspicious = $isSuspicious; reasons = $reasons }
        }
        Write-Log "[PROCESS-LINEAGE] Collected $($processEntries.Count) processes ($suspiciousCount suspicious)" "INFO"
        $submitResult = Invoke-SecureRequest -Path "/functions/v1/submit-process-lineage" -Method "POST" -Body @{ processes = $processEntries } -TimeoutSec 30
        if ($submitResult.Success) { Write-Log "[PROCESS-LINEAGE] Submitted successfully" "SUCCESS" } else { Write-Log "[PROCESS-LINEAGE] Submit failed: HTTP $($submitResult.StatusCode)" "WARN" }
        return @{ total_processes = $processEntries.Count; suspicious_count = $suspiciousCount; collected_at = (Get-Date).ToString("o"); submitted = $submitResult.Success }
    } catch { Write-Log "[PROCESS-LINEAGE] Error: $($_.Exception.Message)" "ERROR"; return @{ error = $_.Exception.Message; collected_at = (Get-Date).ToString("o") } }
}
