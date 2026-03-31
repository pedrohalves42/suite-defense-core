BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }

    $script:Config = @{
        AgentId  = "test-agent-id"
        TenantId = "test-tenant-id"
        Version  = "6.0.0"
    }

    . "$PSScriptRoot\..\modules\telemetry.ps1"
}

Describe "Get-SystemTelemetry" {
    BeforeAll {
        $telemetry = Get-SystemTelemetry
    }

    It "Returns a hashtable" {
        $telemetry | Should -BeOfType [System.Collections.Hashtable]
    }

    It "Contains agent_id from config" {
        $telemetry.agent_id | Should -Be "test-agent-id"
    }

    It "Contains tenant_id from config" {
        $telemetry.tenant_id | Should -Be "test-tenant-id"
    }

    It "Contains hostname" {
        $telemetry.hostname | Should -Be $env:COMPUTERNAME
    }

    It "Contains ISO 8601 timestamp" {
        $telemetry.timestamp | Should -Match '^\d{4}-\d{2}-\d{2}T'
    }

    It "Has system_metrics hashtable" {
        $telemetry.system_metrics | Should -BeOfType [System.Collections.Hashtable]
    }

    It "Has processes hashtable" {
        $telemetry.processes | Should -BeOfType [System.Collections.Hashtable]
    }

    It "Memory metrics are non-negative when present" {
        if ($telemetry.system_metrics.ContainsKey("memory_total_gb")) {
            $telemetry.system_metrics.memory_total_gb | Should -BeGreaterOrEqual 0
            $telemetry.system_metrics.memory_free_gb | Should -BeGreaterOrEqual 0
            $telemetry.system_metrics.memory_used_percent | Should -BeGreaterOrEqual 0
            $telemetry.system_metrics.memory_used_percent | Should -BeLessOrEqual 100
        }
    }

    It "Disk metrics are non-negative when present" {
        if ($telemetry.system_metrics.ContainsKey("disk_total_gb")) {
            $telemetry.system_metrics.disk_total_gb | Should -BeGreaterOrEqual 0
            $telemetry.system_metrics.disk_free_gb | Should -BeGreaterOrEqual 0
            $telemetry.system_metrics.disk_used_percent | Should -BeGreaterOrEqual 0
        }
    }

    It "Process list contains top_by_cpu array" {
        if ($telemetry.processes.ContainsKey("top_by_cpu")) {
            $telemetry.processes.top_by_cpu | Should -BeOfType [System.Array]
        }
    }

    It "Total processes count is positive" {
        if ($telemetry.processes.ContainsKey("total_processes")) {
            $telemetry.processes.total_processes | Should -BeGreaterThan 0
        }
    }

    It "Top process entries have required fields" {
        if ($telemetry.processes.ContainsKey("top_by_cpu") -and $telemetry.processes.top_by_cpu.Count -gt 0) {
            $proc = $telemetry.processes.top_by_cpu[0]
            $proc.Keys | Should -Contain "pid"
            $proc.Keys | Should -Contain "name"
            $proc.Keys | Should -Contain "cpu_seconds"
            $proc.Keys | Should -Contain "memory_mb"
        }
    }
}
