# Validation script for Windows installer content
# Verifies that {{AGENT_SCRIPT_CONTENT}} placeholder is correctly replaced

param(
    [Parameter(Mandatory=$true)]
    [string]$InstallerPath
)

Write-Host "`n=== CyberShield Installer Content Validation ===" -ForegroundColor Cyan
Write-Host "Testing: $InstallerPath`n" -ForegroundColor White

# Initialize results
$validationResults = @{
    'File Exists' = $false
    'No Placeholders' = $false
    'Agent Code Present' = $false
    'Valid PowerShell Syntax' = $false
    'Adequate Size' = $false
    'Required Functions Present' = $false
}

# Test 1: File exists
Write-Host "[1/6] Checking file existence..." -ForegroundColor Yellow
if (Test-Path $InstallerPath) {
    $validationResults['File Exists'] = $true
    Write-Host "✓ File found" -ForegroundColor Green
} else {
    Write-Host "✗ File not found: $InstallerPath" -ForegroundColor Red
    exit 1
}

# Read file content
$content = Get-Content $InstallerPath -Raw

# Test 2: Check for unreplaced placeholders
Write-Host "`n[2/6] Checking for unreplaced placeholders..." -ForegroundColor Yellow
$placeholders = @(
    '{{AGENT_SCRIPT_CONTENT}}',
    '{{AGENT_TOKEN}}',
    '{{HMAC_SECRET}}',
    '{{SERVER_URL}}',
    '{{AGENT_NAME}}'
)

$foundPlaceholders = @()
foreach ($placeholder in $placeholders) {
    if ($content -match [regex]::Escape($placeholder)) {
        $foundPlaceholders += $placeholder
    }
}

if ($foundPlaceholders.Count -eq 0) {
    $validationResults['No Placeholders'] = $true
    Write-Host "✓ No unreplaced placeholders found" -ForegroundColor Green
} else {
    Write-Host "✗ Found unreplaced placeholders:" -ForegroundColor Red
    $foundPlaceholders | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

# Test 3: Check for agent code presence (key functions from cybershield-agent-windows.ps1)
Write-Host "`n[3/6] Checking for agent code presence..." -ForegroundColor Yellow
$agentCodeMarkers = @(
    'Write-Log',
    'Send-Heartbeat',
    'Get-SystemMetrics',
    'Poll-Jobs',
    'function Send-HMACRequest'
)

$foundMarkers = 0
$missingMarkers = @()
foreach ($marker in $agentCodeMarkers) {
    if ($content -match [regex]::Escape($marker)) {
        $foundMarkers++
    } else {
        $missingMarkers += $marker
    }
}

if ($foundMarkers -eq $agentCodeMarkers.Count) {
    $validationResults['Agent Code Present'] = $true
    Write-Host "✓ All $foundMarkers agent code markers found" -ForegroundColor Green
} else {
    Write-Host "✗ Missing $($agentCodeMarkers.Count - $foundMarkers) agent code markers:" -ForegroundColor Red
    $missingMarkers | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

# Test 4: Check required functions are present
Write-Host "`n[4/6] Checking for required functions..." -ForegroundColor Yellow
$requiredFunctions = @(
    'function Write-Log',
    'function Send-Heartbeat',
    'function Get-SystemMetrics',
    'function Poll-Jobs',
    'function Send-HMACRequest'
)

$foundFunctions = 0
$missingFunctions = @()
foreach ($func in $requiredFunctions) {
    if ($content -match [regex]::Escape($func)) {
        $foundFunctions++
    } else {
        $missingFunctions += $func
    }
}

if ($foundFunctions -eq $requiredFunctions.Count) {
    $validationResults['Required Functions Present'] = $true
    Write-Host "✓ All $foundFunctions required functions found" -ForegroundColor Green
} else {
    Write-Host "✗ Missing $($requiredFunctions.Count - $foundFunctions) functions:" -ForegroundColor Red
    $missingFunctions | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

# Test 5: Validate PowerShell syntax
Write-Host "`n[5/6] Validating PowerShell syntax..." -ForegroundColor Yellow
try {
    $null = [System.Management.Automation.PSParser]::Tokenize($content, [ref]$null)
    $validationResults['Valid PowerShell Syntax'] = $true
    Write-Host "✓ PowerShell syntax is valid" -ForegroundColor Green
} catch {
    Write-Host "✗ Invalid PowerShell syntax: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Check file size
Write-Host "`n[6/6] Checking file size..." -ForegroundColor Yellow
$fileSize = (Get-Item $InstallerPath).Length
$fileSizeKB = [math]::Round($fileSize / 1KB, 2)

if ($fileSize -gt 50KB) {
    $validationResults['Adequate Size'] = $true
    Write-Host "✓ File size: $fileSizeKB KB (adequate)" -ForegroundColor Green
} else {
    Write-Host "✗ File size: $fileSizeKB KB (too small, expected > 50 KB)" -ForegroundColor Red
}

# Summary
Write-Host "`n=== Validation Summary ===" -ForegroundColor Cyan
$passedTests = ($validationResults.Values | Where-Object { $_ -eq $true }).Count
$totalTests = $validationResults.Count
$successRate = [math]::Round(($passedTests / $totalTests) * 100, 0)

foreach ($test in $validationResults.GetEnumerator() | Sort-Object Name) {
    $status = if ($test.Value) { "✓ PASS" } else { "✗ FAIL" }
    $color = if ($test.Value) { "Green" } else { "Red" }
    Write-Host "$status - $($test.Key)" -ForegroundColor $color
}

Write-Host "`nResult: $passedTests/$totalTests tests passed ($successRate%)" -ForegroundColor $(if ($successRate -eq 100) { "Green" } else { "Yellow" })

# Additional statistics
Write-Host "`n=== File Statistics ===" -ForegroundColor Cyan
Write-Host "File size: $fileSizeKB KB" -ForegroundColor White
Write-Host "Total lines: $((Get-Content $InstallerPath).Count)" -ForegroundColor White
Write-Host "Total characters: $($content.Length)" -ForegroundColor White

# Exit code
if ($successRate -eq 100) {
    Write-Host "`n✓ Validation PASSED - Installer is ready for use!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n✗ Validation FAILED - Please review errors above" -ForegroundColor Red
    exit 1
}
