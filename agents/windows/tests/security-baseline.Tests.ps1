#requires -Version 5.1
<#
.SYNOPSIS
    Phase 6.2 (ADR-003) — security.ps1 ProcessBaselineSet migration.
    Verifies module-private state + accessors replace $Global:ProcessBaselineSet.
#>

BeforeAll {
    . "$PSScriptRoot/../modules/security.ps1"
    # Stub Write-Log so security.ps1 helpers don't fail when called in isolation.
    if (-not (Get-Command Write-Log -ErrorAction SilentlyContinue)) {
        function Write-Log { param($Message, $Level) }
    }
}

Describe 'Phase 6.2 — security.ps1 baseline accessors' {

    BeforeEach {
        Clear-ProcessBaseline
    }

    It 'starts empty after Clear-ProcessBaseline' {
        Get-ProcessBaselineCount | Should -Be 0
    }

    It 'fails-open (returns $true) when the baseline is empty' {
        Test-ProcessInBaseline -ProcessName 'svchost.exe' | Should -BeTrue
    }

    It 'returns $true for a name added via accessor' {
        Add-ProcessToBaseline -ProcessName 'explorer.exe'
        Test-ProcessInBaseline -ProcessName 'explorer.exe' | Should -BeTrue
    }

    It 'matches case-insensitively' {
        Add-ProcessToBaseline -ProcessName 'Explorer.EXE'
        Test-ProcessInBaseline -ProcessName 'explorer.exe' | Should -BeTrue
    }

    It 'returns $false for a name absent from a non-empty baseline' {
        Add-ProcessToBaseline -ProcessName 'explorer.exe'
        Test-ProcessInBaseline -ProcessName 'mimikatz.exe' | Should -BeFalse
    }

    It 'Add-ProcessToBaseline is idempotent' {
        Add-ProcessToBaseline -ProcessName 'svchost.exe'
        Add-ProcessToBaseline -ProcessName 'svchost.exe'
        Get-ProcessBaselineCount | Should -Be 1
    }

    It 'does not leak a $Global:ProcessBaselineSet variable' {
        # Phase 6.2 guarantee — global must NOT exist after the module loads.
        (Get-Variable -Name 'ProcessBaselineSet' -Scope Global -ErrorAction SilentlyContinue) |
            Should -BeNullOrEmpty
    }
}
