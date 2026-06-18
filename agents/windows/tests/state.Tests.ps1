BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }

    $testDir = "$env:TEMP\CyberShield\test-state"
    if (-not (Test-Path $testDir)) { New-Item -ItemType Directory -Path $testDir -Force | Out-Null }

    . "$PSScriptRoot\..\modules\state.ps1"

    # Phase 6.4: rollback path is module-private; configure via accessor.
    Set-RollbackStatePath -Path "$testDir\rollback_state.json"
    # Phase 6.5: FSM state + persisted-state path are module-private.
    Set-StatePath -Path "$testDir\agent_state.json"
    Set-AgentCurrentState -State "INITIALIZING"
}


Describe "Set-AgentState" {
    BeforeEach {
        Set-AgentCurrentState -State "INITIALIZING"
    }

    It "Allows valid transition INITIALIZING -> AUTHENTICATING" {
        $result = Set-AgentState -NewState "AUTHENTICATING" -Reason "test"
        $result | Should -BeTrue
        (Get-AgentCurrentState) | Should -Be "AUTHENTICATING"
    }

    It "Blocks invalid transition INITIALIZING -> ENFORCING" {
        $result = Set-AgentState -NewState "ENFORCING" -Reason "test"
        $result | Should -BeFalse
        (Get-AgentCurrentState) | Should -Be "INITIALIZING"
    }

    It "Allows same state (no-op)" {
        $result = Set-AgentState -NewState "INITIALIZING"
        $result | Should -BeTrue
    }

    It "Persists state to file" {
        Set-AgentState -NewState "AUTHENTICATING" -Reason "test"
        (Get-StatePath) | Should -Exist
        $saved = Get-Content (Get-StatePath) -Raw | ConvertFrom-Json
        $saved.state | Should -Be "AUTHENTICATING"
    }

    It "Allows DEGRADED from any operational state" {
        Set-AgentCurrentState -State "ENFORCING"
        Set-AgentState -NewState "DEGRADED" -Reason "test" | Should -BeTrue
    }
}

Describe "Get-SavedAgentState" {
    It "Returns null when no state file" {
        Remove-Item (Get-StatePath) -Force -ErrorAction SilentlyContinue
        $result = Get-SavedAgentState
        $result | Should -BeNullOrEmpty
    }

    It "Returns saved state from file" {
        @{ state = "SYNCING" } | ConvertTo-Json | Out-File (Get-StatePath) -Encoding UTF8
        $result = Get-SavedAgentState
        $result | Should -Be "SYNCING"
    }
}

Describe "Get-RollbackState / Save-RollbackState" {
    It "Returns defaults when no rollback file" {
        Remove-Item (Get-RollbackStatePath) -Force -ErrorAction SilentlyContinue

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

Describe "Phase 6.4 - RollbackPaths migration" {
    It "exposes path via accessor (not via `$Global:RollbackPaths)" {
        (Get-RollbackStatePath) | Should -Not -BeNullOrEmpty
    }

    It "Set-RollbackStatePath rejects empty input" {
        { Set-RollbackStatePath -Path '' } | Should -Throw
    }

    It "does not leak `$Global:RollbackPaths" {
        (Get-Variable -Name 'RollbackPaths' -Scope Global -ErrorAction SilentlyContinue) |
            Should -BeNullOrEmpty -Because 'Phase 6.4 moved this to $script:RollbackStatePath inside state.ps1'
    }
}

Describe "Phase 6.5 - CurrentState / StatePath migration" {
    It "exposes CurrentState via accessor" {
        Set-AgentCurrentState -State "INITIALIZING"
        (Get-AgentCurrentState) | Should -Be "INITIALIZING"
    }

    It "Set-AgentCurrentState rejects empty input" {
        { Set-AgentCurrentState -State '' } | Should -Throw
    }

    It "exposes StatePath via accessor" {
        (Get-StatePath) | Should -Not -BeNullOrEmpty
    }

    It "Set-StatePath rejects empty input" {
        { Set-StatePath -Path '' } | Should -Throw
    }

    It "Set-AgentState mutates the script-private store, not a global" {
        Set-AgentCurrentState -State "INITIALIZING"
        if (Get-Variable -Name 'CurrentState' -Scope Global -ErrorAction SilentlyContinue) {
            Remove-Variable -Name 'CurrentState' -Scope Global -Force
        }
        Set-AgentState -NewState "AUTHENTICATING" -Reason "guard" | Should -BeTrue
        (Get-AgentCurrentState) | Should -Be "AUTHENTICATING"
        # The legacy global must NOT have been recreated by state.ps1 internals.
        (Get-Variable -Name 'CurrentState' -Scope Global -ErrorAction SilentlyContinue) |
            Should -BeNullOrEmpty -Because 'Phase 6.5 moved CurrentState into $script: inside state.ps1'
    }
}


AfterAll {
    Remove-Item "$env:TEMP\CyberShield\test-state" -Recurse -Force -ErrorAction SilentlyContinue
}
