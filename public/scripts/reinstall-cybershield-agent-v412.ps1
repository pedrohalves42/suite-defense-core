# CyberShield Agent - Mass Reinstallation Script
# Version: 2.0.0 (Target v4.1.2)
# Usage: .\reinstall-cybershield-agent-v412.ps1 -EnrollmentKey "XXXX-XXXX-XXXX-XXXX" [-ServerUrl "https://xxx.supabase.co"]
# 
# CRITICAL: This script performs COMPLETE cleanup before fresh installation
# Use for agents stuck on v4.0.x that cannot auto-update

param(
    [Parameter(Mandatory=$true)]
    [string]$EnrollmentKey,
    
    [Parameter(Mandatory=$false)]
    [string]$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Configuration
$taskName = "CyberShieldAgent"
$installDir = "C:\CyberShield"
$targetVersion = "v4.1.2"

function Write-Banner {
    Write-Host ""
    Write-Host "  ========================================================" -ForegroundColor Cyan
    Write-Host "   CyberShield Agent - Mass Reinstallation Script" -ForegroundColor Cyan
    Write-Host "   Target Version: $targetVersion" -ForegroundColor Yellow
    Write-Host "  ========================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Step, [string]$Message)
    Write-Host "  [$Step] $Message" -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Message)
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "  [INFO] $Message" -ForegroundColor Gray
}

function Write-Warning {
    param([string]$Message)
    Write-Host "  [WARN] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "  [ERROR] $Message" -ForegroundColor Red
}

Write-Banner

# Check Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator"
    Write-Host "   Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

Write-Success "Running as Administrator"
Write-Host ""

