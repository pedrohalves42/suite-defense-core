BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }
    function Invoke-SecureRequest { param([string]$Path, [string]$Method, [object]$Body, [int]$MaxRetries, [int]$TimeoutSec) return @{ Success = $true; Content = '{}' } }

    # AgentName / AgentVersion are owned by the identity sub-phase (deferred);
    # they stay as $Global: reads until then.
    $Global:AgentName    = "test-agent"
    $Global:AgentVersion = "6.0.0"

    . "$PSScriptRoot\..\modules\notification.ps1"
}

Describe "Show-SecurityToast" {
    BeforeEach { Reset-NotificationState }

    It "Does not throw on any severity" {
        { Show-SecurityToast -Title "Test" -Message "test" -Severity "Info" }    | Should -Not -Throw
        { Show-SecurityToast -Title "Test" -Message "test" -Severity "Warning" } | Should -Not -Throw
        { Show-SecurityToast -Title "Test" -Message "test" -Severity "Error" }   | Should -Not -Throw
    }
}

Describe "Invoke-PushAlert" {
    BeforeEach {
        Reset-NotificationState
        Set-AlertCooldownSeconds -Seconds 60
    }

    It "Sends alert and records in tracker" {
        $result = Invoke-PushAlert -AlertType "test_alert" -AlertMessage "Test message" -Severity "warning"
        $result | Should -BeTrue
        (Get-AlertCooldownTracker).ContainsKey("test_alert") | Should -BeTrue
        (Get-LocalDetectionStats).alerts_sent | Should -Be 1
    }

    It "Respects cooldown for same alert type" {
        Invoke-PushAlert -AlertType "dup_alert" -AlertMessage "First"  -Severity "info" | Out-Null
        $result = Invoke-PushAlert -AlertType "dup_alert" -AlertMessage "Second" -Severity "info"
        $result | Should -BeFalse
        (Get-LocalDetectionStats).alerts_sent | Should -Be 1
    }

    It "Allows different alert types independently" {
        Invoke-PushAlert -AlertType "alert_a" -AlertMessage "A" -Severity "info" | Out-Null
        $result = Invoke-PushAlert -AlertType "alert_b" -AlertMessage "B" -Severity "info"
        $result | Should -BeTrue
        (Get-LocalDetectionStats).alerts_sent | Should -Be 2
    }
}

Describe "Phase 6.3 — global hygiene" {
    It "does not leak module-owned globals" {
        foreach ($name in 'BurntToastAvailable','AlertCooldownTracker','AlertCooldownSeconds','LocalDetectionStats') {
            (Get-Variable -Name $name -Scope Global -ErrorAction SilentlyContinue) |
                Should -BeNullOrEmpty -Because "$name was migrated to `$script: in notification.ps1 (Phase 6.3)"
        }
    }

    It "Set-AlertCooldownSeconds rejects negative values" {
        { Set-AlertCooldownSeconds -Seconds -1 } | Should -Throw
    }

    It "Reset-NotificationState clears tracker, stats and BurntToast probe" {
        Invoke-PushAlert -AlertType "x" -AlertMessage "y" -Severity "info" | Out-Null
        (Get-LocalDetectionStats).alerts_sent | Should -Be 1
        Reset-NotificationState
        (Get-AlertCooldownTracker).Count       | Should -Be 0
        (Get-LocalDetectionStats).alerts_sent  | Should -Be 0
    }
}
