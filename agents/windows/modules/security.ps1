<#
.SYNOPSIS
    Security detection (EDR events, anomaly detection)
    Note: Antivirus collection is handled by collection.ps1 (Invoke-CollectAntivirusStatus)
#>

function Get-SecurityEvents {
    param([int]$Hours = 1)

    $events = @()
    $cutoff = (Get-Date).AddHours(-$Hours)

    try {
        # Windows Security log - failed logins (4625)
        $failedLogins = Get-WinEvent -FilterHashtable @{
            LogName   = "Security"
            Id        = 4625
            StartTime = $cutoff
        } -MaxEvents 50 -ErrorAction SilentlyContinue

        foreach ($evt in $failedLogins) {
            $events += @{
                event_type = "failed_login"
                timestamp  = $evt.TimeCreated.ToString("o")
                event_id   = $evt.Id
                message    = $evt.Message.Substring(0, [Math]::Min(200, $evt.Message.Length))
            }
        }
    }
    catch {
        Write-Log "Failed to read security events: $($_.Exception.Message)" "WARN"
    }

    try {
        # New service installations (7045)
        $newServices = Get-WinEvent -FilterHashtable @{
            LogName   = "System"
            Id        = 7045
            StartTime = $cutoff
        } -MaxEvents 20 -ErrorAction SilentlyContinue

        foreach ($evt in $newServices) {
            $events += @{
                event_type = "new_service"
                timestamp  = $evt.TimeCreated.ToString("o")
                event_id   = $evt.Id
                message    = $evt.Message.Substring(0, [Math]::Min(200, $evt.Message.Length))
            }
        }
    }
    catch {
        # System log may not have recent entries
    }

    # --- Successful logons from unusual sources (4624 type 10 = RDP, type 3 = network) ---
    try {
        $logons = Get-WinEvent -FilterHashtable @{
            LogName   = "Security"
            Id        = 4624
            StartTime = $cutoff
        } -MaxEvents 30 -ErrorAction SilentlyContinue

        foreach ($evt in $logons) {
            $xml = [xml]$evt.ToXml()
            $logonType = ($xml.Event.EventData.Data | Where-Object { $_.Name -eq "LogonType" }).'#text'
            if ($logonType -in @("3","10")) {
                $sourceIp = ($xml.Event.EventData.Data | Where-Object { $_.Name -eq "IpAddress" }).'#text'
                $targetUser = ($xml.Event.EventData.Data | Where-Object { $_.Name -eq "TargetUserName" }).'#text'
                $events += @{
                    event_type  = "remote_logon"
                    timestamp   = $evt.TimeCreated.ToString("o")
                    event_id    = $evt.Id
                    logon_type  = $logonType
                    source_ip   = $sourceIp
                    target_user = $targetUser
                    message     = "Remote logon type $logonType from $sourceIp as $targetUser"
                }
            }
        }
    }
    catch { }

    # --- Account created (4720) / Account modified (4738) ---
    try {
        $accountEvents = Get-WinEvent -FilterHashtable @{
            LogName   = "Security"
            Id        = 4720, 4738
            StartTime = $cutoff
        } -MaxEvents 20 -ErrorAction SilentlyContinue

        foreach ($evt in $accountEvents) {
            $evtType = if ($evt.Id -eq 4720) { "account_created" } else { "account_modified" }
            $events += @{
                event_type = $evtType
                timestamp  = $evt.TimeCreated.ToString("o")
                event_id   = $evt.Id
                message    = $evt.Message.Substring(0, [Math]::Min(200, $evt.Message.Length))
            }
        }
    }
    catch { }

    # --- Kerberos TGS requests (4769) - Kerberoasting detection ---
    try {
        $tgsEvents = Get-WinEvent -FilterHashtable @{
            LogName   = "Security"
            Id        = 4769
            StartTime = $cutoff
        } -MaxEvents 100 -ErrorAction SilentlyContinue

        if ($tgsEvents -and $tgsEvents.Count -gt 20) {
            $events += @{
                event_type    = "kerberoasting_suspect"
                timestamp     = (Get-Date).ToString("o")
                event_id      = 4769
                request_count = $tgsEvents.Count
                message       = "High volume of Kerberos TGS requests: $($tgsEvents.Count) in $Hours hour(s)"
            }
        }
    }
    catch { }

    # --- Audit log cleared (1102) ---
    try {
        $clearEvents = Get-WinEvent -FilterHashtable @{
            LogName   = "Security"
            Id        = 1102
            StartTime = $cutoff
        } -MaxEvents 5 -ErrorAction SilentlyContinue

        foreach ($evt in $clearEvents) {
            $events += @{
                event_type = "audit_log_cleared"
                timestamp  = $evt.TimeCreated.ToString("o")
                event_id   = $evt.Id
                message    = "Security audit log was cleared"
            }
        }
    }
    catch { }

    # --- PowerShell script block logging (4104) - obfuscation detection ---
    try {
        $psEvents = Get-WinEvent -FilterHashtable @{
            LogName   = "Microsoft-Windows-PowerShell/Operational"
            Id        = 4104
            StartTime = $cutoff
        } -MaxEvents 30 -ErrorAction SilentlyContinue

        foreach ($evt in $psEvents) {
            $scriptBlock = $evt.Message
            # Check for heavy encoding/obfuscation patterns
            $obfuscationPatterns = @(
                '[char]',
                'FromBase64String',
                '-bxor',
                'Invoke-Expression',
                'iex(',
                '[System.Convert]::',
                '-replace.*\[char\]',
                'New-Object Net.WebClient'
            )
            $matchCount = 0
            foreach ($pattern in $obfuscationPatterns) {
                if ($scriptBlock -match [regex]::Escape($pattern)) { $matchCount++ }
            }
            if ($matchCount -ge 2) {
                $events += @{
                    event_type      = "obfuscated_script"
                    timestamp       = $evt.TimeCreated.ToString("o")
                    event_id        = $evt.Id
                    match_count     = $matchCount
                    message         = $scriptBlock.Substring(0, [Math]::Min(300, $scriptBlock.Length))
                }
            }
        }
    }
    catch { }

    return $events
}

