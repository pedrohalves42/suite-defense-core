BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }

    $Global:CurrentState = "INITIALIZING"
    $Global:StatePath = "$env:TEMP\CyberShield\test-state\agent_state.json"
    $Global:RollbackPaths = @{
        RollbackState = "$env:TEMP\CyberShield\test-state\rollback_state.json"
    }

    $testDir = "$env:TEMP\CyberShield\test-state"
    if (-not (Test-Path $testDir)) { New-Item -ItemType Directory -Path $testDir -Force | Out-Null }

    . "$PSScriptRoot\..\modules\state.ps1"
}

Describe "Set-AgentState" {
    BeforeEach {
        $Global:CurrentState = "INITIALIZING"
    }

    It "Allows valid transition INITIALIZING -> AUTHENTICATING" {
        $result = Set-AgentState -NewState "AUTHENTICATING" -Reason "test"
        $result | Should -BeTrue
        $Global:CurrentState | Should -Be "AUTHENTICATING"
    }

    It "Blocks invalid transition INITIALIZING -> ENFORCING" {
        $result = Set-AgentState -NewState "ENFORCING" -Reason "test"
        $result | Should -BeFalse
        $Global:CurrentState | Should -Be "INITIALIZING"
    }

    It "Allows same state (no-op)" {
        $result = Set-AgentState -NewState "INITIALIZING"
        $result | Should -BeTrue
    }

    It "Persists state to file" {
        Set-AgentState -NewState "AUTHENTICATING" -Reason "test"
        $Global:StatePath | Should -Exist
        $saved = Get-Content $Global:StatePath -Raw | ConvertFrom-Json
        $saved.state | Should -Be "AUTHENTICATING"
    }

    It "Allows DEGRADED from any operational state" {
        $Global:CurrentState = "ENFORCING"
        Set-AgentState -NewState "DEGRADED" -Reason "test" | Should -BeTrue
    }
}

Describe "Get-SavedAgentState" {
    It "Returns null when no state file" {
        Remove-Item $Global:StatePath -Force -ErrorAction SilentlyContinue
        $result = Get-SavedAgentState
        $result | Should -BeNullOrEmpty
    }

    It "Returns saved state from file" {
        @{ state = "SYNCING" } | ConvertTo-Json | Out-File $Global:StatePath -Encoding UTF8
        $result = Get-SavedAgentState
        $result | Should -Be "SYNCING"
    }
}

Describe "Get-RollbackState / Save-RollbackState" {
    It "Returns defaults when no rollback file" {
        Remove-Item $Global:RollbackPaths.RollbackState -Force -ErrorAction SilentlyContinue
        $state = Get-RollbackState
        $state.safe_mode | Should -BeFalse
        $state.rollback_count | Should -Be 0
    }

    It "Saves and restores rollback state" {
        $state = @{ safe_mode = $true; rollback_count = 2; previous_version = "5.0.0"; last_rollback = (Get-Date).ToString("o") }
        Save-RollbackState -State $state

        $restored = Get-RollbackState
        $restored.safe_mode | Should -BeTrue
        $restored.rollback_count | Should -Be 2
    }
}

AfterAll {
    Remove-Item "$env:TEMP\CyberShield\test-state" -Recurse -Force -ErrorAction SilentlyContinue
}
