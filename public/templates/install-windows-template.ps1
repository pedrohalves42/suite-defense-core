# CyberShield Agent - Windows Installation Script
# Auto-generated: {{TIMESTAMP}}
# Version: 2.1.0

#Requires -Version 3.0

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "CyberShield Agent Installer v2.1.0" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script requires administrator privileges" -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Configuration
$AgentToken = "{{AGENT_TOKEN}}"
$HmacSecret = "{{HMAC_SECRET}}"
$ServerUrl = "{{SERVER_URL}}"
$PollInterval = 60

# Installation directory
$InstallDir = "C:\CyberShield"
$AgentScript = Join-Path $InstallDir "cybershield-agent.ps1"

Write-Host "[1/5] Creating installation directory..." -ForegroundColor Green
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

Write-Host "[2/5] Downloading agent script..." -ForegroundColor Green

# Agent script content (embedded)
$AgentContent = @'
{{AGENT_SCRIPT_CONTENT}}
'@

# Save agent script
Set-Content -Path $AgentScript -Value $AgentContent -Encoding UTF8

Write-Host "[3/5] Testing server connectivity..." -ForegroundColor Green
try {
    $testUrl = "$ServerUrl/functions/v1/heartbeat"
    $response = Invoke-WebRequest -Uri $testUrl -Method OPTIONS -TimeoutSec 5 -UseBasicParsing
    Write-Host "✓ Server is reachable" -ForegroundColor Green
} catch {
    Write-Host "⚠ Warning: Could not reach server at $ServerUrl" -ForegroundColor Yellow
    Write-Host "The agent will retry automatically once installed" -ForegroundColor Yellow
}

Write-Host "[4/5] Creating scheduled task..." -ForegroundColor Green

$taskName = "CyberShield Agent"
$taskDescription = "CyberShield Security Agent - Monitors system and reports to central server"

# Remove existing task if present
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Create action
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" `
    -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$AgentScript`" -AgentToken `"$AgentToken`" -HmacSecret `"$HmacSecret`" -ServerUrl `"$ServerUrl`" -PollInterval $PollInterval"

# Create trigger (at startup)
$trigger = New-ScheduledTaskTrigger -AtStartup

# Create settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 365)

# Create principal (run as SYSTEM)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Register task
Register-ScheduledTask `
    -TaskName $taskName `
    -Description $taskDescription `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal | Out-Null

Write-Host "[5/5] Starting agent..." -ForegroundColor Green

# Start the task
Start-ScheduledTask -TaskName $taskName

# Wait a moment for task to start
Start-Sleep -Seconds 2

# Check if task is running
$task = Get-ScheduledTask -TaskName $taskName
$taskState = $task.State

if ($taskState -eq "Running") {
    Write-Host ""
    Write-Host "==================================" -ForegroundColor Green
    Write-Host "✓ Installation completed successfully!" -ForegroundColor Green
    Write-Host "==================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Agent Status: RUNNING" -ForegroundColor Green
    Write-Host "Installation Directory: $InstallDir" -ForegroundColor Cyan
    Write-Host "Log Directory: C:\CyberShield\logs" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "The agent is now:" -ForegroundColor White
    Write-Host "  • Monitoring this system" -ForegroundColor White
    Write-Host "  • Sending heartbeats every 60 seconds" -ForegroundColor White
    Write-Host "  • Reporting metrics every 5 minutes" -ForegroundColor White
    Write-Host "  • Polling for jobs" -ForegroundColor White
    Write-Host ""
    Write-Host "To view logs:" -ForegroundColor Yellow
    Write-Host "  Get-Content C:\CyberShield\logs\agent.log -Tail 50" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To stop the agent:" -ForegroundColor Yellow
    Write-Host "  Stop-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "WARNING: Agent installed but not running" -ForegroundColor Yellow
    Write-Host "Task State: $taskState" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To start manually:" -ForegroundColor Yellow
    Write-Host "  Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "Press Enter to exit..." -ForegroundColor Gray
Read-Host