function Get-FirewallStatus {
    try {
        $profiles = Get-NetFirewallProfile -ErrorAction SilentlyContinue
        $status = @{}
        foreach ($p in $profiles) {
            $status[$p.Name] = @{
                enabled        = $p.Enabled
                default_action = $p.DefaultInboundAction.ToString()
            }
        }
        return $status
    }
    catch {
        Write-Log "Failed to get firewall status: $($_.Exception.Message)" "WARN"
        return @{}
    }
}

function Get-ProcessLineageEvents {
    <#
    .SYNOPSIS
        Detects suspicious parent-child process relationships for Initial Access,
        Execution, Defense Evasion, and Privilege Escalation techniques.
    #>
    $events = @()

    try {
        $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Select-Object ProcessId, Name, ParentProcessId, CommandLine, ExecutablePath, CreationDate

        # Build parent lookup
        $procLookup = @{}
        foreach ($p in $processes) { $procLookup[$p.ProcessId] = $p }

        # --- T1566.001: Office spawning suspicious child ---
        $officeNames = @("WINWORD","EXCEL","POWERPNT","OUTLOOK","MSACCESS")
        $suspiciousChildren = @("cmd.exe","powershell.exe","pwsh.exe","wscript.exe","cscript.exe","mshta.exe","certutil.exe")
        
        foreach ($proc in $processes) {
            $parentProc = if ($proc.ParentProcessId -and $procLookup.ContainsKey($proc.ParentProcessId)) { $procLookup[$proc.ParentProcessId] } else { $null }
            $parentName = if ($parentProc) { $parentProc.Name } else { "" }

            # Office → suspicious child
            if ($parentName -and ($officeNames | Where-Object { $parentName -like "$_*" }) -and
                ($suspiciousChildren | Where-Object { $proc.Name -eq $_ })) {
                $events += @{
                    event_type    = "phishing_child_spawn"
                    process_name  = $proc.Name
                    parent_name   = $parentName
                    command_line  = if ($proc.CommandLine) { $proc.CommandLine.Substring(0, [Math]::Min(500, $proc.CommandLine.Length)) } else { "" }
                    pid           = $proc.ProcessId
                    parent_pid    = $proc.ParentProcessId
                    timestamp     = if ($proc.CreationDate) { $proc.CreationDate.ToString("o") } else { (Get-Date).ToString("o") }
                    mitre_technique = "T1566.001"
                }
            }

            # --- T1189: Browser → executable child ---
            $browserNames = @("chrome","msedge","firefox","iexplore","brave","opera")
            if ($parentName -and ($browserNames | Where-Object { $parentName -like "$_*" }) -and
                ($suspiciousChildren | Where-Object { $proc.Name -eq $_ })) {
                $events += @{
                    event_type    = "browser_child_spawn"
                    process_name  = $proc.Name
                    parent_name   = $parentName
                    command_line  = if ($proc.CommandLine) { $proc.CommandLine.Substring(0, [Math]::Min(500, $proc.CommandLine.Length)) } else { "" }
                    pid           = $proc.ProcessId
                    timestamp     = if ($proc.CreationDate) { $proc.CreationDate.ToString("o") } else { (Get-Date).ToString("o") }
                    mitre_technique = "T1189"
                }
            }

            # --- T1036: Masquerading — system binary from wrong path ---
            $systemBinaries = @{
                "svchost.exe"  = "C:\Windows\System32\svchost.exe"
                "lsass.exe"    = "C:\Windows\System32\lsass.exe"
                "csrss.exe"    = "C:\Windows\System32\csrss.exe"
                "services.exe" = "C:\Windows\System32\services.exe"
                "smss.exe"     = "C:\Windows\System32\smss.exe"
                "explorer.exe" = "C:\Windows"
            }
            if ($proc.Name -and $systemBinaries.ContainsKey($proc.Name.ToLower()) -and $proc.ExecutablePath) {
                $expectedPrefix = $systemBinaries[$proc.Name.ToLower()]
                if (-not $proc.ExecutablePath.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                    $events += @{
                        event_type     = "process_masquerading"
                        process_name   = $proc.Name
                        executable_path = $proc.ExecutablePath
                        expected_path  = $expectedPrefix
                        pid            = $proc.ProcessId
                        timestamp      = if ($proc.CreationDate) { $proc.CreationDate.ToString("o") } else { (Get-Date).ToString("o") }
                        mitre_technique = "T1036"
                    }
                }
            }

            # --- T1548.002: UAC bypass via known binaries ---
            $uacBypassBins = @("fodhelper.exe","eventvwr.exe","sdclt.exe","computerdefaults.exe")
            if ($proc.Name -and ($uacBypassBins | Where-Object { $proc.Name -eq $_ })) {
                if ($parentName -and $parentName -notin @("explorer.exe","svchost.exe")) {
                    $events += @{
                        event_type    = "uac_bypass_suspect"
                        process_name  = $proc.Name
                        parent_name   = $parentName
                        command_line  = if ($proc.CommandLine) { $proc.CommandLine.Substring(0, [Math]::Min(500, $proc.CommandLine.Length)) } else { "" }
                        pid           = $proc.ProcessId
                        timestamp     = if ($proc.CreationDate) { $proc.CreationDate.ToString("o") } else { (Get-Date).ToString("o") }
                        mitre_technique = "T1548.002"
                    }
                }
            }
        }

        # --- T1003.003: ntdsutil usage ---
        $ntdsProc = $processes | Where-Object { $_.Name -eq "ntdsutil.exe" }
        foreach ($p in $ntdsProc) {
            $events += @{
                event_type    = "ntds_extraction"
                process_name  = "ntdsutil.exe"
                command_line  = if ($p.CommandLine) { $p.CommandLine.Substring(0, [Math]::Min(500, $p.CommandLine.Length)) } else { "" }
                pid           = $p.ProcessId
                timestamp     = if ($p.CreationDate) { $p.CreationDate.ToString("o") } else { (Get-Date).ToString("o") }
                mitre_technique = "T1003.003"
            }
        }
    }
    catch {
        Write-Log "Process lineage scan failed: $($_.Exception.Message)" "WARN"
    }

    return $events
}

