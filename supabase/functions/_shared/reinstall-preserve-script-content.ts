// CyberShield Agent - Reinstall Preserve Script Content
// Embedded version for Edge Function delivery
// Version: 2.9.0 - Strategy 3 now uses auto-recover via enrollment key (no JWT prompt)

export const REINSTALL_PRESERVE_SCRIPT_CONTENT = `# CyberShield Agent - Reinstall Preserve v2.9.0
# Preserves credentials (AgentName, Token, HMAC) during agent update
# Strategy 3: Auto-recover via enrollment key (no JWT needed)
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
Write-Host " CyberShield - Reinstall Preserve v2.9.0" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Admin check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Status "ERROR: Must run as Administrator!" "ERROR"
    Read-Host "Press Enter to exit"
    exit 1
}

try {

# ============================================================
# PHASE 1/5: Extract Credentials BEFORE stopping anything
# ============================================================
Write-Status "PHASE 1/5: Extract Credentials" "INFO"

if (-not (Test-Path $InstallDir)) {
    Write-Status "Directory $InstallDir does NOT exist!" "ERROR"
    Write-Status "Use full installer instead of preserve-reinstall" "ERROR"
    Read-Host "Press Enter to exit"
    exit 1
}

# Find agent script (exclude backups)
$files = Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'backup' }
Write-Status "Found $($files.Count) agent script(s)" "INFO"
$agentScript = $files | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $agentScript) {
    Write-Status "No agent script found in $InstallDir" "ERROR"
    Write-Status "Files present:" "WARN"
    Get-ChildItem $InstallDir -ErrorAction SilentlyContinue | ForEach-Object { Write-Status "  $($_.Name)" "WARN" }
    Read-Host "Press Enter to exit"
    exit 1
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

# Strategy 3: Auto-recover from server using get-reinstall-by-name (v2.9.0)
# Falls back to full auto-recover script with credentials pre-loaded
if (-not $AgentToken -and $AgentName) {
    Write-Status "Local credentials not found - trying auto-recovery from server..." "WARN"
    
    # Try to find enrollment key from environment or prompt
    $enrollKey = $env:CYBERSHIELD_KEY
    if (-not $enrollKey) {
        Write-Host ""
        Write-Host "  Agent credentials were lost (task deleted or v4.x agent)." -ForegroundColor Yellow
        Write-Host "  An enrollment key is needed to recover automatically." -ForegroundColor Yellow
        Write-Host "  (Dashboard > Admin > Enrollment Keys)" -ForegroundColor Yellow
        Write-Host ""
        $enrollKey = Read-Host "  Paste your Enrollment Key (or press Enter to skip)"
        $enrollKey = $enrollKey.Trim()
    }

    if ($enrollKey -and $enrollKey.Length -gt 5) {
        Write-Status "Calling auto-recover for agent: $AgentName" "INFO"
        $recoverUrl = "$ServerUrl/functions/v1/get-reinstall-by-name/$AgentName?key=$enrollKey"
        
        try {
            $recoverScript = Invoke-RestMethod -Uri $recoverUrl -Method GET -TimeoutSec 60
            if ($recoverScript -and $recoverScript.Length -gt 1000 -and $recoverScript -match 'AgentToken') {
                Write-Status "Auto-recover script received ($($recoverScript.Length) chars)" "SUCCESS"
                Write-Status "Switching to auto-recover mode..." "INFO"
                Write-Host ""
                # Execute the recovered script directly (it has credentials baked in)
                $tempRecover = "$env:TEMP\\cybershield-recover-$AgentName.ps1"
                [System.IO.File]::WriteAllText($tempRecover, $recoverScript, [System.Text.Encoding]::UTF8)
                & powershell.exe -ExecutionPolicy Bypass -File $tempRecover
                exit 0
            } else {
                Write-Status "Server returned invalid response" "ERROR"
            }
        } catch {
            $errMsg = $_.Exception.Message
            Write-Status "Auto-recovery failed: $errMsg" "ERROR"
            if ($errMsg -match '401') {
                Write-Status "Invalid or expired enrollment key" "ERROR"
            } elseif ($errMsg -match '404') {
                Write-Status "Agent '$AgentName' not found in your tenant" "ERROR"
            }
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
    Read-Host "Press Enter to exit"
    exit 1
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
$dlUrl = "$ServerUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain&cb=$cacheBust"
Write-Status "URL: $dlUrl" "INFO"

# Method 1: Invoke-RestMethod (cleanest)
try {
    $template = Invoke-RestMethod -Uri $dlUrl -Method GET -TimeoutSec 60
    if ($template -and $template.Length -gt 5000) {
        $newScript = $template
        $downloadMethod = "Invoke-RestMethod"
        Write-Status "Downloaded via IRM ($($template.Length) chars)" "SUCCESS"
    } else {
        Write-Status "IRM: response too short ($($template.Length) chars)" "WARN"
    }
} catch {
    Write-Status "IRM failed: $($_.Exception.Message)" "WARN"
}

# Method 2: Invoke-WebRequest with UseBasicParsing (proxy-friendly)
if (-not $newScript) {
    try {
        $resp = Invoke-WebRequest -Uri $dlUrl -UseBasicParsing -TimeoutSec 60
        if ($resp.Content -and $resp.Content.Length -gt 5000) {
            $newScript = $resp.Content
            $downloadMethod = "Invoke-WebRequest"
            Write-Status "Downloaded via IWR ($($resp.Content.Length) chars)" "SUCCESS"
        }
    } catch {
        Write-Status "IWR failed: $($_.Exception.Message)" "WARN"
    }
}

# Method 3: System.Net.WebClient (legacy fallback)
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
    Read-Host "Press Enter to exit"
    exit 1
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
    Read-Host "Press Enter to exit"
    exit 1
}
$writtenSize = (Get-Item $scriptPath).Length
Write-Status "File verified: $writtenSize bytes on disk" "SUCCESS"

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

Read-Host "Press Enter to close"
`;
