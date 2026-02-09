// CyberShield Agent - Reinstall Preserve Script Content
// Embedded version for Edge Function delivery
// Version: 2.4.0 - Added fallback download methods and improved error messages

export const REINSTALL_PRESERVE_SCRIPT_CONTENT = `# CyberShield Agent - Reinstall Preserve v2.5.0
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = "Stop"
$InstallDir = "C:\\CyberShield"
$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
$TaskName = "CyberShieldAgent"

function Write-Status { param([string]$M, [string]$T = "INFO"); Write-Host "[$T] $M" -ForegroundColor (@{INFO="Cyan";SUCCESS="Green";WARN="Yellow";ERROR="Red"}[$T]) }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " CyberShield - Reinstall Preserve v2.5.0" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Write-Status "Run as Administrator!" "ERROR"; Read-Host "Press Enter to exit"; exit 1 }

# PHASE 1: Detect existing agent
Write-Status "PHASE 1/5: Detect Existing Agent" "INFO"
Write-Status "Looking in: $InstallDir" "INFO"

if (-not (Test-Path $InstallDir)) { Write-Status "Directory $InstallDir does NOT exist!" "ERROR"; Read-Host "Press Enter to exit"; exit 1 }

$files = Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue
Write-Status "Found $($files.Count) agent script(s)" "INFO"
if ($files) { $files | ForEach-Object { Write-Status "  -> $($_.Name) ($($_.Length) bytes)" "INFO" } }

$script = $files | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $script) { Write-Status "No existing agent found!" "ERROR"; Write-Status "Use clean reinstall with enrollment key instead." "WARN"; Read-Host "Press Enter to exit"; exit 1 }

Write-Status "Using: $($script.Name)" "INFO"
$content = Get-Content $script.FullName -Raw
Write-Status "Script size: $($content.Length) chars" "INFO"

# Extract AgentName from filename
$AgentName = $null
if ($script.Name -match 'cybershield-agent-(.+)\\.ps1$') { $AgentName = $Matches[1] }
Write-Status "AgentName from filename: $AgentName" "INFO"

# Extract AgentToken - try multiple patterns
$AgentToken = $null
if ($content -match '\\$AgentToken\\s*=\\s*"([^"]+)"') { $AgentToken = $Matches[1]; Write-Status "AgentToken found (double-quote pattern)" "INFO" }
elseif ($content -match "\\$AgentToken\\s*=\\s*'([^']+)'") { $AgentToken = $Matches[1]; Write-Status "AgentToken found (single-quote pattern)" "INFO" }
else { Write-Status "AgentToken NOT found in script!" "WARN" }

# Extract HmacSecret - try multiple patterns
$HmacSecret = ""
if ($content -match '\\$HmacSecret\\s*=\\s*"([^"]+)"') { $HmacSecret = $Matches[1]; Write-Status "HmacSecret found" "INFO" }
elseif ($content -match "\\$HmacSecret\\s*=\\s*'([^']+)'") { $HmacSecret = $Matches[1]; Write-Status "HmacSecret found (single-quote)" "INFO" }
else { Write-Status "HmacSecret not found (will use empty - OK for v4.x)" "WARN" }

if (-not $AgentName -or -not $AgentToken) {
    Write-Status "FAILED: Missing credentials!" "ERROR"
    Write-Status "  AgentName: $(if($AgentName){'OK'}else{'MISSING'})" "ERROR"
    Write-Status "  AgentToken: $(if($AgentToken){'OK'}else{'MISSING'})" "ERROR"
    Write-Host ""
    Write-Status "DEBUG: First 500 chars of script:" "WARN"
    Write-Host ($content.Substring(0, [Math]::Min(500, $content.Length)))
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Status "Agent: $AgentName | Token: OK | HMAC: $(if($HmacSecret){'OK'}else{'empty'})" "SUCCESS"

# PHASE 2: Stop services
Write-Status "PHASE 2/5: Stop Services" "INFO"
$tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
if ($tasks) { Write-Status "Found $($tasks.Count) task(s) to stop" "INFO"; $tasks | ForEach-Object { Write-Status "  Stopping: $($_.TaskName)" "INFO"; Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue } }
else { Write-Status "No existing tasks found" "WARN" }
Start-Sleep -Seconds 2

# PHASE 3: Backup
Write-Status "PHASE 3/5: Backup" "INFO"
$backupDir = "$InstallDir\\backup"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
Copy-Item $script.FullName (Join-Path $backupDir "backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').ps1") -Force
Write-Status "Backup created" "SUCCESS"

# PHASE 4: Download updated script
Write-Status "PHASE 4/5: Download Updated Script" "INFO"
$newScript = $null; $newVer = "unknown"; $downloadMethod = "none"
$dlUrl = "$ServerUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain"
Write-Status "URL: $dlUrl" "INFO"

# Method 1: Invoke-RestMethod
try {
    Write-Status "Trying IRM..." "INFO"
    $template = Invoke-RestMethod -Uri $dlUrl -Method GET -TimeoutSec 60
    Write-Status "IRM response: $($template.Length) chars" "INFO"
    if ($template -and $template.Length -gt 5000) {
        $template = $template -replace '(\\$AgentName\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('$1"' + $AgentName + '"')
        $template = $template -replace '(\\$AgentToken\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('$1"' + $AgentToken + '"')
        $template = $template -replace '(\\$HmacSecret\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('$1"' + $HmacSecret + '"')
        $newScript = $template; $downloadMethod = "IRM"
        Write-Status "Downloaded via IRM ($($template.Length) chars)" "SUCCESS"
    } else { Write-Status "IRM response too short: $($template.Length) chars" "WARN" }
} catch { Write-Status "IRM failed: $($_.Exception.Message)" "WARN" }

# Method 2: Invoke-WebRequest
if (-not $newScript) {
    try {
        Write-Status "Trying IWR..." "INFO"
        $resp = Invoke-WebRequest -Uri $dlUrl -UseBasicParsing -TimeoutSec 60
        $template = $resp.Content
        Write-Status "IWR response: $($template.Length) chars" "INFO"
        if ($template -and $template.Length -gt 5000) {
            $template = $template -replace '(\\$AgentName\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('$1"' + $AgentName + '"')
            $template = $template -replace '(\\$AgentToken\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('$1"' + $AgentToken + '"')
            $template = $template -replace '(\\$HmacSecret\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('$1"' + $HmacSecret + '"')
            $newScript = $template; $downloadMethod = "IWR"
            Write-Status "Downloaded via IWR" "SUCCESS"
        }
    } catch { Write-Status "IWR failed: $($_.Exception.Message)" "WARN" }
}

# Method 3: WebClient
if (-not $newScript) {
    try {
        Write-Status "Trying WebClient..." "INFO"
        $wc = New-Object System.Net.WebClient; $wc.Proxy = [System.Net.WebRequest]::GetSystemWebProxy(); $wc.Proxy.Credentials = [System.Net.CredentialCache]::DefaultCredentials
        $template = $wc.DownloadString($dlUrl)
        Write-Status "WebClient response: $($template.Length) chars" "INFO"
        if ($template -and $template.Length -gt 5000) {
            $template = $template -replace '(\\$AgentName\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('$1"' + $AgentName + '"')
            $template = $template -replace '(\\$AgentToken\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('$1"' + $AgentToken + '"')
            $template = $template -replace '(\\$HmacSecret\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('$1"' + $HmacSecret + '"')
            $newScript = $template; $downloadMethod = "WebClient"
            Write-Status "Downloaded via WebClient" "SUCCESS"
        }
    } catch { Write-Status "WebClient failed: $($_.Exception.Message)" "WARN" }
}

if (-not $newScript) {
    Write-Status "ALL download methods FAILED!" "ERROR"
    Read-Host "Press Enter to exit"
    exit 1
}

# Extract version
$installedVer = $null
if ($newScript -match '\\$AgentVersion\\s*=\\s*[\\x27\\x22]([^\\x27\\x22]+)[\\x27\\x22]') { $installedVer = $Matches[1] }
if ($installedVer) { $newVer = $installedVer }
Write-Status "Downloaded version: $newVer" "INFO"

# PHASE 5: Reinstall
Write-Status "PHASE 5/5: Reinstall" "INFO"
Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Remove-Item -Force
$scriptPath = "$InstallDir\\cybershield-agent-$AgentName.ps1"
[IO.File]::WriteAllText($scriptPath, $newScript, [Text.Encoding]::UTF8)
Write-Status "Script written: $scriptPath ($($newScript.Length) chars)" "SUCCESS"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $([char]34)$scriptPath$([char]34)"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 10 -RestartInterval (New-TimeSpan -Seconds 30)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$taskFullName = "$TaskName-$AgentName"
Register-ScheduledTask -TaskName $taskFullName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Status "Task registered: $taskFullName" "SUCCESS"
Start-ScheduledTask -TaskName $taskFullName

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
