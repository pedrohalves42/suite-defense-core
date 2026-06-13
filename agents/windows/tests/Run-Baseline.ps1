<#
.SYNOPSIS
    Phase 0 baseline: capture current Pester + PSScriptAnalyzer results
    BEFORE any hexagonal refactor begins. Subsequent phases must not
    regress these numbers.

.USAGE
    pwsh -File agents/windows/tests/Run-Baseline.ps1
    # Outputs:
    #   tests/baseline-results.json  — Pester results (Passed/Failed/Skipped)
    #   tests/baseline-lint.json     — PSScriptAnalyzer findings inventory
    #   tests/baseline-globals.txt   — `$Global:` references per module
#>

[CmdletBinding()]
param(
    [string]$ModulesPath = "$PSScriptRoot\..\modules",
    [string]$TestsPath   = "$PSScriptRoot",
    [string]$OutDir      = "$PSScriptRoot"
)

$ErrorActionPreference = 'Stop'

# --- 1. Pester baseline -------------------------------------------------
Write-Output "[BASELINE] Running Pester suite..."
if (-not (Get-Module -ListAvailable -Name Pester)) {
    Install-Module Pester -Force -SkipPublisherCheck -Scope CurrentUser
}
Import-Module Pester -MinimumVersion 5.0.0

$pesterConfig = New-PesterConfiguration
$pesterConfig.Run.Path = $TestsPath
$pesterConfig.Run.PassThru = $true
$pesterConfig.Output.Verbosity = 'Detailed'
$pesterConfig.TestResult.Enabled = $true
$pesterConfig.TestResult.OutputPath = "$OutDir\baseline-pester.xml"

$result = Invoke-Pester -Configuration $pesterConfig

@{
    TotalCount   = $result.TotalCount
    PassedCount  = $result.PassedCount
    FailedCount  = $result.FailedCount
    SkippedCount = $result.SkippedCount
    Duration     = $result.Duration.TotalSeconds
    CapturedAt   = (Get-Date).ToString('o')
} | ConvertTo-Json | Out-File "$OutDir\baseline-results.json" -Encoding UTF8

# --- 2. PSScriptAnalyzer inventory --------------------------------------
Write-Output "[BASELINE] Running PSScriptAnalyzer inventory..."
if (-not (Get-Module -ListAvailable -Name PSScriptAnalyzer)) {
    Install-Module PSScriptAnalyzer -Force -Scope CurrentUser
}
Import-Module PSScriptAnalyzer

$settingsPath = "$PSScriptRoot\..\PSScriptAnalyzerSettings.psd1"
$findings = Invoke-ScriptAnalyzer -Path $ModulesPath -Recurse -Settings $settingsPath

$findings | Select-Object RuleName, Severity, ScriptName, Line, Message |
    ConvertTo-Json -Depth 4 | Out-File "$OutDir\baseline-lint.json" -Encoding UTF8

$summary = $findings | Group-Object RuleName | Select-Object Name, Count | Sort-Object Count -Descending
Write-Output "[BASELINE] Lint findings by rule:"
$summary | Format-Table | Out-String | Write-Output

# --- 3. $Global: inventory ----------------------------------------------
Write-Output "[BASELINE] Counting `$Global:` references..."
$globals = Get-ChildItem $ModulesPath -Filter *.ps1 | ForEach-Object {
    $count = (Select-String -Path $_.FullName -Pattern '\$Global:' -AllMatches).Matches.Count
    "{0,-25} {1}" -f $_.Name, $count
}
$globals | Out-File "$OutDir\baseline-globals.txt" -Encoding UTF8

Write-Output ""
Write-Output "[BASELINE] Done. Artifacts:"
Write-Output "  - $OutDir\baseline-results.json   (Pester totals)"
Write-Output "  - $OutDir\baseline-pester.xml      (JUnit-style detail)"
Write-Output "  - $OutDir\baseline-lint.json       (PSScriptAnalyzer findings)"
Write-Output "  - $OutDir\baseline-globals.txt     (per-module `$Global: count)"

if ($result.FailedCount -gt 0) {
    Write-Warning "Pester has $($result.FailedCount) failing test(s) BEFORE refactor."
    Write-Warning "These must be fixed or quarantined before Phase 1 begins."
    exit 1
}
exit 0
