<#
.SYNOPSIS
    Phase 5 closure — governance for the CYBERSHIELD_LEGACY_FALLBACK
    emergency rollback flag.
#>

Describe 'Legacy fallback governor' {
    BeforeAll {
        . "$PSScriptRoot\..\modules\legacy-fallback.ps1"
        # Stub Write-Log + Send-AutoRepairTelemetry — capture invocations.
        $script:Logs = @()
        $script:Tele = @()
        function Write-Log { param($m,$l) $script:Logs += "[$l] $m" }
        function Send-AutoRepairTelemetry { param($Event,$Data) $script:Tele += @{ e=$Event; d=$Data } }
        $script:DataDir = Join-Path ([IO.Path]::GetTempPath()) ("csh-fb-" + [Guid]::NewGuid())
        New-Item -ItemType Directory -Path $script:DataDir -Force | Out-Null
    }
    AfterAll {
        Remove-Item -Recurse -Force $script:DataDir -ErrorAction SilentlyContinue
        Remove-Item env:CYBERSHIELD_LEGACY_FALLBACK -ErrorAction SilentlyContinue
    }
    BeforeEach {
        $script:Logs = @(); $script:Tele = @()
        Get-ChildItem $script:DataDir -Force | Remove-Item -Force -ErrorAction SilentlyContinue
    }

    It 'returns false when flag is not set' {
        Remove-Item env:CYBERSHIELD_LEGACY_FALLBACK -ErrorAction SilentlyContinue
        (Test-LegacyFallbackAllowed -Caller 'TEST') | Should -BeFalse
    }

    It 'honors flag on first use, writes sentinel, and emits telemetry' {
        $env:CYBERSHIELD_LEGACY_FALLBACK = '1'
        (Test-LegacyFallbackAllowed -Caller 'POLL-JOBS') | Should -BeTrue
        (Test-Path (Join-Path $script:DataDir 'legacy_fallback.sentinel')) | Should -BeTrue
        $script:Tele.Count | Should -BeGreaterThan 0
        $script:Tele[0].e | Should -Be 'legacy_fallback_used'
    }

    It 'refuses flag after 24h SLA expiry' {
        $env:CYBERSHIELD_LEGACY_FALLBACK = '1'
        $sentinel = Join-Path $script:DataDir 'legacy_fallback.sentinel'
        ([DateTime]::UtcNow.AddHours(-25)).ToString('o') | Out-File -FilePath $sentinel -Encoding UTF8 -Force -NoNewline
        (Test-LegacyFallbackAllowed -Caller 'HEARTBEAT') | Should -BeFalse
        ($script:Logs -join "`n") | Should -Match 'REFUSED'
    }
}