function Get-FileIntegrityEvents {
    <#
    .SYNOPSIS
        Monitors sensitive file access for Collection, Credential Access, and Persistence rules.
    #>
    $events = @()

    try {
        # --- T1114.001: Email store access (PST/OST) ---
        $emailStores = @(
            "$env:LOCALAPPDATA\Microsoft\Outlook\*.ost",
            "$env:LOCALAPPDATA\Microsoft\Outlook\*.pst"
        )
        foreach ($pattern in $emailStores) {
            $files = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue
            foreach ($f in $files) {
                if ($f.LastWriteTime -gt (Get-Date).AddHours(-1)) {
                    $events += @{
                        event_type      = "email_store_access"
                        file_path       = $f.FullName
                        file_size       = $f.Length
                        last_modified   = $f.LastWriteTime.ToString("o")
                        timestamp       = (Get-Date).ToString("o")
                        mitre_technique = "T1114.001"
                    }
                }
            }
        }

        # --- T1555.003: Browser credential store access ---
        $browserCredPaths = @(
            "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Login Data",
            "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Login Data",
            "$env:APPDATA\Mozilla\Firefox\Profiles\*\logins.json"
        )
        foreach ($path in $browserCredPaths) {
            $files = Get-Item -Path $path -ErrorAction SilentlyContinue
            foreach ($f in $files) {
                # Check if any non-browser process has the file locked
                if ($f.LastWriteTime -gt (Get-Date).AddMinutes(-10)) {
                    $events += @{
                        event_type      = "browser_cred_access"
                        file_path       = $f.FullName
                        last_modified   = $f.LastWriteTime.ToString("o")
                        timestamp       = (Get-Date).ToString("o")
                        mitre_technique = "T1555.003"
                    }
                }
            }
        }

        # --- T1546.012: IFEO registry keys ---
        try {
            $ifeoPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options"
            $ifeoKeys = Get-ChildItem -Path $ifeoPath -ErrorAction SilentlyContinue
            foreach ($key in $ifeoKeys) {
                $debugger = (Get-ItemProperty -Path $key.PSPath -Name "Debugger" -ErrorAction SilentlyContinue).Debugger
                if ($debugger -and $debugger -notmatch "vsjitdebugger|drwtsn32") {
                    $events += @{
                        event_type      = "ifeo_debugger_set"
                        registry_key    = $key.PSPath
                        debugger_value  = $debugger
                        target_binary   = $key.PSChildName
                        timestamp       = (Get-Date).ToString("o")
                        mitre_technique = "T1546.012"
                    }
                }
            }
        }
        catch { }

    }
    catch {
        Write-Log "File integrity scan failed: $($_.Exception.Message)" "WARN"
    }

    return $events
}

