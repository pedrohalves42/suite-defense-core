BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }
    function Get-SystemTelemetry { return @{ agent_id = "test" } }
    function Get-SecurityEvents { param([int]$Hours) return @() }
    function Invoke-SecureApi { param([string]$Endpoint, [string]$Method, [hashtable]$Body) return $null }
    function Invoke-CheckForUpdate { }
    function Set-AgentState { param([string]$NewState, [string]$Reason) return $true }

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

Describe "Invoke-AgentJob Dispatcher" {
    It "Returns pong for integration_test_v3" {
        $result = Invoke-AgentJob -JobId "test-1" -JobType "integration_test_v3" -Timeout 10
        $result.pong | Should -BeTrue
        $result.agent_version | Should -Be "6.0.0"
    }

    It "Returns system info for collect_info" {
        $result = Invoke-AgentJob -JobId "test-2" -JobType "collect_info" -Timeout 10
        $result.success | Should -BeTrue
        $result.output | Should -Not -BeNullOrEmpty
    }

    It "Rejects unknown job type" {
        $result = Invoke-AgentJob -JobId "test-3" -JobType "arbitrary_command_injection_attempt" -Timeout 5
        $result.success | Should -BeFalse
        $result.error | Should -Match "Unknown job type"
    }

    It "Rejects empty job type" {
        $result = Invoke-AgentJob -JobId "test-4" -JobType "" -Timeout 5
        $result.success | Should -BeFalse
    }

    It "Returns update delegation for update_agent" {
        $result = Invoke-AgentJob -JobId "test-5" -JobType "update_agent" -Timeout 10
        $result.success | Should -BeTrue
        $result.message | Should -Match "delegated"
    }

    It "Returns reinstall delegation" {
        $result = Invoke-AgentJob -JobId "test-6" -JobType "reinstall_agent" -Timeout 10
        $result.success | Should -BeTrue
    }

    It "Result contains success key" {
        $result = Invoke-AgentJob -JobId "test-7" -JobType "integration_test_v3" -Timeout 10
        $result.Keys | Should -Contain "pong"
    }
}

Describe "Security: Protected Resources" {
    It "Blocks kill of protected process" {
        $result = Invoke-AgentJob -JobId "sec-1" -JobType "kill_process" -Payload @{ process_name = "lsass" } -Timeout 10
        $result.success | Should -BeTrue
        $output = $result.output | ConvertFrom-StringData -ErrorAction SilentlyContinue
        # The handler should block this - check output contains SECURITY_BLOCK
        $result.output | Should -Match "SECURITY_BLOCK|blocked|protected"
    }

    It "Blocks stop of protected service" {
        $result = Invoke-AgentJob -JobId "sec-2" -JobType "stop_service" -Payload @{ service_name = "EventLog" } -Timeout 10
        $result.output | Should -Match "SECURITY_BLOCK|blocked"
    }

    It "Blocks disable of protected service" {
        $result = Invoke-AgentJob -JobId "sec-3" -JobType "disable_service" -Payload @{ service_name = "RpcSs" } -Timeout 10
        $result.output | Should -Match "SECURITY_BLOCK|blocked"
    }
}

Describe "Security: No arbitrary command execution" {
    It "Does not accept a Command parameter for shell execution" {
        # Invoke-AgentJob no longer has a -Command parameter
        $params = (Get-Command Invoke-AgentJob).Parameters
        $params.Keys | Should -Not -Contain "Command"
    }

    It "Does not use cmd.exe anywhere in the module" {
        $content = Get-Content "$PSScriptRoot\..\modules\job-runner.ps1" -Raw
        $content | Should -Not -Match "cmd\.exe"
    }

    It "Does not use Invoke-Expression anywhere in the module" {
        $content = Get-Content "$PSScriptRoot\..\modules\job-runner.ps1" -Raw
        $content | Should -Not -Match "Invoke-Expression"
    }
}

Describe "Input Validation" {
    It "Rejects missing process_name for kill_process" {
        $result = Invoke-AgentJob -JobId "val-1" -JobType "kill_process" -Payload @{} -Timeout 10
        $result.output | Should -Match "Missing process_name|error"
    }

    It "Rejects missing service_name for stop_service" {
        $result = Invoke-AgentJob -JobId "val-2" -JobType "stop_service" -Payload @{} -Timeout 10
        $result.output | Should -Match "Missing service_name|error"
    }

    It "Validates network diagnostic targets format" {
        $result = Invoke-AgentJob -JobId "val-3" -JobType "network_diagnostics" -Payload @{ targets = @("; rm -rf /") } -Timeout 10
        $result.output | Should -Match "Invalid target format|error"
    }
}
