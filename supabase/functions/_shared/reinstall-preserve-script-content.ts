// CyberShield Agent - Reinstall Preserve Script Content
// Embedded version for Edge Function delivery
// Version: 2.6.0 - Fixed: credentials passed as task args (param() compatible)

export const REINSTALL_PRESERVE_SCRIPT_CONTENT = `# CyberShield Agent - Reinstall Preserve v2.6.0
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = "Stop"
$InstallDir = "C:\\CyberShield"
$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
$TaskName = "CyberShieldAgent"

function Write-Status { param([string]$M, [string]$T = "INFO"); Write-Host "[$T] $M" -ForegroundColor (@{INFO="Cyan";SUCCESS="Green";WARN="Yellow";ERROR="Red"}[$T]) }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " CyberShield - Reinstall Preserve v2.6.0" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Write-Status "Run as Administrator!" "ERROR"; Read-Host "Press Enter to exit"; exit 1 }

# PHASE 1: Extract credentials BEFORE stopping anything
Write-Status "PHASE 1/5: Extract Credentials" "INFO"

if (-not (Test-Path $InstallDir)) { Write-Status "Directory $InstallDir does NOT exist!" "ERROR"; Read-Host "Press Enter to exit"; exit 1 }

# Find agent script (exclude backups)
$files = Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'backup' }
Write-Status "Found $($files.Count) agent script(s)" "INFO"
$agentScript = $files | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $agentScript) { Write-Status "No agent script found!" "ERROR"; Read-Host "Press Enter to exit"; exit 1 }
Write-Status "Script: $($agentScript.Name)" "INFO"

# Get AgentName from filename
$AgentName = $null
if ($agentScript.Name -match 'cybershield-agent-(.+)\\.ps1$') { $AgentName = $Matches[1] }
Write-Status "AgentName: $AgentName" "INFO"

# Try to get credentials from Scheduled Task args FIRST (works for both v4.x and v5.x)
$AgentToken = $null
$HmacSecret = ""
$existingTask = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingTask) {
    $taskArgs = $existingTask.Actions[0].Arguments
    Write-Status "Task: $($existingTask.TaskName) | Args: $($taskArgs.Length) chars" "INFO"
    if ($taskArgs -match '-AgentToken\\s+"([^"]+)"') { $AgentToken = $Matches[1]; Write-Status "AgentToken: from task args" "SUCCESS" }
    elseif ($taskArgs -match "-AgentToken\\s+'([^']+)'") { $AgentToken = $Matches[1]; Write-Status "AgentToken: from task args (sq)" "SUCCESS" }
    if ($taskArgs -match '-HmacSecret\\s+"([^"]+)"') { $HmacSecret = $Matches[1]; Write-Status "HmacSecret: from task args" "SUCCESS" }
    elseif ($taskArgs -match "-HmacSecret\\s+'([^']+)'") { $HmacSecret = $Matches[1]; Write-Status "HmacSecret: from task args (sq)" "SUCCESS" }
    if ($taskArgs -match '-ServerUrl\\s+"([^"]+)"') { $ServerUrl = $Matches[1]; Write-Status "ServerUrl: $ServerUrl" "INFO" }
} else { Write-Status "No scheduled task found - will try script content" "WARN" }

# Fallback: try to extract from script content (v5.x variable assignment style)
if (-not $AgentToken) {
    $content = Get-Content $agentScript.FullName -Raw
    if ($content -match '\\$AgentToken\\s*=\\s*"([^"]+)"') { $AgentToken = $Matches[1]; Write-Status "AgentToken: from script content" "SUCCESS" }
    if ($content -match '\\$HmacSecret\\s*=\\s*"([^"]+)"') { $HmacSecret = $Matches[1]; Write-Status "HmacSecret: from script content" "SUCCESS" }
}

if (-not $AgentName -or -not $AgentToken) {
    Write-Status "FAILED: Cannot extract credentials!" "ERROR"
    Write-Status "  AgentName: $(if($AgentName){'OK'}else{'MISSING'})" "ERROR"
    Write-Status "  AgentToken: $(if($AgentToken){'OK'}else{'MISSING'})" "ERROR"
    Write-Host ""
    if ($existingTask) { Write-Status "Task args: $taskArgs" "WARN" }
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Status "Credentials OK | Agent: $AgentName | HMAC: $(if($HmacSecret){'YES'}else{'NO'})" "SUCCESS"

# PHASE 2: Stop services (AFTER extracting credentials)
Write-Status "PHASE 2/5: Stop Services" "INFO"
$tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
if ($tasks) {
    $tasks | ForEach-Object {
        Write-Status "  Stopping: $($_.TaskName)" "INFO"
        Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }
    Write-Status "Services stopped" "SUCCESS"
} else { Write-Status "No tasks to stop" "WARN" }
Start-Sleep -Seconds 2

# PHASE 3: Backup
Write-Status "PHASE 3/5: Backup" "INFO"
$backupDir = "$InstallDir\\backup"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
Copy-Item $agentScript.FullName (Join-Path $backupDir "backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').ps1") -Force
Write-Status "Backup created" "SUCCESS"

# PHASE 4: Download updated script (NO credential injection - template uses param())
Write-Status "PHASE 4/5: Download Updated Script" "INFO"
$newScript = $null; $newVer = "unknown"; $downloadMethod = "none"
$dlUrl = "$ServerUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain"

# Method 1: Invoke-RestMethod
try {
    $template = Invoke-RestMethod -Uri $dlUrl -Method GET -TimeoutSec 60
    if ($template -and $template.Length -gt 5000) { $newScript = $template; $downloadMethod = "IRM"; Write-Status "Downloaded via IRM ($($template.Length) chars)" "SUCCESS" }
    else { Write-Status "IRM response too short" "WARN" }
} catch { Write-Status "IRM failed: $($_.Exception.Message)" "WARN" }

# Method 2: Invoke-WebRequest
if (-not $newScript) {
    try {
        $resp = Invoke-WebRequest -Uri $dlUrl -UseBasicParsing -TimeoutSec 60
        if ($resp.Content -and $resp.Content.Length -gt 5000) { $newScript = $resp.Content; $downloadMethod = "IWR"; Write-Status "Downloaded via IWR" "SUCCESS" }
    } catch { Write-Status "IWR failed: $($_.Exception.Message)" "WARN" }
}

# Method 3: WebClient
if (-not $newScript) {
    try {
        $wc = New-Object System.Net.WebClient; $wc.Proxy = [System.Net.WebRequest]::GetSystemWebProxy(); $wc.Proxy.Credentials = [System.Net.CredentialCache]::DefaultCredentials
        $template = $wc.DownloadString($dlUrl)
        if ($template -and $template.Length -gt 5000) { $newScript = $template; $downloadMethod = "WebClient"; Write-Status "Downloaded via WebClient" "SUCCESS" }
    } catch { Write-Status "WebClient failed: $($_.Exception.Message)" "WARN" }
}

if (-not $newScript) { Write-Status "ALL download methods FAILED!" "ERROR"; Read-Host "Press Enter to exit"; exit 1 }

# Extract version from downloaded script
if ($newScript -match 'AgentVersion\\s*=\\s*"([^"]+)"') { $newVer = $Matches[1] }
Write-Status "Version: $newVer" "INFO"

# PHASE 5: Reinstall with credentials as TASK ARGUMENTS (param() compatible)
Write-Status "PHASE 5/5: Reinstall" "INFO"

# Remove old scripts
Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'backup' } | Remove-Item -Force

# Write new script (template without credentials - they go in task args)
$scriptPath = "$InstallDir\\cybershield-agent-$AgentName.ps1"
[IO.File]::WriteAllText($scriptPath, $newScript, [Text.Encoding]::UTF8)
Write-Status "Script: $scriptPath ($($newScript.Length) chars)" "SUCCESS"

# Build task arguments - credentials passed as script parameters
$q = [char]34
$taskArgStr = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $q$scriptPath$q -ServerUrl $q$ServerUrl$q -AgentToken $q$AgentToken$q -HmacSecret $q$HmacSecret$q -AgentName $q$AgentName$q"
Write-Status "Task args built ($($taskArgStr.Length) chars)" "INFO"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $taskArgStr
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$taskFullName = "$TaskName-$AgentName"

Register-ScheduledTask -TaskName $taskFullName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Status "Task registered: $taskFullName" "SUCCESS"

Start-ScheduledTask -TaskName $taskFullName
Write-Status "Task started" "SUCCESS"

Start-Sleep -Seconds 3
$info = Get-ScheduledTaskInfo -TaskName $taskFullName -ErrorAction SilentlyContinue
if ($info) {
    Write-Status "LastRunTime: $($info.LastRunTime)" "INFO"
    Write-Status "LastTaskResult: $($info.LastTaskResult)" "INFO"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " REINSTALLATION COMPLETED!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Agent: $AgentName" -ForegroundColor White
Write-Host "  Version: $newVer" -ForegroundColor White
Write-Host "  Method: $downloadMethod" -ForegroundColor White
Write-Host "  Script: $scriptPath" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to close"
`;
