/**
 * PowerShell script builder for get-reinstall-by-name
 * Extraído de get-reinstall-by-name/index.ts
 */

/**
 * Builds the self-contained preserve-reinstall PowerShell script.
 */
export function buildReinstallScript(
  agentName: string,
  freshToken: string,
  hmacSecret: string,
  supabaseUrl: string,
  scriptVersion: string,
  scriptContent: string,
): string {
  // Apply emergency hotfix for legacy builds
  let safeScript = scriptContent;
  if (safeScript.match(/\$anomalies\.anomalies/)) {
    const safeAnomalyExpr = '$(if ($anomalies -is [hashtable] -and $anomalies.ContainsKey("anomalies") -and $null -ne $anomalies["anomalies"]) { @($anomalies["anomalies"]) } else { @() })';
    safeScript = safeScript.replace(/\$anomalies\.anomalies/g, safeAnomalyExpr);
  }

  return `# CyberShield - Auto-Recover Reinstall for: ${agentName}
# Generated: ${new Date().toISOString()}
# Script version: ${scriptVersion}
# This script preserves the agent identity (no duplicate)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = "Stop"
$InstallDir = "C:\\CyberShield"
$TaskName = "CyberShieldAgent"
$q = [char]34

# Pre-loaded credentials (recovered from server)
$AgentName = "${agentName}"
$AgentToken = "${freshToken}"
$HmacSecret = "${hmacSecret}"
$ServerUrl = "${supabaseUrl}"

function Write-Status {
    param([string]$M, [string]$T = "INFO")
    $colors = @{INFO="Cyan";SUCCESS="Green";WARN="Yellow";ERROR="Red"}
    $c = if ($colors.ContainsKey($T)) { $colors[$T] } else { "White" }
    Write-Host "[$T] $M" -ForegroundColor $c
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " CyberShield - Auto-Recover Reinstall" -ForegroundColor Cyan
Write-Host " Agent: $AgentName" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Admin check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Status "ERROR: Must run as Administrator!" "ERROR"
    Start-Sleep -Seconds 10
    return
}

Write-Status "Credentials pre-loaded from server" "SUCCESS"
Write-Status "  Agent: $AgentName" "INFO"
Write-Status "  Token: $($AgentToken.Substring(0,8))..." "INFO"
Write-Status "  HMAC: $(if($HmacSecret){'YES'}else{'NO'})" "INFO"
Write-Host ""

try {

# PHASE 1/4: Stop and Remove Existing Services
Write-Status "PHASE 1/4: Stop Services" "INFO"
$tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
if ($tasks) {
    $tasks | ForEach-Object {
        Write-Status "  Stopping: $($_.TaskName)" "INFO"
        Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }
    Write-Status "All CyberShield tasks removed" "SUCCESS"
} else { Write-Status "No tasks to stop" "WARN" }
Start-Sleep -Seconds 2

# PHASE 2/4: Backup
Write-Status "PHASE 2/4: Backup" "INFO"
if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null; Write-Status "Created $InstallDir" "SUCCESS" }
$backupDir = "$InstallDir\\backup"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
$existingScripts = Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'backup' }
if ($existingScripts) {
    $backupName = "backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').ps1"
    $existingScripts | ForEach-Object { Copy-Item $_.FullName (Join-Path $backupDir $backupName) -Force }
    Write-Status "Backup: $backupName" "SUCCESS"
} else { Write-Status "No existing scripts to backup" "WARN" }

# PHASE 3/4: Install Script
Write-Status "PHASE 3/4: Install Script" "INFO"
Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'backup' } | Remove-Item -Force
$scriptPath = "$InstallDir\\cybershield-agent-$AgentName.ps1"
$cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$dlUrl = "$ServerUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain&cb=$cacheBust"
Write-Status "Downloading from: $dlUrl" "INFO"

$newScript = $null
try { $newScript = Invoke-RestMethod -Uri $dlUrl -Method GET -TimeoutSec 60; if ($newScript -and $newScript.Length -gt 5000) { Write-Status "Downloaded ($($newScript.Length) chars)" "SUCCESS" } else { $newScript = $null } } catch { Write-Status "Download method 1 failed: $($_.Exception.Message)" "WARN" }
if (-not $newScript) { try { $resp = Invoke-WebRequest -Uri $dlUrl -UseBasicParsing -TimeoutSec 60; if ($resp.Content -and $resp.Content.Length -gt 5000) { $newScript = $resp.Content; Write-Status "Downloaded via fallback ($($resp.Content.Length) chars)" "SUCCESS" } } catch { Write-Status "Download method 2 failed: $($_.Exception.Message)" "WARN" } }
if (-not $newScript) { Write-Status "ALL download methods FAILED!" "ERROR"; Start-Sleep -Seconds 10; return }

if ($newScript -match '\\$anomalies\\.anomalies') {
    $safeAnomalyExpr = '$(if ($anomalies -is [hashtable] -and $anomalies.ContainsKey("anomalies") -and $null -ne $anomalies["anomalies"]) { @($anomalies["anomalies"]) } else { @() })'
    $newScript = $newScript.Replace('$anomalies.anomalies', $safeAnomalyExpr)
    Write-Status "Applied heartbeat anomaly hotfix to downloaded script" "WARN"
}

[System.IO.File]::WriteAllText($scriptPath, $newScript, [System.Text.Encoding]::UTF8)
Write-Status "Script written: $scriptPath" "SUCCESS"
$newVer = "unknown"
if ($newScript -match 'AgentVersion\\s*=\\s*"([^"]+)"') { $newVer = $Matches[1] }
Write-Status "Version: $newVer" "SUCCESS"
Write-Host ""

# PHASE 4/4: Register Scheduled Task
Write-Status "PHASE 4/4: Register Task" "INFO"
$hashCacheDir = "$InstallDir\\data"
$staleHashFiles = @("$hashCacheDir\\expected_script_hash.json", "$hashCacheDir\\expected_script_hash.txt")
foreach ($stale in $staleHashFiles) { if (Test-Path $stale) { Remove-Item $stale -Force -ErrorAction SilentlyContinue; Write-Status "Cleared stale integrity cache: $stale" "INFO" } }

$taskArgStr = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $q$scriptPath$q -ServerUrl $q$ServerUrl$q -AgentToken $q$AgentToken$q -HmacSecret $q$HmacSecret$q -AgentName $q$AgentName$q"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $taskArgStr
$trigger1 = New-ScheduledTaskTrigger -AtStartup
$trigger2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 365)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$taskFullName = "$TaskName-$AgentName"
Register-ScheduledTask -TaskName $taskFullName -Action $action -Trigger @($trigger1,$trigger2) -Settings $settings -Principal $principal -Force | Out-Null
Write-Status "Task registered: $taskFullName (AtStartup + every 5min)" "SUCCESS"
Start-ScheduledTask -TaskName $taskFullName
Write-Status "Task started" "SUCCESS"
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " REINSTALLATION COMPLETED!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Agent:    $AgentName" -ForegroundColor White
Write-Host "  Version:  $newVer" -ForegroundColor White
Write-Host "  Identity: PRESERVED (same agent ID)" -ForegroundColor Green
Write-Host "  Task:     $taskFullName" -ForegroundColor White
Write-Host ""

$finalTask = Get-ScheduledTask -TaskName $taskFullName -ErrorAction SilentlyContinue
if ($finalTask) { Write-Host "  State: $($finalTask.State)" -ForegroundColor White }
Write-Host ""

} catch {
    Write-Host ""
    Write-Status "FATAL ERROR: $($_.Exception.Message)" "ERROR"
    Write-Status "Line: $($_.InvocationInfo.ScriptLineNumber)" "ERROR"
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    Write-Host ""
}

Start-Sleep -Seconds 15
`;
}
