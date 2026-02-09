// CyberShield Agent - Reinstall Preserve Script Content
// Embedded version for Edge Function delivery
// Version: 2.4.0 - Added fallback download methods and improved error messages

export const REINSTALL_PRESERVE_SCRIPT_CONTENT = `# CyberShield Agent - Reinstall Preserve v2.4.0
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = "Stop"
$InstallDir = "C:\\CyberShield"
$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
$TaskName = "CyberShieldAgent"

function Write-Status { param([string]$M, [string]$T = "INFO"); Write-Host "[$T] $M" -ForegroundColor (@{INFO="Cyan";SUCCESS="Green";WARN="Yellow";ERROR="Red"}[$T]) }

Write-Host "CyberShield Agent - Reinstall Preserve v2.4.0" -ForegroundColor Cyan
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Write-Status "Run as Administrator!" "ERROR"; exit 1 }

# PHASE 1: Detect existing agent
Write-Status "PHASE 1/5: Detect Existing Agent" "INFO"
$script = Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $script) { Write-Status "No existing agent found in $InstallDir!" "ERROR"; Write-Status "Use clean reinstall with enrollment key instead." "WARN"; exit 1 }

$content = Get-Content $script.FullName -Raw
$AgentName = if ($script.Name -match 'cybershield-agent-(.+)\\.ps1$') { $Matches[1] } else { $null }
$AgentToken = if ($content -match '[$]AgentToken\\s*=\\s*[\\x27\\x22]([^\\x27\\x22]+)[\\x27\\x22]') { $Matches[1] } else { $null }
$HmacSecret = if ($content -match '[$]HmacSecret\\s*=\\s*[\\x27\\x22]([^\\x27\\x22]*)[\\x27\\x22]') { $Matches[1] } else { $null }

if (-not $AgentName -or -not $AgentToken -or -not $HmacSecret) { Write-Status "Incomplete credentials in existing script!" "ERROR"; exit 1 }
Write-Status "Detected: $AgentName" "SUCCESS"

# PHASE 2: Stop services
Write-Status "PHASE 2/5: Stop Services" "INFO"
Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | ForEach-Object { Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

# PHASE 3: Backup
Write-Status "PHASE 3/5: Backup" "INFO"
$backupDir = "$InstallDir\\backup"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
Copy-Item $script.FullName (Join-Path $backupDir "backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').ps1") -Force

# PHASE 4: Download updated script with fallback
Write-Status "PHASE 4/5: Download Updated Script" "INFO"
$newScript = $null; $newVer = "existing"; $downloadMethod = "none"

# Method 1: Invoke-RestMethod (fastest)
try {
    $template = Invoke-RestMethod -Uri "$ServerUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain" -Method GET -TimeoutSec 60
    if ($template -and $template.Length -gt 5000) {
        $template = $template -replace '([$]AgentName\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('\$1"' + $AgentName + '"')
        $template = $template -replace '([$]AgentToken\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('\$1"' + $AgentToken + '"')
        $template = $template -replace '([$]HmacSecret\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('\$1"' + $HmacSecret + '"')
        $newScript = $template; $downloadMethod = "IRM"
        Write-Status "Downloaded via IRM" "SUCCESS"
    }
} catch { Write-Status "IRM failed: $($_.Exception.Message)" "WARN" }

# Method 2: Invoke-WebRequest with UseBasicParsing (better proxy compatibility)
if (-not $newScript) {
    try {
        $resp = Invoke-WebRequest -Uri "$ServerUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain" -UseBasicParsing -TimeoutSec 60
        $template = $resp.Content
        if ($template -and $template.Length -gt 5000) {
            $template = $template -replace '([$]AgentName\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('\$1"' + $AgentName + '"')
            $template = $template -replace '([$]AgentToken\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('\$1"' + $AgentToken + '"')
            $template = $template -replace '([$]HmacSecret\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('\$1"' + $HmacSecret + '"')
            $newScript = $template; $downloadMethod = "IWR"
            Write-Status "Downloaded via IWR" "SUCCESS"
        }
    } catch { Write-Status "IWR failed: $($_.Exception.Message)" "WARN" }
}

# Method 3: WebClient with system proxy
if (-not $newScript) {
    try {
        $wc = New-Object System.Net.WebClient; $wc.Proxy = [System.Net.WebRequest]::GetSystemWebProxy(); $wc.Proxy.Credentials = [System.Net.CredentialCache]::DefaultCredentials
        $template = $wc.DownloadString("$ServerUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain")
        if ($template -and $template.Length -gt 5000) {
            $template = $template -replace '([$]AgentName\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('\$1"' + $AgentName + '"')
            $template = $template -replace '([$]AgentToken\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('\$1"' + $AgentToken + '"')
            $template = $template -replace '([$]HmacSecret\\s*=\\s*)[\\x27\\x22][^\\x27\\x22]*[\\x27\\x22]', ('\$1"' + $HmacSecret + '"')
            $newScript = $template; $downloadMethod = "WebClient"
            Write-Status "Downloaded via WebClient" "SUCCESS"
        }
    } catch { Write-Status "WebClient failed: $($_.Exception.Message)" "WARN" }
}

# If download failed, abort (do not reinstall old version)
if (-not $newScript) {
    Write-Status "FAILED to download latest agent script. Aborting to avoid reinstalling old version." "ERROR"
    Write-Status "Verifique conectividade HTTPS/Proxy e tente novamente." "WARN"
    exit 1
}

# Try to extract version from downloaded script (defensive)
$installedVer = $null
if ($newScript -match '[$]AgentVersion\s*=\s*[\x27\x22]([^\x27\x22]+)[\x27\x22]') { $installedVer = $Matches[1] }
if ($installedVer) { $newVer = $installedVer }

# PHASE 5: Reinstall
Write-Status "PHASE 5/5: Reinstall" "INFO"
Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Remove-Item -Force
$scriptPath = "$InstallDir\\cybershield-agent-$AgentName.ps1"
[IO.File]::WriteAllText($scriptPath, $newScript, [Text.Encoding]::UTF8)

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $([char]34)$scriptPath$([char]34)"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 10 -RestartInterval (New-TimeSpan -Seconds 30)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$taskFullName = "$TaskName-$AgentName"
Register-ScheduledTask -TaskName $taskFullName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskFullName

Start-Sleep -Seconds 2
$info = Get-ScheduledTaskInfo -TaskName $taskFullName -ErrorAction SilentlyContinue
if ($info) {
    Write-Status "Task LastRunTime: $($info.LastRunTime) | LastTaskResult: $($info.LastTaskResult)" "INFO"
}

Write-Host ""
Write-Host "REINSTALLATION COMPLETED!" -ForegroundColor Green
Write-Host "  Agent: $AgentName" -ForegroundColor White
Write-Host "  Version: $newVer" -ForegroundColor White
Write-Host "  Method: $downloadMethod" -ForegroundColor White
Write-Host "  Script: $scriptPath" -ForegroundColor White
`;
