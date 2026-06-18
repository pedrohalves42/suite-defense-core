<#
.SYNOPSIS
    CyberShield Windows Agent — reproducible-build bootstrap (Phase 6.6).
.DESCRIPTION
    Validates that the local toolchain (Node, npm, pwsh, dotnet, ps2exe,
    Pester, PSScriptAnalyzer, optional winget packages) matches the pins
    declared in `agents/windows/bootstrap.lock.json`.

    Used by:
      - .github/workflows/agent-windows-pester.yml (gate)
      - .github/workflows/build-agent-exe.yml      (pre-build)
      - Developers (`pwsh agents/windows/bootstrap.ps1 -Verify`)

    Modes:
      -Verify   (default) read lockfile + report drift, exit non-zero on
                violation. Honors `gates.fail_on_*` switches.
      -Report   read + print, never exit non-zero (use locally).
      -List     dump the lockfile resolved to a flat table.

    The bootstrap is intentionally side-effect free: it never installs
    packages. Install steps remain in the CI workflows; the bootstrap
    only fences them. This keeps `bootstrap.ps1` safe to run on dev
    machines without surprising mutations.
#>

[CmdletBinding()]
param(
    [string]$LockfilePath = (Join-Path $PSScriptRoot 'bootstrap.lock.json'),
    [switch]$Verify,
    [switch]$Report,
    [switch]$List
)

$ErrorActionPreference = 'Stop'

# Default mode = Verify
if (-not ($Verify -or $Report -or $List)) { $Verify = $true }

function Read-Lockfile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Bootstrap lockfile not found: $Path"
    }
    try {
        return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        throw "Bootstrap lockfile is not valid JSON ($Path): $($_.Exception.Message)"
    }
}

function ConvertTo-NormalVersion {
    param([string]$Raw)
    if ([string]::IsNullOrWhiteSpace($Raw)) { return $null }
    $m = [regex]::Match($Raw, '\d+(\.\d+){1,3}')
    if (-not $m.Success) { return $null }
    # B6 fix: pad to 4 components so [Version]"7.4.6" compares equal to
    # [Version]"7.4.6.0" (the default Revision=-1 makes them unequal in .NET).
    $parts = $m.Value.Split('.')
    while ($parts.Count -lt 4) { $parts += '0' }
    try { return [Version]($parts -join '.') } catch { return $null }
}

function Get-ToolVersion {
    param([string]$Name)
    try {
        switch ($Name) {
            'node'   { return (& node --version 2>$null) }
            'npm'    { return (& npm --version  2>$null) }
            'pwsh'   { return ($PSVersionTable.PSVersion.ToString()) }
            'dotnet' { return (& dotnet --version 2>$null) }
        }
    } catch { return $null }
    return $null
}

function Get-ModuleVersion {
    param([string]$Name)
    $m = Get-Module -ListAvailable -Name $Name |
         Sort-Object Version -Descending | Select-Object -First 1
    if ($null -eq $m) { return $null }
    return $m.Version.ToString()
}

function Get-WingetVersion {
    param([string]$Id)
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { return $null }
    try {
        $out = & winget list --id $Id --exact --accept-source-agreements 2>$null | Out-String
        $line = ($out -split "`r?`n" | Where-Object { $_ -match [regex]::Escape($Id) } | Select-Object -First 1)
        if (-not $line) { return $null }
        # B7 fix: winget table layout is "Name Id Version Available Source".
        # The previous code returned $cols[1] (the Id) instead of the version.
        # Use the first column that parses as a dotted version number.
        $cols = ($line -split '\s{2,}') | Where-Object { $_ }
        foreach ($c in $cols) {
            if ($c -match '^\d+(\.\d+){1,3}$') { return $c.Trim() }
        }
    } catch { return $null }
    return $null
}


function Test-Pin {
    <#
      Returns @{ Ok=bool; Reason=string }.
      Pin spec: { exact?, min?, max?, optional? }
    #>
    param(
        [Parameter(Mandatory)] $Pin,
        [string]$Observed
    )
    $observedVer = ConvertTo-NormalVersion -Raw $Observed
    if ($null -eq $observedVer) {
        return @{ Ok = $false; Reason = "missing or unparseable ('$Observed')" }
    }
    if ($Pin.PSObject.Properties.Name -contains 'exact' -and $Pin.exact) {
        $exact = ConvertTo-NormalVersion -Raw $Pin.exact
        if ($exact -and $observedVer -ne $exact) {
            return @{ Ok = $false; Reason = "expected exact $($Pin.exact), found $Observed" }
        }
    }
    if ($Pin.PSObject.Properties.Name -contains 'min' -and $Pin.min) {
        $min = ConvertTo-NormalVersion -Raw $Pin.min
        if ($min -and $observedVer -lt $min) {
            return @{ Ok = $false; Reason = "below min $($Pin.min), found $Observed" }
        }
    }
    if ($Pin.PSObject.Properties.Name -contains 'max' -and $Pin.max) {
        $max = ConvertTo-NormalVersion -Raw $Pin.max
        if ($max -and $observedVer -ge $max) {
            return @{ Ok = $false; Reason = "at/above max $($Pin.max), found $Observed" }
        }
    }
    return @{ Ok = $true; Reason = "ok ($Observed)" }
}

