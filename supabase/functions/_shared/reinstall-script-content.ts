// CyberShield Agent - Reinstallation Script Content
// Embedded version for Edge Function delivery
// Version: 2.0.0 - Optimized for bundle size

export const REINSTALL_SCRIPT_CONTENT = `# CyberShield Agent - Clean Reinstall v2.0.0
param([Parameter(Mandatory=$true)][string]$EnrollmentKey, [Parameter(Mandatory=$true)][string]$ServerUrl)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = "Stop"
$TaskName = "CyberShieldAgent"
$InstallDir = "C:\\CyberShield"

function Write-Status { param([string]$M, [string]$T = "INFO"); Write-Host "[$T] $M" -ForegroundColor (@{INFO="Cyan";SUCCESS="Green";WARN="Yellow";ERROR="Red"}[$T]) }

Write-Host "CyberShield Agent - Clean Reinstall v2.0.0" -ForegroundColor Cyan
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Write-Status "Run as Administrator!" "ERROR"; exit 1 }

try {
    # 1. Stop and remove existing task
    Write-Status "1/5: Stopping existing agent..." "INFO"
    Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | ForEach-Object { Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue }
    
    # 2. Clean old installation
    Write-Status "2/5: Cleaning old installation..." "INFO"
    if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
    
    # 3. Download latest installer
    Write-Status "3/5: Downloading installer..." "INFO"
    $installerPath = Join-Path $env:TEMP "install-$(Get-Date -Format 'yyyyMMdd-HHmmss').ps1"
    $url = "$ServerUrl/functions/v1/serve-installer/$EnrollmentKey?os_type=windows"
    Invoke-WebRequest -Uri $url -OutFile $installerPath -UseBasicParsing -TimeoutSec 60
    Write-Status "Downloaded: $installerPath" "SUCCESS"
    
    # 4. Execute installer
    Write-Status "4/5: Running installer..." "INFO"
    
    # Clear stale v5 integrity cache to avoid false tamper abort after reinstall
    $hashJson = "C:\\CyberShield\\data\\expected_script_hash.json"
    $hashTxt = "C:\\CyberShield\\data\\expected_script_hash.txt"
    if (Test-Path $hashJson) { Remove-Item $hashJson -Force -ErrorAction SilentlyContinue; Write-Status "Cleared stale integrity cache: $hashJson" "INFO" }
    if (Test-Path $hashTxt) { Remove-Item $hashTxt -Force -ErrorAction SilentlyContinue; Write-Status "Cleared stale integrity cache: $hashTxt" "INFO" }

    & powershell.exe -ExecutionPolicy Bypass -File $installerPath
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) { throw "Installer failed: $LASTEXITCODE" }
    Write-Status "Installer completed" "SUCCESS"
    
    # 5. Verify
    Write-Status "5/5: Verifying..." "INFO"
    Start-Sleep -Seconds 5
    $task = Get-ScheduledTask -TaskName "$TaskName*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($task) { Write-Status "Task created: $($task.TaskName) ($($task.State))" "SUCCESS" }
    else { Write-Status "Task not found" "WARN" }
    
    if (Test-Path $InstallDir) { Write-Status "Install dir exists" "SUCCESS" }
    
    Write-Host ""
    Write-Host "REINSTALLATION COMPLETED!" -ForegroundColor Green
} catch {
    Write-Status "FAILED: $($_.Exception.Message)" "ERROR"
    exit 1
}
`;