try {
    # ========================================
    # PHASE 1: Complete Cleanup
    # ========================================
    Write-Step "1/6" "PHASE 1: Complete Cleanup"
    Write-Host ""
    
    # 1.1 Stop ALL CyberShield scheduled tasks
    Write-Info "Stopping all CyberShield scheduled tasks..."
    $tasks = Get-ScheduledTask | Where-Object { $_.TaskName -like "*CyberShield*" }
    foreach ($task in $tasks) {
        Write-Info "  Stopping: $($task.TaskName)"
        Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }
    if ($tasks.Count -eq 0) {
        Write-Info "  No scheduled tasks found"
    } else {
        Write-Success "Removed $($tasks.Count) scheduled task(s)"
    }
    
    # 1.2 Kill any running agent processes
    Write-Info "Terminating any running agent processes..."
    $procs = Get-Process -Name powershell -ErrorAction SilentlyContinue | 
        Where-Object { $_.CommandLine -like "*cybershield*" -or $_.CommandLine -like "*CyberShield*" }
    foreach ($proc in $procs) {
        if ($proc.Id -ne $PID) {
            Write-Info "  Killing PID: $($proc.Id)"
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Success "Agent processes terminated"
    
    # 1.3 Remove installation directory
    Write-Info "Removing installation directory..."
    if (Test-Path $installDir) {
        # Force unlock any locked files
        $files = Get-ChildItem $installDir -Recurse -ErrorAction SilentlyContinue
        foreach ($file in $files) {
            try {
                $file.IsReadOnly = $false
            } catch {}
        }
        Remove-Item $installDir -Recurse -Force -ErrorAction Stop
        Write-Success "Installation directory removed: $installDir"
    } else {
        Write-Info "  No installation directory found"
    }
    
    # 1.4 Clean temp files
    Write-Info "Cleaning temporary files..."
    Remove-Item "$env:TEMP\install-windows*" -Force -ErrorAction SilentlyContinue
    Remove-Item "$env:TEMP\cybershield*" -Force -ErrorAction SilentlyContinue
    Write-Success "Temporary files cleaned"
    
    Write-Host ""
    Write-Success "PHASE 1 Complete: System cleaned"
    Write-Host ""
    
    # ========================================
    # PHASE 2: Validate Environment
    # ========================================
    Write-Step "2/6" "PHASE 2: Validate Environment"
    Write-Host ""
    
    # 2.1 Enable TLS 1.2
    Write-Info "Enabling TLS 1.2..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Success "TLS 1.2 enabled"
    
    # 2.2 Test connectivity
    Write-Info "Testing connectivity to server..."
    try {
        $testUrl = "$ServerUrl/functions/v1/health"
        $response = Invoke-WebRequest -Uri $testUrl -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        Write-Success "Server reachable (HTTP $($response.StatusCode))"
    } catch {
        Write-Warning "Health check failed, but will continue..."
    }
    
    # 2.3 Validate enrollment key format
    Write-Info "Validating enrollment key format..."
    if ($EnrollmentKey -notmatch "^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$") {
        Write-Warning "Enrollment key format unusual (expected XXXX-XXXX-XXXX-XXXX)"
    } else {
        Write-Success "Enrollment key format valid"
    }
    
    Write-Host ""
    Write-Success "PHASE 2 Complete: Environment validated"
    Write-Host ""
    
    # ========================================
    # PHASE 3: Download Installer
    # ========================================
    Write-Step "3/6" "PHASE 3: Download Installer"
    Write-Host ""
    
    $installerPath = Join-Path $env:TEMP "install-windows-v412-$(Get-Date -Format 'yyyyMMdd-HHmmss').ps1"
    $url = "$ServerUrl/functions/v1/serve-installer/${EnrollmentKey}?os_type=windows"
    
    Write-Info "Downloading from: $ServerUrl"
    Write-Info "Target: $installerPath"
    
    try {
        Invoke-WebRequest -Uri $url -OutFile $installerPath -UseBasicParsing -TimeoutSec 120 -ErrorAction Stop
        $size = [math]::Round((Get-Item $installerPath).Length / 1KB, 2)
        Write-Success "Installer downloaded: $size KB"
    } catch {
        Write-Error "Failed to download installer: $($_.Exception.Message)"
        throw
    }
    
    # Validate installer content
    $content = Get-Content $installerPath -Raw -ErrorAction SilentlyContinue
    if ($content -like "*error*" -and $content -like "*invalid*") {
        Write-Error "Installer returned error (possibly invalid enrollment key)"
        Write-Host $content -ForegroundColor Red
        throw "Invalid installer content"
    }
    
    Write-Host ""
    Write-Success "PHASE 3 Complete: Installer downloaded"
    Write-Host ""
    
    # ========================================
    # PHASE 4: Execute Installation
    # ========================================
    Write-Step "4/6" "PHASE 4: Execute Installation"
    Write-Host ""
    
    Write-Info "Executing installer..."
    Write-Info "This may take 1-2 minutes..."
    Write-Host ""
    
    try {
        # Execute with bypass and capture output
        $output = & powershell.exe -ExecutionPolicy Bypass -NoProfile -File $installerPath 2>&1
        
        # Display installer output
        foreach ($line in $output) {
            Write-Host "    $line" -ForegroundColor Gray
        }
        
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
            Write-Warning "Installer exit code: $LASTEXITCODE"
        }
        
        Write-Host ""
        Write-Success "Installer execution completed"
    } catch {
        Write-Error "Installer failed: $($_.Exception.Message)"
        throw
    }
    
    Write-Host ""
    Write-Success "PHASE 4 Complete: Installation executed"
    Write-Host ""
    
    # ========================================
    # PHASE 5: Verify Installation
    # ========================================
    Write-Step "5/6" "PHASE 5: Verify Installation"
    Write-Host ""
    
    # Wait for agent to initialize
    Write-Info "Waiting 10 seconds for agent initialization..."
    Start-Sleep -Seconds 10
    
    $verificationErrors = @()
    
    # 5.1 Check scheduled task
    Write-Info "Checking scheduled task..."
    $newTask = Get-ScheduledTask | Where-Object { $_.TaskName -like "*CyberShield*" } | Select-Object -First 1
    if ($newTask) {
        Write-Success "Scheduled task found: $($newTask.TaskName)"
        Write-Info "  State: $($newTask.State)"
        
        # Start if not running
        if ($newTask.State -ne "Running") {
            Write-Info "  Starting scheduled task..."
            Start-ScheduledTask -TaskName $newTask.TaskName -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
    } else {
        $verificationErrors += "Scheduled task not created"
        Write-Warning "Scheduled task not found"
    }
    
    # 5.2 Check installation directory
    Write-Info "Checking installation directory..."
    if (Test-Path $installDir) {
        $scripts = Get-ChildItem "$installDir\*.ps1" -ErrorAction SilentlyContinue
        Write-Success "Installation directory exists"
        Write-Info "  Scripts found: $($scripts.Count)"
        foreach ($script in $scripts) {
            Write-Info "    - $($script.Name)"
        }
    } else {
        $verificationErrors += "Installation directory not created"
        Write-Warning "Installation directory not found"
    }
    
    # 5.3 Check logs directory
    Write-Info "Checking logs..."
    $logDir = "$installDir\logs"
    if (Test-Path $logDir) {
        $logFiles = Get-ChildItem "$logDir\*.log" -ErrorAction SilentlyContinue
        Write-Success "Logs directory exists"
        
        # Show recent log content
        $mainLog = Get-ChildItem "$logDir\*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($mainLog) {
            Write-Host ""
            Write-Info "Recent log entries from: $($mainLog.Name)"
            Write-Host "  ----------------------------------------" -ForegroundColor Gray
            Get-Content $mainLog.FullName -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object {
                Write-Host "  $_" -ForegroundColor Gray
            }
            Write-Host "  ----------------------------------------" -ForegroundColor Gray
        }
    } else {
        Write-Info "Logs directory not yet created (may appear after first heartbeat)"
    }
    
    Write-Host ""
    if ($verificationErrors.Count -eq 0) {
        Write-Success "PHASE 5 Complete: Installation verified"
    } else {
        Write-Warning "PHASE 5 Complete with warnings: $($verificationErrors -join ', ')"
    }
    Write-Host ""
    
    # ========================================
    # PHASE 6: Final Summary
    # ========================================
    Write-Step "6/6" "PHASE 6: Final Summary"
    Write-Host ""
    
    Write-Host "  ========================================================" -ForegroundColor Green
    Write-Host "   REINSTALLATION COMPLETE" -ForegroundColor Green
    Write-Host "  ========================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Target Version: $targetVersion" -ForegroundColor White
    Write-Host "  Server: $ServerUrl" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "  Next Steps:" -ForegroundColor White
    Write-Host "    1. Check CyberShield dashboard for agent status (1-2 min)" -ForegroundColor Gray
    Write-Host "    2. Verify agent version shows $targetVersion" -ForegroundColor Gray
    Write-Host "    3. Confirm heartbeat is being received (green status)" -ForegroundColor Gray
    Write-Host "    4. Monitor logs for any errors" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "  Useful Commands:" -ForegroundColor White
    Write-Host "    View logs:   Get-Content $logDir\agent.log -Tail 50 -Wait" -ForegroundColor Gray
    Write-Host "    Task info:   Get-ScheduledTask -TaskName CyberShield* | fl" -ForegroundColor Gray
    Write-Host "    Start task:  Start-ScheduledTask -TaskName CyberShieldAgent" -ForegroundColor Gray
    Write-Host ""
    
    exit 0

} catch {
    Write-Host ""
    Write-Host "  ========================================================" -ForegroundColor Red
    Write-Host "   REINSTALLATION FAILED" -ForegroundColor Red
    Write-Host "  ========================================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Stack Trace:" -ForegroundColor Yellow
    Write-Host "  $($_.ScriptStackTrace)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Troubleshooting:" -ForegroundColor White
    Write-Host "    1. Check internet connectivity" -ForegroundColor Gray
    Write-Host "    2. Verify enrollment key is valid and not expired" -ForegroundColor Gray
    Write-Host "    3. Ensure server URL is correct" -ForegroundColor Gray
    Write-Host "    4. Check Windows Event Viewer for details" -ForegroundColor Gray
    Write-Host "    5. Try running the script again after fixing the issue" -ForegroundColor Gray
    Write-Host ""
    
    exit 1
}