function Invoke-Check {
    param([string]$Category, [string]$Name, $Pin, [string]$Observed)
    $res = Test-Pin -Pin $Pin -Observed $Observed
    $optional = ($Pin.PSObject.Properties.Name -contains 'optional') -and $Pin.optional
    [pscustomobject]@{
        Category = $Category
        Name     = $Name
        Pin      = ($Pin | ConvertTo-Json -Compress)
        Observed = $Observed
        Optional = [bool]$optional
        Ok       = $res.Ok
        Reason   = $res.Reason
    }
}

# ---------- main ----------
$lock = Read-Lockfile -Path $LockfilePath

if ($List) {
    $lock | ConvertTo-Json -Depth 6
    return
}

$results = New-Object System.Collections.Generic.List[object]

foreach ($prop in $lock.tools.PSObject.Properties) {
    $results.Add( (Invoke-Check 'tool' $prop.Name $prop.Value (Get-ToolVersion $prop.Name)) )
}
foreach ($prop in $lock.powershell_modules.PSObject.Properties) {
    $results.Add( (Invoke-Check 'psmodule' $prop.Name $prop.Value (Get-ModuleVersion $prop.Name)) )
}
if ($lock.PSObject.Properties.Name -contains 'winget_packages') {
    foreach ($prop in $lock.winget_packages.PSObject.Properties) {
        $results.Add( (Invoke-Check 'winget' $prop.Name $prop.Value (Get-WingetVersion $prop.Name)) )
    }
}

# npm lockfile presence (reproducibility for the Node toolchain)
if ($lock.PSObject.Properties.Name -contains 'npm_lockfile' -and $lock.npm_lockfile) {
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    $lockPath = Join-Path $repoRoot $lock.npm_lockfile
    $exists = Test-Path -LiteralPath $lockPath
    $results.Add([pscustomobject]@{
        Category = 'lockfile'; Name = $lock.npm_lockfile
        Pin = 'must exist'; Observed = if ($exists) { 'present' } else { 'missing' }
        Optional = $false; Ok = $exists
        Reason = if ($exists) { 'ok' } else { "npm lockfile not found at $lockPath" }
    })
}

$results | Sort-Object Category, Name | Format-Table Category, Name, Observed, Ok, Reason -AutoSize

# Gating
$gates = $lock.gates
$failOnMissing = $true; $failOnDrift = $true; $wingetStrict = $false
if ($gates) {
    if ($gates.PSObject.Properties.Name -contains 'fail_on_missing_tool')  { $failOnMissing = [bool]$gates.fail_on_missing_tool }
    if ($gates.PSObject.Properties.Name -contains 'fail_on_version_drift') { $failOnDrift   = [bool]$gates.fail_on_version_drift }
    if ($gates.PSObject.Properties.Name -contains 'winget_strict')         { $wingetStrict  = [bool]$gates.winget_strict }
}

$violations = $results | Where-Object { -not $_.Ok } | ForEach-Object {
    $v = $_
    $isMissing = $v.Observed -in @($null, '', 'missing')
    $isWinget  = $v.Category -eq 'winget'
    $skip = $false
    if ($v.Optional -and -not ($isWinget -and $wingetStrict)) { $skip = $true }
    if ($isMissing -and -not $failOnMissing) { $skip = $true }
    if (-not $isMissing -and -not $failOnDrift) { $skip = $true }
    if (-not $skip) { $v }
}

if ($Report) {
    if ($violations) { Write-Host "Bootstrap report: $($violations.Count) violation(s) (non-fatal in -Report mode)." -ForegroundColor Yellow }
    else             { Write-Host "Bootstrap report: all pins satisfied." -ForegroundColor Green }
    return
}

if ($violations) {
    Write-Host ""
    Write-Host "Bootstrap verification FAILED ($($violations.Count) violation(s)):" -ForegroundColor Red
    $violations | Format-Table Category, Name, Reason -AutoSize
    exit 1
}

Write-Host "Bootstrap verification OK — all pinned tool/module versions match $LockfilePath." -ForegroundColor Green
