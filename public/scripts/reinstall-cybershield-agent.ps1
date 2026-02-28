# CyberShield Agent - Reinstallation Script
# Version: 1.0.0
# Usage: .\reinstall-cybershield-agent.ps1 -EnrollmentKey "xxx" -ServerUrl "https://xxx.supabase.co"

param(
    [Parameter(Mandatory=$true)]
    [string]$EnrollmentKey,
    
    [Parameter(Mandatory=$true)]
    [string]$ServerUrl
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " CyberShield Agent - Reinstall Script" -ForegroundColor Cyan
Write-Host " Version: 1.0.0" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$taskName = "CyberShieldAgent"
$installDir = "C:\CyberShield"

try {
    # Check if running as Administrator
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    
    if (-not $isAdmin) {
        Write-Host "[ERROR]  This script must be run as Administrator" -ForegroundColor Red
        Write-Host "   Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
        exit 1
    }

    # 1. Stop and remove existing scheduled task
    Write-Host "[1/5] Stopping existing agent..." -ForegroundColor Yellow
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Write-Host "  Found existing task: $taskName" -ForegroundColor Gray
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host "  ? Task removed successfully" -ForegroundColor Green
    } else {
        Write-Host "  [INFO]  No existing task found" -ForegroundColor Gray
    }

    # 2. Remove old installation directory
    Write-Host "[2/5] Cleaning old installation..." -ForegroundColor Yellow
    if (Test-Path $installDir) {
        Write-Host "  Removing directory: $installDir" -ForegroundColor Gray
        Remove-Item $installDir -Recurse -Force -ErrorAction Stop
        Write-Host "  ? Directory cleaned successfully" -ForegroundColor Green
    } else {
        Write-Host "  [INFO]  No existing installation found" -ForegroundColor Gray
    }

    # 3. Download latest installer
    Write-Host "[3/5] Downloading latest installer..." -ForegroundColor Yellow
    $installerPath = Join-Path $env:TEMP "install-windows-latest-$(Get-Date -Format 'yyyyMMdd-HHmmss').ps1"
    $url = "$ServerUrl/functions/v1/serve-installer/${EnrollmentKey}?os_type=windows"
    
    Write-Host "  URL: $url" -ForegroundColor Gray
    
    try {
        # Enable TLS 1.2
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        
        Invoke-WebRequest -Uri $url -OutFile $installerPath -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop
        Write-Host "  ? Installer downloaded to: $installerPath" -ForegroundColor Green
        Write-Host "  Size: $((Get-Item $installerPath).Length / 1KB) KB" -ForegroundColor Gray
    } catch {
        Write-Host "  [ERROR]  Failed to download installer: $($_.Exception.Message)" -ForegroundColor Red
        throw
    }

    # 4. Execute installer
    Write-Host "[4/5] Running installer..." -ForegroundColor Yellow
    Write-Host "  This may take a minute..." -ForegroundColor Gray
    
    # Clear stale v5 integrity cache to avoid false tamper abort after reinstall
    $hashJson = "C:\CyberShield\data\expected_script_hash.json"
    $hashTxt = "C:\CyberShield\data\expected_script_hash.txt"
    if (Test-Path $hashJson) {
        Remove-Item $hashJson -Force -ErrorAction SilentlyContinue
        Write-Host "  [INFO]  Cleared stale integrity cache: $hashJson" -ForegroundColor Gray
    }
    if (Test-Path $hashTxt) {
        Remove-Item $hashTxt -Force -ErrorAction SilentlyContinue
        Write-Host "  [INFO]  Cleared stale integrity cache: $hashTxt" -ForegroundColor Gray
    }
    
    try {
        & powershell.exe -ExecutionPolicy Bypass -File $installerPath
        
        if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
            throw "Installer exited with code: $LASTEXITCODE"
        }
        
        Write-Host "  ? Installer completed successfully" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR]  Installer failed: $($_.Exception.Message)" -ForegroundColor Red
        throw
    }

    # 5. Verify installation and check logs
    Write-Host "[5/5] Verifying installation..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    # Check scheduled task
    $newTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($newTask) {
        Write-Host "  ? Scheduled task created: $taskName" -ForegroundColor Green
        Write-Host "  Task state: $($newTask.State)" -ForegroundColor Gray
    } else {
        Write-Host "  [WARN]  Scheduled task not found" -ForegroundColor Yellow
    }
    
    # Check installation directory
    if (Test-Path $installDir) {
        Write-Host "  ? Installation directory exists: $installDir" -ForegroundColor Green
    } else {
        Write-Host "  [WARN]  Installation directory not found" -ForegroundColor Yellow
    }
    
    # Check and display recent logs
    $logFile = "C:\CyberShield\logs\agent.log"
    if (Test-Path $logFile) {
        Write-Host ""
        Write-Host "  [DOC]  Recent agent logs:" -ForegroundColor Cyan
        Write-Host "  " + ("-" * 60) -ForegroundColor Gray
        Get-Content $logFile -Tail 20 | ForEach-Object {
            Write-Host "  $_" -ForegroundColor Gray
        }
        Write-Host "  " + ("-" * 60) -ForegroundColor Gray
    } else {
        Write-Host "  [WARN]  Log file not found: $logFile" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "[OK]  Reinstallation completed successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor White
    Write-Host "  1. Check CyberShield dashboard for agent status" -ForegroundColor Gray
    Write-Host "  2. Verify heartbeat is being sent (check logs)" -ForegroundColor Gray
    Write-Host "  3. Monitor for any authentication errors (401)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Useful commands:" -ForegroundColor White
    Write-Host "  View logs:  Get-Content C:\CyberShield\logs\agent.log -Tail 50 -Wait" -ForegroundColor Gray
    Write-Host "  Task info:  Get-ScheduledTask -TaskName CyberShieldAgent | fl" -ForegroundColor Gray
    Write-Host "  Task logs:  Get-ScheduledTaskInfo -TaskName CyberShieldAgent" -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "[ERROR]  Reinstallation failed!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Stack trace:" -ForegroundColor Yellow
    Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor White
    Write-Host "  1. Check internet connectivity" -ForegroundColor Gray
    Write-Host "  2. Verify enrollment key is valid" -ForegroundColor Gray
    Write-Host "  3. Ensure server URL is correct" -ForegroundColor Gray
    Write-Host "  4. Check Windows Event Viewer for details" -ForegroundColor Gray
    Write-Host ""
    exit 1
}
