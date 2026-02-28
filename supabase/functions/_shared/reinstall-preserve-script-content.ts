// CyberShield Agent - Reinstall Preserve Script Content
// Embedded version for Edge Function delivery
// Version: 3.0.0 - Fully automatic, no prompts, built-in enrollment key

export const REINSTALL_PRESERVE_SCRIPT_CONTENT = `# CyberShield Agent - Reinstall Preserve v3.0.0
# Preserves credentials (AgentName, Token, HMAC) during agent update
# Strategy 3: Auto-recover via built-in enrollment key (zero prompts)
# ASCII-safe, English-only for cross-locale compatibility
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = "Stop"
$InstallDir = "C:\\CyberShield"
$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
$TaskName = "CyberShieldAgent"
$q = [char]34

function Write-Status {
    param([string]$M, [string]$T = "INFO")
    $colors = @{INFO="Cyan";SUCCESS="Green";WARN="Yellow";ERROR="Red"}
    $c = if ($colors.ContainsKey($T)) { $colors[$T] } else { "White" }
    Write-Host "[$T] $M" -ForegroundColor $c
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " CyberShield - Reinstall Preserve v3.0.0" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Admin check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Status "ERROR: Must run as Administrator!" "ERROR"
    Start-Sleep -Seconds 10
    return
}

try {

# ============================================================
# PHASE 1/5: Extract Credentials BEFORE stopping anything
# ============================================================
Write-Status "PHASE 1/5: Extract Credentials" "INFO"

if (-not (Test-Path $InstallDir)) {
    Write-Status "Directory $InstallDir does NOT exist!" "ERROR"
    Write-Status "Use full installer instead of preserve-reinstall" "ERROR"
    Start-Sleep -Seconds 10
    return
}

# Find agent script (exclude backups)
$files = Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'backup' }
Write-Status "Found $($files.Count) agent script(s)" "INFO"
$agentScript = $files | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $agentScript) {
    Write-Status "No agent script found in $InstallDir" "ERROR"
    Write-Status "Files present:" "WARN"
    Get-ChildItem $InstallDir -ErrorAction SilentlyContinue | ForEach-Object { Write-Status "  $($_.Name)" "WARN" }
    Start-Sleep -Seconds 10
    return
}
Write-Status "Script found: $($agentScript.Name)" "INFO"

# Extract AgentName from filename pattern: cybershield-agent-XXXX.ps1
$AgentName = $null
if ($agentScript.Name -match 'cybershield-agent-(.+)\\.ps1$') {
    $AgentName = $Matches[1]
}
Write-Status "AgentName: $AgentName" "INFO"

# Strategy 1: Extract credentials from Scheduled Task arguments
$AgentToken = $null
$HmacSecret = ""
$existingTask = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($existingTask) {
    $taskArgs = $existingTask.Actions[0].Arguments
    Write-Status "Task: $($existingTask.TaskName) | Args length: $($taskArgs.Length) chars" "INFO"

    # Double-quote patterns
    if ($taskArgs -match '-AgentToken\\s+"([^"]+)"') { $AgentToken = $Matches[1]; Write-Status "AgentToken: from task args (dq)" "SUCCESS" }
    elseif ($taskArgs -match "-AgentToken\\s+'([^']+)'") { $AgentToken = $Matches[1]; Write-Status "AgentToken: from task args (sq)" "SUCCESS" }

    if ($taskArgs -match '-HmacSecret\\s+"([^"]+)"') { $HmacSecret = $Matches[1]; Write-Status "HmacSecret: from task args (dq)" "SUCCESS" }
    elseif ($taskArgs -match "-HmacSecret\\s+'([^']+)'") { $HmacSecret = $Matches[1]; Write-Status "HmacSecret: from task args (sq)" "SUCCESS" }

    if ($taskArgs -match '-ServerUrl\\s+"([^"]+)"') { $ServerUrl = $Matches[1]; Write-Status "ServerUrl override: $ServerUrl" "INFO" }
} else {
    Write-Status "No scheduled task found - will try script content" "WARN"
}

# Strategy 2: Extract from script file content (v5.x variable assignment style)
if (-not $AgentToken) {
    Write-Status "Trying script content extraction..." "INFO"
    $content = Get-Content $agentScript.FullName -Raw -ErrorAction SilentlyContinue
    if ($content) {
        if ($content -match '\\$AgentToken\\s*=\\s*"([^"]+)"') { $AgentToken = $Matches[1]; Write-Status "AgentToken: from script content" "SUCCESS" }
        if ($content -match '\\$HmacSecret\\s*=\\s*"([^"]+)"') { $HmacSecret = $Matches[1]; Write-Status "HmacSecret: from script content" "SUCCESS" }
        if (-not $AgentName -and $content -match '\\$AgentName\\s*=\\s*"([^"]+)"') { $AgentName = $Matches[1]; Write-Status "AgentName: from script content" "SUCCESS" }
    }
}

# Strategy 3: Auto-recover from server using get-reinstall-by-name (v3.0.0)
# Uses built-in enrollment key - fully automatic, no prompts
if (-not $AgentToken -and $AgentName) {
    Write-Status "Local credentials not found - auto-recovering from server..." "WARN"
    
    # Use environment variable if set, otherwise use built-in default key
    $enrollKey = $env:CYBERSHIELD_KEY
    if (-not $enrollKey) {
        $enrollKey = "CSH-NCLR-7K9Q-2M4T"
    }

    if ($enrollKey -and $enrollKey.Length -gt 5) {
        Write-Status "Calling auto-recover for agent: $AgentName" "INFO"
        $recoverBaseUrl = "$ServerUrl/functions/v1/get-reinstall-by-name/$AgentName"

        $recoverScript = $null

        # Attempt 1: Header auth (best against proxy/query stripping)
        try {
            Write-Status "Auto-recover attempt 1/3: header auth" "INFO"
            $headers = @{ "X-Enrollment-Key" = $enrollKey }
            $recoverScript = Invoke-RestMethod -Uri $recoverBaseUrl -Method GET -Headers $headers -TimeoutSec 60
        } catch {
            Write-Status "Attempt 1 failed: $($_.Exception.Message)" "WARN"
        }

        # Attempt 2: Query param
        if (-not $recoverScript) {
            try {
                Write-Status "Auto-recover attempt 2/3: query auth" "INFO"
                $recoverUrl = "$recoverBaseUrl?key=$enrollKey"
                $recoverScript = Invoke-RestMethod -Uri $recoverUrl -Method GET -TimeoutSec 60
            } catch {
                Write-Status "Attempt 2 failed: $($_.Exception.Message)" "WARN"
            }
        }

        # Attempt 3: POST JSON body
        if (-not $recoverScript) {
            try {
                Write-Status "Auto-recover attempt 3/3: body auth" "INFO"
                $headers = @{ "Content-Type" = "application/json" }
                $body = @{ enrollment_key = $enrollKey } | ConvertTo-Json -Compress
                $recoverScript = Invoke-RestMethod -Uri $recoverBaseUrl -Method POST -Headers $headers -Body $body -TimeoutSec 60
            } catch {
                Write-Status "Attempt 3 failed: $($_.Exception.Message)" "WARN"
            }
        }

        if ($recoverScript -and $recoverScript.Length -gt 1000 -and $recoverScript -match 'AgentToken') {
            Write-Status "Auto-recover script received ($($recoverScript.Length) chars)" "SUCCESS"
            Write-Status "Switching to auto-recover mode..." "INFO"
            Write-Host ""
            # Execute the recovered script directly (it has credentials baked in)
            $tempRecover = "$env:TEMP\cybershield-recover-$AgentName.ps1"
            [System.IO.File]::WriteAllText($tempRecover, $recoverScript, [System.Text.Encoding]::UTF8)
            & powershell.exe -ExecutionPolicy Bypass -File $tempRecover
            return
        } else {
            Write-Status "Auto-recovery failed after 3 attempts" "ERROR"
            Write-Status "Invalid enrollment key, blocked network, or agent not found" "ERROR"
        }
    } else {
        Write-Status "No enrollment key provided - skipping auto-recovery" "WARN"
    }
}

# Validate required credentials
if (-not $AgentName -or -not $AgentToken) {
    Write-Status "CRITICAL: Cannot extract required credentials!" "ERROR"
    Write-Status "  AgentName: $(if($AgentName){'OK - ' + $AgentName}else{'MISSING'})" "ERROR"
    Write-Status "  AgentToken: $(if($AgentToken){'OK (hidden)'}else{'MISSING'})" "ERROR"
    Write-Status "  HmacSecret: $(if($HmacSecret){'OK'}else{'empty/none'})" "WARN"
    if ($existingTask) {
        Write-Status "Task args dump:" "WARN"
        Write-Status "  $taskArgs" "WARN"
    }
    Write-Host ""
    Write-Status "Options:" "INFO"
    Write-Status "  1. Run again and provide a valid JWT token" "INFO"
    Write-Status "  2. Use full reinstall with enrollment key" "INFO"
    Start-Sleep -Seconds 10
    return
}

Write-Status "Credentials OK | Agent: $AgentName | HMAC: $(if($HmacSecret){'YES'}else{'NO'})" "SUCCESS"
Write-Host ""

# ============================================================
# PHASE 2/5: Stop and Remove Existing Services
# ============================================================
Write-Status "PHASE 2/5: Stop Services" "INFO"

$tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
if ($tasks) {
    $tasks | ForEach-Object {
        Write-Status "  Stopping: $($_.TaskName) (State: $($_.State))" "INFO"
        Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }
    Write-Status "All CyberShield tasks removed" "SUCCESS"
} else {
    Write-Status "No tasks to stop" "WARN"
}
Start-Sleep -Seconds 2

# ============================================================
# PHASE 3/5: Backup Current Script
# ============================================================
Write-Status "PHASE 3/5: Backup" "INFO"

$backupDir = "$InstallDir\\backup"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
$backupName = "backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').ps1"
Copy-Item $agentScript.FullName (Join-Path $backupDir $backupName) -Force
Write-Status "Backup: $backupName" "SUCCESS"

# ============================================================
# PHASE 4/5: Download Updated Agent Script
# ============================================================
Write-Status "PHASE 4/5: Download Updated Script" "INFO"

$newScript = $null
$downloadMethod = "none"
$cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
# Primary: fetch from published app public assets (always in sync with codebase)
$dlUrl = "https://cybershield-audit.lovable.app/agent-scripts/cybershield-agent-windows-v5.ps1?cb=$cacheBust"
# Fallback: edge function endpoint
$dlUrlFallback = "$ServerUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain&cb=$cacheBust"
Write-Status "URL: $dlUrl" "INFO"

# Method 1: Invoke-RestMethod from published app (cleanest, always latest)
try {
    $template = Invoke-RestMethod -Uri $dlUrl -Method GET -TimeoutSec 60
    if ($template -and $template.Length -gt 5000) {
        $newScript = $template
        $downloadMethod = "IRM-PublicApp"
        Write-Status "Downloaded via IRM from published app ($($template.Length) chars)" "SUCCESS"
    } else {
        Write-Status "IRM: response too short ($($template.Length) chars)" "WARN"
    }
} catch {
    Write-Status "IRM (published app) failed: $($_.Exception.Message)" "WARN"
}

# Method 2: Invoke-WebRequest from published app (proxy-friendly)
if (-not $newScript) {
    try {
        $resp = Invoke-WebRequest -Uri $dlUrl -UseBasicParsing -TimeoutSec 60
        if ($resp.Content -and $resp.Content.Length -gt 5000) {
            $newScript = $resp.Content
            $downloadMethod = "IWR-PublicApp"
            Write-Status "Downloaded via IWR from published app ($($resp.Content.Length) chars)" "SUCCESS"
        }
    } catch {
        Write-Status "IWR (published app) failed: $($_.Exception.Message)" "WARN"
    }
}

# Method 3: Fallback to edge function endpoint
if (-not $newScript) {
    Write-Status "Trying edge function fallback: $dlUrlFallback" "INFO"
    try {
        $template = Invoke-RestMethod -Uri $dlUrlFallback -Method GET -TimeoutSec 60
        if ($template -and $template.Length -gt 5000) {
            $newScript = $template
            $downloadMethod = "IRM-EdgeFn"
            Write-Status "Downloaded via edge function ($($template.Length) chars)" "SUCCESS"
        }
    } catch {
        Write-Status "Edge function failed: $($_.Exception.Message)" "WARN"
    }
}

# Method 4: System.Net.WebClient (legacy fallback)
if (-not $newScript) {
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Proxy = [System.Net.WebRequest]::GetSystemWebProxy()
        $wc.Proxy.Credentials = [System.Net.CredentialCache]::DefaultCredentials
        $template = $wc.DownloadString($dlUrl)
        if ($template -and $template.Length -gt 5000) {
            $newScript = $template
            $downloadMethod = "WebClient"
            Write-Status "Downloaded via WebClient ($($template.Length) chars)" "SUCCESS"
        }
    } catch {
        Write-Status "WebClient failed: $($_.Exception.Message)" "WARN"
    }
}

if (-not $newScript) {
    Write-Status "ALL download methods FAILED!" "ERROR"
    Write-Status "Check network/firewall: Test-NetConnection $($([System.Uri]$ServerUrl).Host) -Port 443" "ERROR"
    Start-Sleep -Seconds 10
    return
}

# Extract version from downloaded script
$newVer = "unknown"
if ($newScript -match 'AgentVersion\\s*=\\s*"([^"]+)"') { $newVer = $Matches[1] }
Write-Status "New version: $newVer | Method: $downloadMethod" "SUCCESS"
Write-Host ""

# ============================================================
# PHASE 5/5: Install and Register Task
# ============================================================
Write-Status "PHASE 5/5: Install and Register Task" "INFO"

# Remove old agent scripts (keep backups)
Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'backup' } | Remove-Item -Force
Write-Status "Old scripts removed" "SUCCESS"

# Write new script file
$scriptPath = "$InstallDir\\cybershield-agent-$AgentName.ps1"
[System.IO.File]::WriteAllText($scriptPath, $newScript, [System.Text.Encoding]::UTF8)
Write-Status "Script written: $scriptPath ($($newScript.Length) chars)" "SUCCESS"

# Verify file was written correctly
if (-not (Test-Path $scriptPath)) {
    Write-Status "CRITICAL: Script file not found after write!" "ERROR"
    Start-Sleep -Seconds 10
    return
}
$writtenSize = (Get-Item $scriptPath).Length
Write-Status "File verified: $writtenSize bytes on disk" "SUCCESS"

# Clear stale integrity cache from previous versions
$hashCacheDir = "$InstallDir\\data"
$staleHashFiles = @("$hashCacheDir\\expected_script_hash.json", "$hashCacheDir\\expected_script_hash.txt")
foreach ($stale in $staleHashFiles) {
    if (Test-Path $stale) {
        Remove-Item $stale -Force -ErrorAction SilentlyContinue
        Write-Status "Cleared stale integrity cache: $stale" "INFO"
    }
}

# Build task arguments - credentials passed as script parameters
# IMPORTANT: Uses -Minutes 1 for RestartInterval (minimum allowed by Windows Task Scheduler)
$taskArgStr = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $q$scriptPath$q -ServerUrl $q$ServerUrl$q -AgentToken $q$AgentToken$q -HmacSecret $q$HmacSecret$q -AgentName $q$AgentName$q"
Write-Status "Task args: $($taskArgStr.Length) chars" "INFO"

# Create Scheduled Task components
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $taskArgStr

$trigger = New-ScheduledTaskTrigger -AtStartup

# Settings: RestartInterval = 1 minute (MINIMUM allowed), RestartCount = 3
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

$taskFullName = "$TaskName-$AgentName"
Write-Status "Registering task: $taskFullName" "INFO"

# Register the task
Register-ScheduledTask -TaskName $taskFullName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Status "Task registered: $taskFullName" "SUCCESS"

# Add repetition trigger (every 5 minutes) via CIM
try {
    $task = Get-ScheduledTask -TaskName $taskFullName
    $task.Triggers[0].Repetition.Interval = "PT5M"
    $task.Triggers[0].Repetition.StopAtDurationEnd = $false
    Set-ScheduledTask -InputObject $task | Out-Null
    Write-Status "Repetition: every 5 minutes" "SUCCESS"
} catch {
    Write-Status "Repetition config skipped: $($_.Exception.Message)" "WARN"
}

# Start the task
Start-ScheduledTask -TaskName $taskFullName
Write-Status "Task started" "SUCCESS"

# Wait and verify
Start-Sleep -Seconds 5

$finalTask = Get-ScheduledTask -TaskName $taskFullName -ErrorAction SilentlyContinue
$taskInfo = Get-ScheduledTaskInfo -TaskName $taskFullName -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " REINSTALLATION COMPLETED!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Agent:    $AgentName" -ForegroundColor White
Write-Host "  Version:  $newVer" -ForegroundColor White
Write-Host "  Download: $downloadMethod" -ForegroundColor White
Write-Host "  Script:   $scriptPath" -ForegroundColor White
Write-Host "  Task:     $taskFullName" -ForegroundColor White

if ($finalTask) {
    Write-Host "  State:    $($finalTask.State)" -ForegroundColor White
}
if ($taskInfo) {
    Write-Host "  LastRun:  $($taskInfo.LastRunTime)" -ForegroundColor White
    Write-Host "  Result:   $($taskInfo.LastTaskResult)" -ForegroundColor White
}

Write-Host ""

# Quick health check
$errors = @()
if (-not $finalTask) { $errors += "Task not found after registration" }
elseif ($finalTask.State -eq "Disabled") { $errors += "Task is disabled" }
if (-not (Test-Path $scriptPath)) { $errors += "Script file missing" }

if ($errors.Count -gt 0) {
    Write-Host "  WARNINGS:" -ForegroundColor Yellow
    $errors | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
} else {
    Write-Host "  Health: ALL OK" -ForegroundColor Green
}

Write-Host ""

} catch {
    Write-Host ""
    Write-Status "FATAL ERROR: $($_.Exception.Message)" "ERROR"
    Write-Status "Line: $($_.InvocationInfo.ScriptLineNumber)" "ERROR"
    Write-Host ""
    Write-Status "Stack trace:" "ERROR"
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    Write-Host ""
}

Start-Sleep -Seconds 15
`;
