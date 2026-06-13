<#
.SYNOPSIS
    IClock adapter — production wall-clock implementation.
.DESCRIPTION
    Phase 2 (ADR-002). Replaces the lazy default in Container.ps1.
    Tests inject a TestDouble that returns deterministic timestamps.
#>

function New-ClockAdapter {
    $obj = [PSCustomObject]@{ Kind = 'SystemClock' }
    $obj | Add-Member -MemberType ScriptMethod -Name UtcNow      -Value { [DateTime]::UtcNow }
    $obj | Add-Member -MemberType ScriptMethod -Name UnixSeconds -Value { [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }
    $obj | Add-Member -MemberType ScriptMethod -Name IsoNow      -Value { [DateTime]::UtcNow.ToString('o') }
    $obj | Add-Member -MemberType ScriptMethod -Name MonotonicMs -Value { [System.Diagnostics.Stopwatch]::GetTimestamp() * 1000 / [System.Diagnostics.Stopwatch]::Frequency }
    return $obj
}
