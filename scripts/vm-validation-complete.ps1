<#
.SYNOPSIS
    Complete validation script for CyberShield installer on VM

.DESCRIPTION
    This script performs comprehensive pre-installation and post-installation
    validation of the CyberShield agent installer, specifically checking for
    ASCII-only content, PowerShell 5.1 compatibility, and proper installation.

.PARAMETER InstallerPath
    Path to the downloaded installer .ps1 file

.EXAMPLE
    .\vm-validation-complete.ps1 -InstallerPath "C:\Users\Public\Downloads\cybershield-installer-TEST-ASCII-VALIDATION-FINAL.ps1"

.NOTES
    Version: 1.0.0
    Author: CyberShield Team
    Last Updated: 2025-01-20
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({Test-Path $_})]
    [string]$InstallerPath
)

$ErrorActionPreference = "Continue"
$global:ValidationPassed = $true
$global:Warnings = @()
$global:Errors = @()

function Write-ValidationResult {
    param(
        [string]$Test,
        [string]$Status,
        [string]$Message
    )
    
    $color = switch ($Status) {
        "PASS" { "Green" }
        "FAIL" { "Red" }
        "WARN" { "Yellow" }
        default { "White" }
    }
    
    $icon = switch ($Status) {
        "PASS" { "[OK]" }
        "FAIL" { "[ERROR]" }
        "WARN" { "[WARN]" }
        default { "[INFO]" }
    }
    
    Write-Host "$icon $Test`: $Message" -ForegroundColor $color
    
    if ($Status -eq "FAIL") {
        $global:ValidationPassed = $false
        $global:Errors += "$Test: $Message"
    } elseif ($Status -eq "WARN") {
        $global:Warnings += "$Test: $Message"
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CyberShield Installer Validation Suite" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Target: $InstallerPath" -ForegroundColor Yellow
Write-Host ""

# =============================================
# PHASE 1: PRE-INSTALLATION VALIDATION
# =============================================

Write-Host "=== PHASE 1: PRE-INSTALLATION VALIDATION ===" -ForegroundColor Cyan
Write-Host ""

# Test 1.1: File exists and is readable
Write-Host "Test 1.1: File Existence and Size" -ForegroundColor DarkCyan
if (Test-Path $InstallerPath) {
    $fileInfo = Get-Item $InstallerPath
    $fileSizeKB = [math]::Round($fileInfo.Length / 1KB, 2)
    
    if ($fileInfo.Length -gt 10KB) {
        Write-ValidationResult "File Size" "PASS" "$fileSizeKB KB (minimum 10 KB required)"
    } else {
        Write-ValidationResult "File Size" "FAIL" "$fileSizeKB KB (too small, expected > 10 KB)"
    }
} else {
    Write-ValidationResult "File Existence" "FAIL" "File not found at $InstallerPath"
    exit 1
}

# Test 1.2: ASCII-only content
Write-Host ""
Write-Host "Test 1.2: ASCII-Only Content" -ForegroundColor DarkCyan
$script = Get-Content $InstallerPath -Raw -Encoding UTF8

if ($script -match '[^\x00-\x7F]') {
    $nonAsciiChars = @()
    $lines = $script -split "`r?`n"
    
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        for ($j = 0; $j -lt $line.Length; $j++) {
            $char = $line[$j]
            $codePoint = [int][char]$char
            if ($codePoint -gt 127) {
                $nonAsciiChars += @{
                    Line = $i + 1
                    Column = $j + 1
                    Char = $char
                    Code = "U+$($codePoint.ToString('X4'))"
                }
            }
        }
    }
    
    Write-ValidationResult "ASCII Check" "FAIL" "Found $($nonAsciiChars.Count) non-ASCII characters"
    foreach ($char in ($nonAsciiChars | Select-Object -First 5)) {
        Write-Host "    Line $($char.Line), Col $($char.Column): '$($char.Char)' ($($char.Code))" -ForegroundColor Red
    }
    if ($nonAsciiChars.Count -gt 5) {
        Write-Host "    ... and $($nonAsciiChars.Count - 5) more" -ForegroundColor Red
    }
} else {
    Write-ValidationResult "ASCII Check" "PASS" "All characters are in ASCII range (0-127)"
}

# Test 1.3: Emoji detection (high Unicode range)
Write-Host ""
Write-Host "Test 1.3: Emoji Detection" -ForegroundColor DarkCyan
if ($script -match '[\uD800-\uDFFF]') {
    Write-ValidationResult "Emoji Check" "FAIL" "Emoji characters detected (surrogate pairs)"
} else {
    Write-ValidationResult "Emoji Check" "PASS" "No emoji detected"
}

# Test 1.4: PowerShell 5.1 syntax validation
Write-Host ""
Write-Host "Test 1.4: PowerShell 5.1 Syntax Validation" -ForegroundColor DarkCyan
$errors = $null
try {
    [System.Management.Automation.PSParser]::Tokenize($script, [ref]$errors) | Out-Null
    
    if ($errors -and $errors.Count -gt 0) {
        Write-ValidationResult "PS Syntax" "FAIL" "Found $($errors.Count) syntax error(s)"
        foreach ($err in ($errors | Select-Object -First 3)) {
            Write-Host "    Line $($err.Token.StartLine): $($err.Message)" -ForegroundColor Red
        }
    } else {
        Write-ValidationResult "PS Syntax" "PASS" "PowerShell 5.1 syntax is valid"
    }
} catch {
    Write-ValidationResult "PS Syntax" "FAIL" "Parser exception: $($_.Exception.Message)"
}

# Test 1.5: Check for critical placeholders (should NOT exist)
Write-Host ""
Write-Host "Test 1.5: Placeholder Replacement Check" -ForegroundColor DarkCyan
$placeholders = @("{{SERVER_URL}}", "{{AGENT_TOKEN}}", "{{HMAC_SECRET}}", "{{AGENT_NAME}}", "{{AGENT_SCRIPT_CONTENT}}")
$foundPlaceholders = @()

foreach ($placeholder in $placeholders) {
    if ($script -match [regex]::Escape($placeholder)) {
        $foundPlaceholders += $placeholder
    }
}

if ($foundPlaceholders.Count -gt 0) {
    Write-ValidationResult "Placeholders" "FAIL" "Found unreplaced placeholders: $($foundPlaceholders -join ', ')"
} else {
    Write-ValidationResult "Placeholders" "PASS" "All placeholders replaced correctly"
}

# Test 1.6: Check for critical functions in embedded agent script
Write-Host ""
Write-Host "Test 1.6: Critical Agent Functions" -ForegroundColor DarkCyan
$criticalFunctions = @("Submit-JobResult", "Send-Heartbeat", "Poll-Jobs", "Get-HmacSignature")
$missingFunctions = @()

foreach ($func in $criticalFunctions) {
    if ($script -notmatch "function\s+$func\b") {
        $missingFunctions += $func
    }
}

if ($missingFunctions.Count -gt 0) {
    Write-ValidationResult "Agent Functions" "FAIL" "Missing functions: $($missingFunctions -join ', ')"
} else {
    Write-ValidationResult "Agent Functions" "PASS" "All critical functions present"
}

# Test 1.7: Check for StartedAt parameter (Jobs v3 compatibility)
Write-Host ""
Write-Host "Test 1.7: Jobs v3 Compatibility (StartedAt)" -ForegroundColor DarkCyan
if ($script -match '\$StartedAt') {
    Write-ValidationResult "Jobs v3" "PASS" "StartedAt parameter found (Jobs v3 compatible)"
} else {
    Write-ValidationResult "Jobs v3" "WARN" "StartedAt parameter not found (may not support Jobs v3)"
}

# Test 1.8: Encoding detection
Write-Host ""
Write-Host "Test 1.8: File Encoding Detection" -ForegroundColor DarkCyan
$bytes = [System.IO.File]::ReadAllBytes($InstallerPath)

if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
    Write-ValidationResult "Encoding" "FAIL" "UTF-16 LE (will cause execution failures)"
} elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
    Write-ValidationResult "Encoding" "FAIL" "UTF-16 BE (will cause execution failures)"
} elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Write-ValidationResult "Encoding" "WARN" "UTF-8 with BOM (acceptable but not ideal)"
} else {
    Write-ValidationResult "Encoding" "PASS" "UTF-8 without BOM (ideal)"
}

