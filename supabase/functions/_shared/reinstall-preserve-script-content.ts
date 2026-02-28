// CyberShield Agent - Reinstall Preserve Script Content
// Embedded version for Edge Function delivery
// Version: 3.2.0 - Interactive key/name prompt + stronger auto-recover fallback

export const REINSTALL_PRESERVE_SCRIPT_CONTENT = `# CyberShield Agent - Reinstall Preserve v3.2.0
# Preserves credentials (AgentName, Token, HMAC) during agent update
# Strategy 4: Auto-recover via enrollment key (env/file/log/prompt) with guided fallback
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
Write-Host " CyberShield - Reinstall Preserve v3.2.0" -ForegroundColor Cyan
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

# Extract preserved identity/credentials
# Priority: config.json > task args > script content > filename
$AgentName = $null
$AgentToken = $null
$HmacSecret = ""
$ForcedAgentName = $env:CYBERSHIELD_AGENT_NAME

# Priority 1: config.json (most reliable - contains registered identity and creds)
$configPath = "$InstallDir\\config.json"
if (Test-Path $configPath) {
    try {
        $configJson = Get-Content $configPath -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json

        if ($configJson.AgentName) {
            $AgentName = $configJson.AgentName
            Write-Status "AgentName: $AgentName (from config.json: AgentName)" "SUCCESS"
        } elseif ($configJson.agent_name) {
            $AgentName = $configJson.agent_name
            Write-Status "AgentName: $AgentName (from config.json: agent_name)" "SUCCESS"
        }

        if ($configJson.AgentToken) {
            $AgentToken = $configJson.AgentToken
            Write-Status "AgentToken: from config.json (AgentToken)" "SUCCESS"
        } elseif ($configJson.agent_token) {
            $AgentToken = $configJson.agent_token
            Write-Status "AgentToken: from config.json (agent_token)" "SUCCESS"
        }

        if ($configJson.HMACSecret) {
            $HmacSecret = $configJson.HMACSecret
            Write-Status "HmacSecret: from config.json (HMACSecret)" "SUCCESS"
        } elseif ($configJson.HmacSecret) {
            $HmacSecret = $configJson.HmacSecret
            Write-Status "HmacSecret: from config.json (HmacSecret)" "SUCCESS"
        } elseif ($configJson.hmac_secret) {
            $HmacSecret = $configJson.hmac_secret
            Write-Status "HmacSecret: from config.json (hmac_secret)" "SUCCESS"
        }
    } catch {
        Write-Status "Failed to parse config.json: $($_.Exception.Message)" "WARN"
    }
}

# Priority 2: Fallback to filename pattern: cybershield-agent-XXXX.ps1
if (-not $AgentName) {
    if ($agentScript.Name -match 'cybershield-agent-(.+)\\.ps1$') {
        $AgentName = $Matches[1]
        Write-Status "AgentName: $AgentName (from filename)" "INFO"
    }
}

# Strategy 1: Extract credentials from Scheduled Task arguments (fallback/override)
$existingTask = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $existingTask) {
    $existingTask = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
        $_.TaskName -match 'CyberShield' -or (($_.Actions | ForEach-Object { $_.Arguments }) -match 'cybershield-agent-')
    } | Select-Object -First 1
}

if ($existingTask) {
    $taskArgs = $existingTask.Actions[0].Arguments
    Write-Status "Task: $($existingTask.TaskName) | Args length: $($taskArgs.Length) chars" "INFO"

    # Double-quote patterns
    if ($taskArgs -match '-AgentToken\\s+"([^"]+)"') { $AgentToken = $Matches[1]; Write-Status "AgentToken: from task args (dq)" "SUCCESS" }
    elseif ($taskArgs -match "-AgentToken\\s+'([^']+)'") { $AgentToken = $Matches[1]; Write-Status "AgentToken: from task args (sq)" "SUCCESS" }

    if ($taskArgs -match '-HmacSecret\\s+"([^"]+)"') { $HmacSecret = $Matches[1]; Write-Status "HmacSecret: from task args (dq)" "SUCCESS" }
    elseif ($taskArgs -match "-HmacSecret\\s+'([^']+)'") { $HmacSecret = $Matches[1]; Write-Status "HmacSecret: from task args (sq)" "SUCCESS" }

    if ($taskArgs -match '-ServerUrl\\s+"([^"]+)"') { $ServerUrl = $Matches[1]; Write-Status "ServerUrl override: $ServerUrl" "INFO" }

    # Also extract AgentName from task args (overrides filename-based name)
    if ($taskArgs -match '-AgentName\\s+"([^"]+)"') {
        $taskAgentName = $Matches[1]
        if (-not $AgentName -or $AgentName -ne $taskAgentName) {
            Write-Status "AgentName override: $taskAgentName (from task args, was: $AgentName)" "SUCCESS"
            $AgentName = $taskAgentName
        }
    }
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

# Strategy 3: Auto-recover from server using get-reinstall-by-name
# Always try server-side rebind first (fresh token/HMAC), fallback to preserved creds on failure
if ($ForcedAgentName) {
    $forcedTrimmed = $ForcedAgentName.Trim()
    if ($forcedTrimmed) {
        if (-not $AgentName -or $AgentName -ne $forcedTrimmed) {
            Write-Status "AgentName override from env: $forcedTrimmed (was: $AgentName)" "SUCCESS"
        }
        $AgentName = $forcedTrimmed
    }
}

if ($AgentName) {
    if ($AgentToken) {
        Write-Status "Local credentials found - trying server rebind for fresh credentials..." "INFO"
    } else {
        Write-Status "Local credentials not found - auto-recovering from server..." "WARN"
    }

    # Enrollment key source order: env > enrollment.key > installer.log > interactive prompt
    $enrollKey = $env:CYBERSHIELD_KEY

    if (-not $enrollKey) {
        $keyFilePath = "$InstallDir\\enrollment.key"
        if (Test-Path $keyFilePath) {
            try {
                $fileKey = (Get-Content $keyFilePath -Raw -ErrorAction SilentlyContinue).Trim()
                if ($fileKey) {
                    $enrollKey = $fileKey
                    Write-Status "Enrollment key loaded from enrollment.key" "SUCCESS"
                }
            } catch {
                Write-Status "Could not read enrollment.key: $($_.Exception.Message)" "WARN"
            }
        }
    }

    if (-not $enrollKey) {
        $installerLogPath = "$InstallDir\\logs\\installer.log"
        if (Test-Path $installerLogPath) {
            try {
                $installerLog = Get-Content $installerLogPath -Raw -ErrorAction SilentlyContinue
                if ($installerLog -match '(?:[?&]key=|enrollment[_-]?key[^A-Z0-9]*)([A-Z0-9]{4}(?:-[A-Z0-9]{4}){3})') {
                    $enrollKey = $Matches[1]
                    Write-Status "Enrollment key recovered from installer.log" "SUCCESS"
                }
            } catch {
                Write-Status "Could not read installer.log for key recovery: $($_.Exception.Message)" "WARN"
            }
        }
    }

    if ($enrollKey) {
        $enrollKey = $enrollKey.Trim().Trim('"').Trim("'")
    }

    if (-not $enrollKey -and -not $AgentToken) {
        Write-Status "Agent token missing locally; enrollment key required for auto-recover." "WARN"
        $typedKey = Read-Host "Digite a Enrollment Key (XXXX-XXXX-XXXX-XXXX)"
        if ($typedKey -and $typedKey.Trim()) {
            $enrollKey = $typedKey.Trim().Trim('"').Trim("'")
            Write-Status "Enrollment key informada manualmente" "SUCCESS"
        }

        if (-not $ForcedAgentName) {
            $typedAgentName = Read-Host "Nome do agente no painel (opcional, Enter para manter '$AgentName')"
            if ($typedAgentName -and $typedAgentName.Trim()) {
                $AgentName = $typedAgentName.Trim()
                Write-Status "AgentName override manual: $AgentName" "SUCCESS"
            }
        }
    }

    if (-not $enrollKey) {
        Write-Status "No enrollment key available for auto-recover (set CYBERSHIELD_KEY env var)" "WARN"
    }

    if ($enrollKey -and $enrollKey.Length -gt 5) {
        Write-Status "Calling auto-recover for agent: $AgentName" "INFO"
        $agentNameEncoded = [System.Uri]::EscapeDataString($AgentName)
        $recoverBaseUrl = "$ServerUrl/functions/v1/get-reinstall-by-name/$agentNameEncoded"

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
                $recoverUrl = "$recoverBaseUrl?key=$([System.Uri]::EscapeDataString($enrollKey))"
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
            if ($AgentToken) {
                Write-Status "Auto-recovery failed - using preserved local credentials as fallback" "WARN"
            } else {
                Write-Status "Auto-recovery failed after 3 attempts" "ERROR"
                Write-Status "Invalid enrollment key, blocked network, or agent not found" "ERROR"
            }
        }
    } else {
        Write-Status "Skipping auto-recovery because no enrollment key was found" "WARN"
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
    Write-Status '  1. Set env key and retry: $env:CYBERSHIELD_KEY="XXXX-XXXX-XXXX-XXXX"' "INFO"
    Write-Status '  2. Optional name override: $env:CYBERSHIELD_AGENT_NAME="MIT-SERVIDOR"' "INFO"
    Write-Status "  3. Use full reinstall with enrollment key" "INFO"
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
# Primary: fetch from backend release endpoint (source of truth)
$dlUrl = "$ServerUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain&cb=$cacheBust"
# Fallback: published app static asset
$dlUrlFallback = "https://cybershield-audit.lovable.app/agent-scripts/cybershield-agent-windows-v5.ps1?cb=$cacheBust"
Write-Status "Primary URL: $dlUrl" "INFO"

# Method 1: Invoke-RestMethod from backend (preferred)
try {
    $template = Invoke-RestMethod -Uri $dlUrl -Method GET -TimeoutSec 60
    if ($template -and $template.Length -gt 5000) {
        $newScript = $template
        $downloadMethod = "IRM-EdgeFn"
        Write-Status "Downloaded via IRM from backend ($($template.Length) chars)" "SUCCESS"
    } else {
        Write-Status "IRM: response too short ($($template.Length) chars)" "WARN"
    }
} catch {
    Write-Status "IRM (backend) failed: $($_.Exception.Message)" "WARN"
}

# Method 2: Invoke-WebRequest from backend (proxy-friendly)
if (-not $newScript) {
    try {
        $resp = Invoke-WebRequest -Uri $dlUrl -UseBasicParsing -TimeoutSec 60
        if ($resp.Content -and $resp.Content.Length -gt 5000) {
            $newScript = $resp.Content
            $downloadMethod = "IWR-EdgeFn"
            Write-Status "Downloaded via IWR from backend ($($resp.Content.Length) chars)" "SUCCESS"
        }
    } catch {
        Write-Status "IWR (backend) failed: $($_.Exception.Message)" "WARN"
    }
}

# Method 3: Fallback to published app static endpoint
if (-not $newScript) {
    Write-Status "Trying published app fallback: $dlUrlFallback" "INFO"
    try {
        $template = Invoke-RestMethod -Uri $dlUrlFallback -Method GET -TimeoutSec 60
        if ($template -and $template.Length -gt 5000) {
            $newScript = $template
            $downloadMethod = "IRM-PublicApp"
            Write-Status "Downloaded via published app fallback ($($template.Length) chars)" "SUCCESS"
        }
    } catch {
        Write-Status "Published app fallback failed: $($_.Exception.Message)" "WARN"
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
