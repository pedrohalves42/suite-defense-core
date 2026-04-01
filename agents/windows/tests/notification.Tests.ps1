BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }
    function Invoke-SecureRequest { param([string]$Path, [string]$Method, [object]$Body, [int]$MaxRetries, [int]$TimeoutSec) return @{ Success = $true; Content = '{}' } }

    $Global:AgentName = "test-agent"
    $Global:AgentVersion = "6.0.0"
    $Global:BurntToastAvailable = $null
    $Global:AlertCooldownTracker = @{}
    $Global:AlertCooldownSeconds = 60
    $Global:LocalDetectionStats = @{ alerts_sent = 0 }

    . "$PSScriptRoot\..\modules\notification.ps1"
}

Describe "Show-SecurityToast" {
    It "Does not throw on any severity" {
        { Show-SecurityToast -Title "Test" -Message "test" -Severity "Info" } | Should -Not -Throw
        { Show-SecurityToast -Title "Test" -Message "test" -Severity "Warning" } | Should -Not -Throw
        { Show-SecurityToast -Title "Test" -Message "test" -Severity "Error" } | Should -Not -Throw
    }
}

Describe "Invoke-PushAlert" {
    BeforeEach {
        $Global:AlertCooldownTracker = @{}
        $Global:LocalDetectionStats = @{ alerts_sent = 0 }
    }

    It "Sends alert and records in tracker" {
        $result = Invoke-PushAlert -AlertType "test_alert" -AlertMessage "Test message" -Severity "warning"
        $result | Should -BeTrue
        $Global:AlertCooldownTracker.ContainsKey("test_alert") | Should -BeTrue
        $Global:LocalDetectionStats.alerts_sent | Should -Be 1
    }

    It "Respects cooldown for same alert type" {
        Invoke-PushAlert -AlertType "dup_alert" -AlertMessage "First" -Severity "info" | Out-Null
        $result = Invoke-PushAlert -AlertType "dup_alert" -AlertMessage "Second" -Severity "info"
        $result | Should -BeFalse
        $Global:LocalDetectionStats.alerts_sent | Should -Be 1
    }

    It "Allows different alert types independently" {
        Invoke-PushAlert -AlertType "alert_a" -AlertMessage "A" -Severity "info" | Out-Null
        $result = Invoke-PushAlert -AlertType "alert_b" -AlertMessage "B" -Severity "info"
        $result | Should -BeTrue
        $Global:LocalDetectionStats.alerts_sent | Should -Be 2
    }
}
