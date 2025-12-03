# CyberShield Agent - Reinstallation Script
# Version: 1.0.0
# Purpose: Clean uninstall old agent with hardcoded paths + fresh reinstall
# Usage: Run as Administrator

#Requires -RunAsAdministrator

param(
    [Parameter(Mandatory=$false)]
    [string]$EnrollmentKey,
    
    [Parameter(Mandatory=$false)]
    [string]$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " CyberShield Agent - Clean Reinstall" -ForegroundColor Cyan
Write-Host " Version: 1.0.0" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Phase 1: Stop and remove ALL CyberShield scheduled tasks
Write-Host "[1/4] Stopping and removing scheduled tasks..." -ForegroundColor Yellow

$tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
if ($tasks) {
    foreach ($task in $tasks) {
        Write-Host "  Removing task: $($task.TaskName)" -ForegroundColor Gray
        Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }
    Write-Host "  [OK] Tasks removed" -ForegroundColor Green
} else {
    Write-Host "  [INFO] No CyberShield tasks found" -ForegroundColor Gray
}

# Phase 2: Kill any running agent processes
Write-Host "[2/4] Stopping agent processes..." -ForegroundColor Yellow

$processes = Get-Process -Name "powershell*" -ErrorAction SilentlyContinue | 
    Where-Object { $_.MainWindowTitle -like "*CyberShield*" -or $_.CommandLine -like "*cybershield*" }

if ($processes) {
    foreach ($proc in $processes) {
        Write-Host "  Stopping process: $($proc.Id)" -ForegroundColor Gray
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  [OK] Processes stopped" -ForegroundColor Green
} else {
    Write-Host "  [INFO] No agent processes found" -ForegroundColor Gray
}

# Phase 3: Delete installation directory
Write-Host "[3/4] Removing installation directory..." -ForegroundColor Yellow

$installDir = "C:\CyberShield"
if (Test-Path $installDir) {
    Remove-Item -Path $installDir -Recurse -Force -ErrorAction Stop
    Write-Host "  [OK] Directory removed: $installDir" -ForegroundColor Green
} else {
    Write-Host "  [INFO] Directory not found: $installDir" -ForegroundColor Gray
}

# Phase 4: Fresh install (if enrollment key provided)
Write-Host "[4/4] Fresh installation..." -ForegroundColor Yellow

if ([string]::IsNullOrEmpty($EnrollmentKey)) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host " CLEANUP COMPLETE" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor White
    Write-Host "  1. Go to CyberShield Dashboard" -ForegroundColor Gray
    Write-Host "  2. Navigate to /admin/agent-installer" -ForegroundColor Gray
    Write-Host "  3. Generate a new Enrollment Key" -ForegroundColor Gray
    Write-Host "  4. Copy and run the installation command" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or run this script with parameters:" -ForegroundColor White
    Write-Host "  .\reinstall-agent-clean.ps1 -EnrollmentKey 'YOUR_KEY'" -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

# Execute fresh install
Write-Host "  Downloading and executing installer..." -ForegroundColor Gray
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$installUrl = "$ServerUrl/functions/v1/serve-installer/$EnrollmentKey`?os_type=windows"
try {
    Invoke-RestMethod -Uri $installUrl | Invoke-Expression
    Write-Host "  [OK] Installation completed" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Installation failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " REINSTALLATION COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "The agent should now be running with version v3.10.19+" -ForegroundColor White
Write-Host "Check the dashboard at /admin/agent-health for status" -ForegroundColor Gray
Write-Host ""
