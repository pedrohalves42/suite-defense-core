BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }
    function Get-SystemTelemetry { return @{ agent_id = "test" } }
    function Get-SecurityEvents { param([int]$Hours) return @() }
    function Invoke-SecureApi { param([string]$Endpoint, [string]$Method, [hashtable]$Body) return $null }
    function Check-ForUpdate { }

    $script:Config = @{
        AgentId           = "test-agent-id"
        TenantId          = "test-tenant-id"
        Version           = "6.0.0"
        HeartbeatInterval = 60
        MaxRetries        = 5
    }

    . "$PSScriptRoot\..\modules\job-runner.ps1"
}

Describe "Circuit Breaker State" {
    BeforeEach {
        $script:ConsecutiveFailures = 0
        $script:CircuitBreakerOpen = $false
    }

    It "Starts with circuit breaker closed" {
        $script:CircuitBreakerOpen | Should -BeFalse
    }

    It "Starts with zero consecutive failures" {
        $script:ConsecutiveFailures | Should -Be 0
    }

    It "CircuitBreakerCooldown has a sane default" {
        $script:CircuitBreakerCooldown | Should -BeGreaterOrEqual 60
    }
}

Describe "Invoke-AgentJob" {
    It "Returns success for simple command" {
        $result = Invoke-AgentJob -JobId "test-1" -Command "echo hello" -Timeout 10
        $result.success | Should -BeTrue
    }

    It "Returns output from command" {
        $result = Invoke-AgentJob -JobId "test-2" -Command "echo test-output-xyz" -Timeout 10
        $result.output | Should -Match "test-output-xyz"
    }

    It "Returns failure result for invalid command" {
        $result = Invoke-AgentJob -JobId "test-3" -Command "nonexistent-command-12345" -Timeout 5
        # Should return a result hash, not throw
        $result | Should -Not -BeNullOrEmpty
    }

    It "Times out long-running commands" {
        $result = Invoke-AgentJob -JobId "test-4" -Command "ping -n 30 127.0.0.1" -Timeout 2
        $result.success | Should -BeFalse
        $result.error | Should -Match "Timeout"
    }

    It "Result contains exit_code" {
        $result = Invoke-AgentJob -JobId "test-5" -Command "echo ok" -Timeout 10
        $result.Keys | Should -Contain "exit_code"
    }

    It "Result contains output key" {
        $result = Invoke-AgentJob -JobId "test-6" -Command "echo ok" -Timeout 10
        $result.Keys | Should -Contain "output"
    }
}
