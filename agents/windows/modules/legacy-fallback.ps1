<#
.SYNOPSIS
    Phase 5 governance for the CYBERSHIELD_LEGACY_FALLBACK emergency flag.

.DESCRIPTION
    The flag exists ONLY for emergency rollback after the hexagonal
    container fails to wire. Operators MUST file an incident and remove
    it within 24h. This module enforces that contract:

      1. Records first-activation timestamp in a sentinel file under
         %ProgramData%\CyberShield\data\legacy_fallback.sentinel.
      2. Emits a high-severity telemetry event every time the flag is
         honored (auto_repair / legacy_fallback_used).
      3. Refuses to honor the flag after 24h since first activation,
         forcing the operator to re-enable it explicitly (delete the
         sentinel) and acknowledging the breach of the SLA.

    Removed together with CompatShims.ps1 in ADR-003 / Phase 6.
#>

$script:LegacyFallbackMaxAgeHours = 24
$script:LegacyFallbackTelemetryEvent = 'legacy_fallback_used'

function Get-LegacyFallbackSentinelPath {
    $dir = if ($script:DataDir) { $script:DataDir } else { "$env:ProgramData\CyberShield\data" }
    if (-not (Test-Path $dir)) {
        try { New-Item -ItemType Directory -Path $dir -Force | Out-Null } catch { }
    }
    return (Join-Path $dir 'legacy_fallback.sentinel')
}

function Test-LegacyFallbackAllowed {
    <#
    Returns $true if $env:CYBERSHIELD_LEGACY_FALLBACK = '1' AND the
    24h SLA has not been exceeded. Emits telemetry + log on every
    honored call, and a critical log when refused.
    Call site: $caller (short tag e.g. 'POLL-JOBS', 'SUBMIT', 'HEARTBEAT').
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [string]$Caller
    )

    if ($env:CYBERSHIELD_LEGACY_FALLBACK -ne '1') { return $false }

    $sentinel = Get-LegacyFallbackSentinelPath
    $now = [DateTime]::UtcNow
    $firstActivation = $now

    if (Test-Path $sentinel) {
        try {
            $raw = (Get-Content $sentinel -Raw -Encoding UTF8).Trim()
            $firstActivation = [DateTime]::Parse($raw, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal)
        } catch {
            $firstActivation = $now
        }
    } else {
        try { $now.ToString('o') | Out-File -FilePath $sentinel -Encoding UTF8 -Force -NoNewline } catch { }
    }

    $ageHours = ($now - $firstActivation).TotalHours
    if ($ageHours -gt $script:LegacyFallbackMaxAgeHours) {
        if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
            Write-Log "[$Caller] LEGACY FALLBACK REFUSED: sentinel age $([math]::Round($ageHours,1))h exceeds $($script:LegacyFallbackMaxAgeHours)h SLA. Delete '$sentinel' to re-arm or restore the hexagonal container." "ERROR"
        }
        return $false
    }

    if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
        Write-Log "[$Caller] LEGACY FALLBACK HONORED (age $([math]::Round($ageHours,1))h / SLA $($script:LegacyFallbackMaxAgeHours)h)" "WARN"
    }

    # Best-effort telemetry — never let it block the legacy path itself.
    try {
        if (Get-Command Send-AutoRepairTelemetry -ErrorAction SilentlyContinue) {
            Send-AutoRepairTelemetry -Event $script:LegacyFallbackTelemetryEvent -Data @{
                caller            = $Caller
                sentinel_age_hours = [math]::Round($ageHours, 2)
                sla_hours         = $script:LegacyFallbackMaxAgeHours
                first_activation  = $firstActivation.ToString('o')
            }
        }
    } catch { }

    return $true
}