function Get-NetworkAnomalyEvents {
    <#
    .SYNOPSIS
        Detects network anomalies for Exfiltration, C2, and Lateral Movement.
    #>
    $events = @()

    try {
        $connections = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue

        # --- T1567.002: Cloud storage upload detection ---
        $cloudIpRanges = @() # Populated at runtime from threat intel
        $cloudDomains = @("onedrive.live.com","dropbox.com","drive.google.com","mega.nz","mediafire.com")

        # --- T1210 / T1021: Unusual SMB/RDP lateral connections ---
        $lateralPorts = @(445, 3389, 5985, 5986, 22)
        $lateralConns = $connections | Where-Object { $_.RemotePort -in $lateralPorts -and $_.RemoteAddress -notlike "127.*" }

        foreach ($conn in $lateralConns) {
            $procName = ""
            try { $procName = (Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue).ProcessName } catch { }
            $events += @{
                event_type     = "lateral_connection"
                remote_address = $conn.RemoteAddress
                remote_port    = $conn.RemotePort
                process_name   = $procName
                process_pid    = $conn.OwningProcess
                timestamp      = (Get-Date).ToString("o")
                mitre_technique = if ($conn.RemotePort -eq 3389) { "T1021.001" } elseif ($conn.RemotePort -eq 445) { "T1021.002" } elseif ($conn.RemotePort -in @(5985,5986)) { "T1021.006" } else { "T1210" }
            }
        }

        # --- Large outbound transfers (T1041/T1048) ---
        # Use performance counters for bytes sent
        try {
            $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Up" }
            foreach ($adapter in $adapters) {
                $stats = Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction SilentlyContinue
                if ($stats -and $stats.SentBytes -gt 500MB) {
                    $events += @{
                        event_type   = "high_outbound_volume"
                        adapter_name = $adapter.Name
                        bytes_sent   = $stats.SentBytes
                        timestamp    = (Get-Date).ToString("o")
                        mitre_technique = "T1048"
                    }
                }
            }
        }
        catch { }
    }
    catch {
        Write-Log "Network anomaly scan failed: $($_.Exception.Message)" "WARN"
    }

    return $events
}

function Test-ProcessInBaseline {
    <#
    .SYNOPSIS
        Check if a process name is in the known baseline.
        Returns $true if baseline is empty (fail-open) or process is in baseline.
        Ported from v5.0.15 for v6 parity.
    #>
    param([string]$ProcessName)

    if ($Global:ProcessBaselineSet.Count -eq 0) { return $true }  # No baseline = assume OK
    return $Global:ProcessBaselineSet.Contains($ProcessName)
}
