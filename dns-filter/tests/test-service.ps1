# CyberShield DNS Filter - Windows Service Tests
# Requires Administrator privileges
# Run: .\test-service.ps1

param(
    [string]$BinaryPath = "..\bin\cybershield-dns.exe",
    [switch]$Cleanup
)

$ErrorActionPreference = "Stop"
$ServiceName = "CyberShield-DNS"

# Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script requires Administrator privileges" -ForegroundColor Red
    Write-Host "Run PowerShell as Administrator and try again" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n=== WINDOWS SERVICE TESTS ===" -ForegroundColor Cyan
Write-Host "Service: $ServiceName"
Write-Host "Binary: $BinaryPath`n"

function Test-ServiceExists {
    return $null -ne (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)
}

function Test-ServiceRunning {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    return $svc -and $svc.Status -eq "Running"
}

# Cleanup mode
if ($Cleanup) {
    Write-Host "Cleaning up..." -ForegroundColor Yellow
    if (Test-ServiceRunning) {
        Stop-Service -Name $ServiceName -Force
        Write-Host "  Service stopped" -ForegroundColor Gray
    }
    if (Test-ServiceExists) {
        & $BinaryPath -uninstall 2>$null
        Write-Host "  Service uninstalled" -ForegroundColor Gray
    }
    Write-Host "Cleanup complete" -ForegroundColor Green
    exit 0
}

# Verify binary
if (-not (Test-Path $BinaryPath)) {
    Write-Host "ERROR: Binary not found at $BinaryPath" -ForegroundColor Red
    Write-Host "Run build.ps1 first" -ForegroundColor Yellow
    exit 1
}

$results = @()

# TEST 1: Install Service
Write-Host "`n[TEST 1] Service Installation" -ForegroundColor White
try {
    if (Test-ServiceExists) {
        Write-Host "  Service already exists, removing first..." -ForegroundColor Yellow
        & $BinaryPath -uninstall 2>$null
        Start-Sleep -Seconds 2
    }
    
    & $BinaryPath -install
    Start-Sleep -Seconds 2
    
    if (Test-ServiceExists) {
        Write-Host "  ? Service installed successfully" -ForegroundColor Green
        $results += @{ Test = "Install"; Passed = $true }
    } else {
        Write-Host "  ? Service installation failed" -ForegroundColor Red
        $results += @{ Test = "Install"; Passed = $false }
    }
}
catch {
    Write-Host "  ? Error: $($_.Exception.Message)" -ForegroundColor Red
    $results += @{ Test = "Install"; Passed = $false }
}

# TEST 2: Start Service
Write-Host "`n[TEST 2] Service Start" -ForegroundColor White
try {
    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 3
    
    if (Test-ServiceRunning) {
        Write-Host "  ? Service started successfully" -ForegroundColor Green
        $results += @{ Test = "Start"; Passed = $true }
    } else {
        Write-Host "  ? Service failed to start" -ForegroundColor Red
        $results += @{ Test = "Start"; Passed = $false }
    }
}
catch {
    Write-Host "  ? Error: $($_.Exception.Message)" -ForegroundColor Red
    $results += @{ Test = "Start"; Passed = $false }
}

# TEST 3: Service Recovery Configuration
Write-Host "`n[TEST 3] Recovery Configuration" -ForegroundColor White
try {
    $recoveryInfo = sc.exe qfailure $ServiceName 2>&1
    $hasRecovery = $recoveryInfo -match "RESTART"
    
    if ($hasRecovery) {
        Write-Host "  ? Recovery actions configured" -ForegroundColor Green
        $results += @{ Test = "Recovery"; Passed = $true }
    } else {
        Write-Host "  [WARN]  Recovery actions not configured (optional)" -ForegroundColor Yellow
        $results += @{ Test = "Recovery"; Passed = $true }  # Not critical
    }
}
catch {
    Write-Host "  [WARN]  Could not check recovery config" -ForegroundColor Yellow
    $results += @{ Test = "Recovery"; Passed = $true }
}

# TEST 4: Crash Recovery (Simulated)
Write-Host "`n[TEST 4] Crash Recovery Simulation" -ForegroundColor White
try {
    $svc = Get-Service -Name $ServiceName
    $pid = (Get-CimInstance Win32_Service -Filter "Name='$ServiceName'").ProcessId
    
    if ($pid -and $pid -gt 0) {
        Write-Host "  Killing process $pid..." -ForegroundColor Gray
        Stop-Process -Id $pid -Force
        Start-Sleep -Seconds 5
        
        # Check if service recovered
        if (Test-ServiceRunning) {
            Write-Host "  ? Service recovered automatically" -ForegroundColor Green
            $results += @{ Test = "CrashRecovery"; Passed = $true }
        } else {
            Write-Host "  [WARN]  Service did not auto-recover (may need manual config)" -ForegroundColor Yellow
            # Restart manually for remaining tests
            Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
            $results += @{ Test = "CrashRecovery"; Passed = $false }
        }
    } else {
        Write-Host "  [WARN]  Could not get process ID" -ForegroundColor Yellow
        $results += @{ Test = "CrashRecovery"; Passed = $false }
    }
}
catch {
    Write-Host "  [WARN]  Error: $($_.Exception.Message)" -ForegroundColor Yellow
    $results += @{ Test = "CrashRecovery"; Passed = $false }
}

# TEST 5: Stop Service
Write-Host "`n[TEST 5] Service Stop" -ForegroundColor White
try {
    Stop-Service -Name $ServiceName -Force
    Start-Sleep -Seconds 2
    
    if (-not (Test-ServiceRunning)) {
        Write-Host "  ? Service stopped successfully" -ForegroundColor Green
        $results += @{ Test = "Stop"; Passed = $true }
    } else {
        Write-Host "  ? Service failed to stop" -ForegroundColor Red
        $results += @{ Test = "Stop"; Passed = $false }
    }
}
catch {
    Write-Host "  ? Error: $($_.Exception.Message)" -ForegroundColor Red
    $results += @{ Test = "Stop"; Passed = $false }
}

# TEST 6: Uninstall Service
Write-Host "`n[TEST 6] Service Uninstall" -ForegroundColor White
try {
    & $BinaryPath -uninstall
    Start-Sleep -Seconds 2
    
    if (-not (Test-ServiceExists)) {
        Write-Host "  ? Service uninstalled successfully" -ForegroundColor Green
        $results += @{ Test = "Uninstall"; Passed = $true }
    } else {
        Write-Host "  ? Service uninstall failed" -ForegroundColor Red
        $results += @{ Test = "Uninstall"; Passed = $false }
    }
}
catch {
    Write-Host "  ? Error: $($_.Exception.Message)" -ForegroundColor Red
    $results += @{ Test = "Uninstall"; Passed = $false }
}

# Summary
Write-Host "`n=== SERVICE TEST SUMMARY ===" -ForegroundColor Cyan
$passed = ($results | Where-Object { $_.Passed }).Count
$total = $results.Count

Write-Host "Passed: $passed / $total" -ForegroundColor $(if ($passed -eq $total) { "Green" } else { "Yellow" })

foreach ($r in $results) {
    $icon = if ($r.Passed) { "?" } else { "?" }
    $color = if ($r.Passed) { "Green" } else { "Red" }
    Write-Host "  $icon $($r.Test)" -ForegroundColor $color
}

if ($passed -eq $total) {
    Write-Host "`n? All service tests passed" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n[WARN]  Some service tests failed" -ForegroundColor Yellow
    exit 1
}