Write-Host ""
Write-Host "=== PRE-INSTALLATION VALIDATION SUMMARY ===" -ForegroundColor Cyan

if ($global:ValidationPassed) {
    Write-Host "[OK] All critical pre-installation tests passed" -ForegroundColor Green
    Write-Host "    Ready to proceed with installation" -ForegroundColor Green
    
    if ($global:Warnings.Count -gt 0) {
        Write-Host ""
        Write-Host "Warnings ($($global:Warnings.Count)):" -ForegroundColor Yellow
        foreach ($warning in $global:Warnings) {
            Write-Host "  - $warning" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "[FAIL] Pre-installation validation failed" -ForegroundColor Red
    Write-Host "    DO NOT proceed with installation until errors are fixed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Errors ($($global:Errors.Count)):" -ForegroundColor Red
    foreach ($error in $global:Errors) {
        Write-Host "  - $error" -ForegroundColor Red
    }
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Press Enter to proceed with installation, or Ctrl+C to abort" -ForegroundColor Yellow
Read-Host

# =============================================
# PHASE 2: INSTALLATION
# =============================================

Write-Host ""
Write-Host "=== PHASE 2: INSTALLATION ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "Executing installer..." -ForegroundColor Yellow
try {
    & $InstallerPath
    Write-Host "[OK] Installer execution completed" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Installer execution failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Waiting 10 seconds for agent initialization..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# =============================================
# PHASE 3: POST-INSTALLATION VALIDATION
# =============================================

Write-Host ""
Write-Host "=== PHASE 3: POST-INSTALLATION VALIDATION ===" -ForegroundColor Cyan
Write-Host ""

$global:ValidationPassed = $true
$global:Errors = @()

# Test 3.1: Folder structure
Write-Host "Test 3.1: Folder Structure" -ForegroundColor DarkCyan
if (Test-Path "C:\CyberShield") {
    Write-ValidationResult "CyberShield Folder" "PASS" "C:\CyberShield exists"
} else {
    Write-ValidationResult "CyberShield Folder" "FAIL" "C:\CyberShield does not exist"
}

if (Test-Path "C:\CyberShield\logs") {
    Write-ValidationResult "Logs Folder" "PASS" "C:\CyberShield\logs exists"
} else {
    Write-ValidationResult "Logs Folder" "FAIL" "C:\CyberShield\logs does not exist"
}

# Test 3.2: Agent script file
Write-Host ""
Write-Host "Test 3.2: Agent Script File" -ForegroundColor DarkCyan
$agentScriptPattern = "C:\CyberShield\cybershield-agent-*.ps1"
$agentScripts = Get-ChildItem -Path "C:\CyberShield" -Filter "cybershield-agent-*.ps1" -ErrorAction SilentlyContinue

if ($agentScripts -and $agentScripts.Count -gt 0) {
    $agentScript = $agentScripts[0]
    $agentSizeKB = [math]::Round($agentScript.Length / 1KB, 2)
    
    Write-ValidationResult "Agent Script" "PASS" "Found: $($agentScript.Name) ($agentSizeKB KB)"
    
    if ($agentScript.Length -lt 10KB) {
        Write-ValidationResult "Agent Size" "FAIL" "Agent script too small ($agentSizeKB KB, expected > 10 KB)"
    } else {
        Write-ValidationResult "Agent Size" "PASS" "Agent script size is adequate ($agentSizeKB KB)"
    }
} else {
    Write-ValidationResult "Agent Script" "FAIL" "No agent script found in C:\CyberShield"
}

# Test 3.3: Scheduled Task
Write-Host ""
Write-Host "Test 3.3: Scheduled Task" -ForegroundColor DarkCyan
$taskNamePattern = "CyberShieldAgent-*"
$tasks = Get-ScheduledTask -TaskName $taskNamePattern -ErrorAction SilentlyContinue

if ($tasks) {
    $task = $tasks[0]
    Write-ValidationResult "Task Existence" "PASS" "Found: $($task.TaskName)"
    
    Write-Host "    Task State: $($task.State)" -ForegroundColor Gray
    Write-Host "    Last Run Time: $($task.LastRunTime)" -ForegroundColor Gray
    Write-Host "    Last Task Result: $($task.LastTaskResult)" -ForegroundColor Gray
    
    if ($task.State -eq "Running" -or $task.State -eq "Ready") {
        Write-ValidationResult "Task State" "PASS" "Task is $($task.State)"
    } else {
        Write-ValidationResult "Task State" "WARN" "Task is $($task.State) (expected Running or Ready)"
    }
    
    if ($task.LastTaskResult -eq 0) {
        Write-ValidationResult "Task Result" "PASS" "LastTaskResult = 0 (success)"
    } else {
        Write-ValidationResult "Task Result" "FAIL" "LastTaskResult = $($task.LastTaskResult) (indicates error)"
    }
} else {
    Write-ValidationResult "Scheduled Task" "FAIL" "No CyberShield scheduled task found"
}

# Test 3.4: Log files
Write-Host ""
Write-Host "Test 3.4: Log Files" -ForegroundColor DarkCyan

if (Test-Path "C:\CyberShield\logs\installer.log") {
    $installerLogSize = (Get-Item "C:\CyberShield\logs\installer.log").Length
    Write-ValidationResult "Installer Log" "PASS" "installer.log exists ($installerLogSize bytes)"
    
    Write-Host ""
    Write-Host "Last 10 lines of installer.log:" -ForegroundColor Gray
    Get-Content "C:\CyberShield\logs\installer.log" -Tail 10 | ForEach-Object {
        Write-Host "    $_" -ForegroundColor DarkGray
    }
} else {
    Write-ValidationResult "Installer Log" "WARN" "installer.log not found"
}

Write-Host ""
if (Test-Path "C:\CyberShield\logs\cybershield-agent-v3.log") {
    $agentLogSize = (Get-Item "C:\CyberShield\logs\cybershield-agent-v3.log").Length
    Write-ValidationResult "Agent Log" "PASS" "cybershield-agent-v3.log exists ($agentLogSize bytes)"
    
    Write-Host ""
    Write-Host "Last 10 lines of cybershield-agent-v3.log:" -ForegroundColor Gray
    Get-Content "C:\CyberShield\logs\cybershield-agent-v3.log" -Tail 10 | ForEach-Object {
        Write-Host "    $_" -ForegroundColor DarkGray
    }
    
    # Check for heartbeat in logs
    $logContent = Get-Content "C:\CyberShield\logs\cybershield-agent-v3.log" -Raw
    if ($logContent -match "heartbeat") {
        Write-ValidationResult "Heartbeat" "PASS" "Heartbeat activity detected in logs"
    } else {
        Write-ValidationResult "Heartbeat" "WARN" "No heartbeat activity found in logs yet"
    }
} else {
    Write-ValidationResult "Agent Log" "FAIL" "cybershield-agent-v3.log not found (agent may not have started)"
}

# =============================================
# FINAL SUMMARY
# =============================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "VALIDATION COMPLETE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($global:ValidationPassed -and $global:Errors.Count -eq 0) {
    Write-Host "[SUCCESS] All validation tests passed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Check agent status in dashboard (should be 'Active' with recent heartbeat)" -ForegroundColor Yellow
    Write-Host "2. Create a test job to validate Jobs v3 functionality" -ForegroundColor Yellow
    Write-Host "3. Monitor agent logs for any errors: C:\CyberShield\logs\cybershield-agent-v3.log" -ForegroundColor Yellow
    Write-Host ""
    exit 0
} else {
    Write-Host "[FAILURE] Validation completed with errors" -ForegroundColor Red
    Write-Host ""
    Write-Host "Errors found:" -ForegroundColor Red
    foreach ($error in $global:Errors) {
        Write-Host "  - $error" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Troubleshooting steps:" -ForegroundColor Yellow
    Write-Host "1. Check Task Scheduler for detailed error messages" -ForegroundColor Yellow
    Write-Host "2. Review C:\CyberShield\logs\installer.log for installation issues" -ForegroundColor Yellow
    Write-Host "3. Check Windows Event Viewer (Application log) for PowerShell errors" -ForegroundColor Yellow
    Write-Host "4. Verify network connectivity to backend" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
