BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }
    function Invoke-SecureRequest { param([string]$Path, [string]$Method, [object]$Body, [int]$MaxRetries, [int]$TimeoutSec) return @{ Success = $true; Content = '{}' } }
    function Invoke-PushAlert { param([string]$AlertType, [string]$AlertMessage, [string]$Severity, [hashtable]$Details) return $true }

    $Global:AgentName = "test-agent"
    $Global:AgentVersion = "6.0.0"
    $Global:EvidenceBuffer = [System.Collections.ArrayList]::new()
    $Global:EvidenceJournalPath = "$env:TEMP\CyberShield\test-evidence\journal.jsonl"
    $Global:LoopTimestamp = $null
    $Global:AggregationEnabled = $true
    $Global:AggregationWindowSeconds = 10
    $Global:AggregationFileThreshold = 50
    $Global:AggregationProcessThreshold = 20
    $Global:AggregationNetworkThreshold = 100
    $Global:AggregationMaxBufferSize = 500
    $Global:AggregationLastFlush = [datetime]::MinValue
    $Global:EventAggregationBuffer = @{}
    $Global:AggregationStats = @{ events_received = 0; events_aggregated = 0; events_sent = 0; bursts_detected = 0; buffer_overflow = 0; reduction_percent = 0 }

    $testDir = "$env:TEMP\CyberShield\test-evidence"
    if (-not (Test-Path $testDir)) { New-Item -ItemType Directory -Path $testDir -Force | Out-Null }

    . "$PSScriptRoot\..\modules\evidence.ps1"
}

Describe "Add-EvidenceEntry" {
    BeforeEach {
        $Global:EvidenceBuffer = [System.Collections.ArrayList]::new()
    }

    It "Adds entry to evidence buffer" {
        Add-EvidenceEntry -Type "test_event" -Data @{ key = "value" } -Severity "info"
        $Global:EvidenceBuffer.Count | Should -Be 1
    }

    It "Entry has required fields" {
        Add-EvidenceEntry -Type "test_event" -Data @{ key = "value" }
        $entry = $Global:EvidenceBuffer[0]
        $entry.Keys | Should -Contain "timestamp"
        $entry.Keys | Should -Contain "type"
        $entry.Keys | Should -Contain "data"
        $entry.Keys | Should -Contain "severity"
        $entry.Keys | Should -Contain "agent_name"
    }

    It "Defaults severity to info" {
        Add-EvidenceEntry -Type "test_event"
        $Global:EvidenceBuffer[0].severity | Should -Be "info"
    }
}

Describe "Add-AggregatedEvent" {
    BeforeEach {
        $Global:EventAggregationBuffer = @{}
        $Global:EvidenceBuffer = [System.Collections.ArrayList]::new()
        $Global:AggregationEnabled = $true
        $Global:AggregationStats = @{ events_received = 0; events_aggregated = 0; events_sent = 0; bursts_detected = 0; buffer_overflow = 0; reduction_percent = 0 }
    }

    It "Creates new aggregation entry" {
        Add-AggregatedEvent -EventType "file_create" -Pattern "*.tmp"
        $Global:EventAggregationBuffer.Count | Should -Be 1
        $Global:AggregationStats.events_received | Should -Be 1
    }

    It "Aggregates duplicate events" {
        Add-AggregatedEvent -EventType "file_create" -Pattern "*.tmp"
        Add-AggregatedEvent -EventType "file_create" -Pattern "*.tmp"
        $Global:EventAggregationBuffer.Count | Should -Be 1
        $Global:AggregationStats.events_aggregated | Should -Be 1
    }

    It "Falls back to raw events when aggregation disabled" {
        $Global:AggregationEnabled = $false
        Add-AggregatedEvent -EventType "file_create" -Pattern "*.tmp"
        $Global:EvidenceBuffer.Count | Should -Be 1
        $Global:EventAggregationBuffer.Count | Should -Be 0
    }
}

Describe "Update-AggregationConfig" {
    It "Updates window_seconds within bounds" {
        Update-AggregationConfig -Config @{ window_seconds = 15 }
        $Global:AggregationWindowSeconds | Should -Be 15
    }

    It "Rejects out-of-bounds window_seconds" {
        $Global:AggregationWindowSeconds = 10
        Update-AggregationConfig -Config @{ window_seconds = 999 }
        $Global:AggregationWindowSeconds | Should -Be 10
    }

    It "Updates enabled flag" {
        Update-AggregationConfig -Config @{ enabled = $false }
        $Global:AggregationEnabled | Should -BeFalse
    }
}

AfterAll {
    Remove-Item "$env:TEMP\CyberShield\test-evidence" -Recurse -Force -ErrorAction SilentlyContinue
}
