<#
.SYNOPSIS
    Use case: self-heal integrity check (BOM-safe SHA-256).
.DESCRIPTION
    Reads the script file, computes hash, compares against cached
    expected hash. On mismatch — if matches Container.State.BootScriptHash,
    refreshes cache; else returns IntegrityViolation=$true so the
    watchdog can trigger Invoke-AgentRecovery (still in legacy module).
#>

function Get-BomSafeSha256 {
    param([Parameter(Mandatory)][string]$Path)
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $bytes = $bytes[3..($bytes.Length - 1)]
    }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try   { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLower() }
    finally { $sha.Dispose() }
}

function Invoke-PerformSelfHealUseCase {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Container,
        [Parameter(Mandatory)][string]$ScriptPath,
        [string]$CachePath = $null
    )

    $state = $Container.State
    $log   = $Container.Logger
    $fs    = $Container.Fs

    if (-not $CachePath) {
        $CachePath = Join-Path $Container.Config.DataDir 'expected_script_hash.json'
    }

    if ($state.UpdateInProgress) {
        return @{ IntegrityOk=$true; Skipped=$true; Reason='update-in-progress' }
    }

    if (-not (Test-Path $ScriptPath)) {
        if ($log) { $log.Error('[UC:SelfHeal] script missing', @{ path=$ScriptPath }) }
        return @{ IntegrityOk=$false; IntegrityViolation=$true; Reason='missing' }
    }

    $actual = Get-BomSafeSha256 -Path $ScriptPath
    $expected = $null
    if (Test-Path $CachePath) {
        try { $expected = (Get-Content $CachePath -Raw | ConvertFrom-Json).hash } catch { $expected = $null }
    }

    if (-not $expected) {
        # Initial baseline
        $fs.WriteText($CachePath, (@{ hash=$actual; updated=$Container.Clock.IsoNow() } | ConvertTo-Json))
        $state.BootScriptHash = $actual
        return @{ IntegrityOk=$true; Initialized=$true; Hash=$actual }
    }

    if ($actual -eq $expected) {
        return @{ IntegrityOk=$true; Hash=$actual }
    }

    if ($state.BootScriptHash -and $actual -eq $state.BootScriptHash) {
        if ($log) { $log.Warn('[UC:SelfHeal] hash differs but matches boot — self-healing cache') }
        $fs.WriteText($CachePath, (@{ hash=$actual; updated=$Container.Clock.IsoNow() } | ConvertTo-Json))
        return @{ IntegrityOk=$true; Healed=$true; Hash=$actual }
    }

    if ($log) { $log.Error('[UC:SelfHeal] integrity violation', @{ expected=$expected; actual=$actual }) }
    return @{ IntegrityOk=$false; IntegrityViolation=$true; Expected=$expected; Actual=$actual }
}
