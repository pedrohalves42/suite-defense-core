BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }
    function Invoke-SecureRequest { param([string]$Path, [string]$Method, [object]$Body, [int]$MaxRetries, [int]$TimeoutSec) return @{ Success = $true; Content = '{}' } }
    function Send-AutoRepairTelemetry { param([string]$Event, [object]$Data) }
    function Invoke-PushAlert { param([string]$AlertType, [string]$AlertMessage, [string]$Severity, [hashtable]$Details) return $true }
    function Test-ProcessInBaseline { param([string]$ProcessName) return $true }

    $Global:AgentName = "test-agent"
    $Global:AgentVersion = "6.0.0"
    $Global:ProtectedProcesses = @("system", "csrss", "lsass", "svchost")
    $Global:ProtectedServices = @("wininit", "lsass", "services")
    $Global:DiskCleanupThresholdPercent = 90
    $Global:HighCpuThresholdPercent = 90
    $Global:DnsBlocklistPath = "$env:TEMP\CyberShield\test-remediation\dns_blocklist.json"
    $Global:AutoRepairStats = @{ disk_cleanups = 0; last_disk_cleanup = $null; processes_killed = 0; services_restarted = 0 }
    $Global:ProtectedProcessSet = $null

    $testDir = "$env:TEMP\CyberShield\test-remediation"
    if (-not (Test-Path $testDir)) { New-Item -ItemType Directory -Path $testDir -Force | Out-Null }

    . "$PSScriptRoot\..\modules\remediation.ps1"
}

Describe "Invoke-KillProcess" {
    It "Blocks protected process" {
        $result = Invoke-KillProcess -Payload @{ process_name = "lsass" }
        $result.success | Should -BeFalse
        $result.error | Should -Match "SECURITY_BLOCK"
        $result.blocked | Should -BeTrue
    }

    It "Returns error for missing process_name" {
        $result = Invoke-KillProcess -Payload @{}
        $result.success | Should -BeFalse
        $result.error | Should -Match "Missing process_name"
    }

    It "Returns success for non-running process" {
        $result = Invoke-KillProcess -Payload @{ process_name = "nonexistent_process_xyz_123" }
        $result.success | Should -BeTrue
        $result.killed | Should -Be 0
    }
}

Describe "Invoke-StopService" {
    It "Blocks protected service" {
        $result = Invoke-StopService -Payload @{ service_name = "lsass" }
        $result.success | Should -BeFalse
        $result.error | Should -Match "SECURITY_BLOCK"
    }

    It "Returns error for missing service_name" {
        $result = Invoke-StopService -Payload @{}
        $result.success | Should -BeFalse
        $result.error | Should -Match "Missing service_name"
    }

    It "Returns error for non-existent service" {
        $result = Invoke-StopService -Payload @{ service_name = "nonexistent_svc_xyz" }
        $result.success | Should -BeFalse
        $result.error | Should -Match "not found"
    }
}

Describe "Invoke-DisableService" {
    It "Blocks protected service" {
        $result = Invoke-DisableService -Payload @{ service_name = "lsass" }
        $result.success | Should -BeFalse
        $result.error | Should -Match "SECURITY_BLOCK"
    }

    It "Returns error for missing service_name" {
        $result = Invoke-DisableService -Payload @{}
        $result.success | Should -BeFalse
    }
}

Describe "Invoke-RestartService" {
    It "Returns error for missing service_name" {
        $result = Invoke-RestartService -Payload @{}
        $result.success | Should -BeFalse
        $result.error | Should -Match "Missing service_name"
    }

    It "Returns error for non-existent service" {
        $result = Invoke-RestartService -Payload @{ service_name = "nonexistent_svc_xyz" }
        $result.success | Should -BeFalse
    }
}

AfterAll {
    Remove-Item "$env:TEMP\CyberShield\test-remediation" -Recurse -Force -ErrorAction SilentlyContinue
}
