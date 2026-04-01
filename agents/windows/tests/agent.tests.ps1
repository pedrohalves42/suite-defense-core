<#
.SYNOPSIS
    Integration-level Pester tests for CyberShield Agent v6.0 modules
    Tests module loading order and cross-module function availability.
#>

Describe "CyberShield Agent v6.0 Module Integration" {
    BeforeAll {
        # Initialize globals required before module loading (mirrors main.ps1)
        $Global:UpdateInProgress = $false
        $Global:BootScriptHash = $null
        $Global:CurrentState = "INITIALIZING"
        $Global:AgentName = "test-agent"
        $Global:AgentVersion = "6.0.0"
        $Global:AgentToken = "test-token"
        $Global:HmacSecret = $null
        $Global:ServerUrl = "https://test.example.com"
        $Global:CachedHmacKey = $null
        $Global:TlsPinnedThumbprint = $null
        $Global:ConsecutivePollErrors = 0
        $Global:JobPollIntervalSeconds = 60
        $Global:LoopTimestamp = $null
        $Global:StatePath = "$env:TEMP\CyberShield\test-integration\agent_state.json"
        $Global:DnsBlocklistPath = "$env:TEMP\CyberShield\test-integration\dns_blocklist.json"
        $Global:EvidenceJournalPath = "$env:TEMP\CyberShield\test-integration\evidence_journal.jsonl"
        $Global:EvidenceBuffer = [System.Collections.ArrayList]::new()
        $Global:RollbackPaths = @{ RollbackState = "$env:TEMP\CyberShield\test-integration\rollback_state.json" }
        $Global:AggregationEnabled = $true
        $Global:AggregationWindowSeconds = 10
        $Global:AggregationFileThreshold = 50
        $Global:AggregationProcessThreshold = 20
        $Global:AggregationNetworkThreshold = 100
        $Global:AggregationMaxBufferSize = 500
        $Global:AggregationLastFlush = [datetime]::MinValue
        $Global:EventAggregationBuffer = @{}
        $Global:AggregationStats = @{ events_received = 0; events_aggregated = 0; events_sent = 0; bursts_detected = 0; buffer_overflow = 0; reduction_percent = 0 }
        $Global:AutoRepairStats = @{ disk_cleanups = 0; last_disk_cleanup = $null; processes_killed = 0; services_restarted = 0 }
        $Global:ProtectedProcesses = @("system", "csrss", "lsass", "svchost")
        $Global:ProtectedServices = @("wininit", "lsass", "services")
        $Global:DiskCleanupThresholdPercent = 90
        $Global:HighCpuThresholdPercent = 90
        $Global:AlertCooldownTracker = @{}
        $Global:AlertCooldownSeconds = 60
        $Global:LocalDetectionStats = @{ alerts_sent = 0 }
        $Global:BurntToastAvailable = $null
        $Global:CachedNetworkOk = $false
        $Global:CachedNetworkCheckTime = [datetime]::MinValue

        $testDir = "$env:TEMP\CyberShield\test-integration"
        if (-not (Test-Path $testDir)) { New-Item -ItemType Directory -Path $testDir -Force | Out-Null }

        $modulePath = "$PSScriptRoot\..\modules"

        # Load in correct order (mirrors main.ps1)
        . "$modulePath\config.ps1"
        . "$modulePath\utils.ps1"
        . "$modulePath\crypto.ps1"
        . "$modulePath\hmac.ps1"
        . "$modulePath\telemetry.ps1"
        . "$modulePath\security.ps1"
        . "$modulePath\network.ps1"
        . "$modulePath\state.ps1"
        . "$modulePath\evidence.ps1"
        . "$modulePath\notification.ps1"
        . "$modulePath\collection.ps1"
        . "$modulePath\remediation.ps1"
        . "$modulePath\heartbeat.ps1"
        . "$modulePath\self-heal.ps1"
        . "$modulePath\update.ps1"
        . "$modulePath\job-runner.ps1"
    }

    Describe "Module Loading" {
        It "All 16 modules load without error" {
            # If we got here, all modules loaded
            $true | Should -BeTrue
        }

        It "Config module exports Initialize-Config" {
            Get-Command Initialize-Config -ErrorAction SilentlyContinue | Should -Not -BeNullOrEmpty
        }

        It "Job runner exports Invoke-AgentJob" {
            Get-Command Invoke-AgentJob -ErrorAction SilentlyContinue | Should -Not -BeNullOrEmpty
        }

        It "Self-heal exports Get-BOMSafeFileHash" {
            Get-Command Get-BOMSafeFileHash -ErrorAction SilentlyContinue | Should -Not -BeNullOrEmpty
        }

        It "Update module exports Invoke-CheckForUpdate" {
            Get-Command Invoke-CheckForUpdate -ErrorAction SilentlyContinue | Should -Not -BeNullOrEmpty
        }

        It "Update module exports Test-AgentVersion" {
            Get-Command Test-AgentVersion -ErrorAction SilentlyContinue | Should -Not -BeNullOrEmpty
        }
    }

    Describe "Cross-Module Integration" {
        It "Config initializes without error" {
            { Initialize-Config -AgentToken "test" -HmacSecret "test" -ApiEndpoint "https://test.example.com" } | Should -Not -Throw
        }

        It "Config has required keys after init" {
            $script:Config.Keys | Should -Contain "ApiEndpoint"
            $script:Config.Keys | Should -Contain "AgentToken"
            $script:Config.Keys | Should -Contain "HmacSecret"
        }

        It "HMAC computation is deterministic" {
            $hmac1 = Compute-HMAC -Message "hello" -Secret "key123"
            $hmac2 = Compute-HMAC -Message "hello" -Secret "key123"
            $hmac1 | Should -Be $hmac2
        }

        It "HMAC verification works" {
            $msg = "test payload"
            $secret = "mysecret"
            $sig = Compute-HMAC -Message $msg -Secret $secret
            Test-HMAC -Message $msg -Signature $sig -Secret $secret | Should -Be $true
        }

        It "Payload hash returns 64-char hex" {
            $hash = Get-PayloadHash -Payload "test"
            $hash.Length | Should -Be 64
            $hash | Should -Match "^[0-9a-f]{64}$"
        }

        It "Telemetry returns hashtable with required keys" {
            $script:Config.AgentId = "test-agent-id"
            $script:Config.TenantId = "test-tenant-id"
            $result = Get-SystemTelemetry
            $result | Should -BeOfType [hashtable]
            $result.Keys | Should -Contain "agent_id"
            $result.Keys | Should -Contain "timestamp"
        }

        It "BOM-safe hash is consistent" {
            $tmpFile = [System.IO.Path]::GetTempFileName()
            try {
                Set-Content -Path $tmpFile -Value "test" -NoNewline
                $h1 = Get-BOMSafeFileHash -FilePath $tmpFile
                $h2 = Get-BOMSafeFileHash -FilePath $tmpFile
                $h1 | Should -Be $h2
                $h1.Length | Should -Be 64
            }
            finally { Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue }
        }

        It "Job dispatcher rejects unknown types" {
            $result = Invoke-AgentJob -JobId "int-1" -JobType "evil_command" -Timeout 5
            $result.success | Should -BeFalse
            $result.error | Should -Match "Unknown job type"
        }

        It "Job dispatcher handles integration_test_v3" {
            $result = Invoke-AgentJob -JobId "int-2" -JobType "integration_test_v3" -Timeout 10
            $result.pong | Should -BeTrue
            $result.agent_version | Should -Be "6.0.0"
        }

        It "State machine validates transitions" {
            $Global:CurrentState = "INITIALIZING"
            Set-AgentState -NewState "AUTHENTICATING" -Reason "test" | Should -BeTrue
            Set-AgentState -NewState "INITIALIZING" -Reason "test" | Should -BeFalse
        }

        It "Version comparison detects updates" {
            Test-AgentVersion -ServerVersion "7.0.0" | Should -BeTrue
            Test-AgentVersion -ServerVersion "6.0.0" | Should -BeFalse
            Test-AgentVersion -ServerVersion "6.0.1" | Should -BeTrue
        }
    }

    Describe "Security Invariants" {
        It "No cmd.exe in any module" {
            $allContent = Get-ChildItem "$PSScriptRoot\..\modules\*.ps1" | ForEach-Object { Get-Content $_.FullName -Raw }
            ($allContent -join "`n") | Should -Not -Match "cmd\.exe"
        }

        It "No Invoke-Expression in any module" {
            $allContent = Get-ChildItem "$PSScriptRoot\..\modules\*.ps1" | ForEach-Object { Get-Content $_.FullName -Raw }
            ($allContent -join "`n") | Should -Not -Match "Invoke-Expression"
        }

        It "No IEX alias in any module" {
            $allContent = Get-ChildItem "$PSScriptRoot\..\modules\*.ps1" | ForEach-Object { Get-Content $_.FullName -Raw }
            ($allContent -join "`n") | Should -Not -Match "\bIEX\b"
        }

        It "Invoke-AgentJob has no Command parameter" {
            $params = (Get-Command Invoke-AgentJob).Parameters
            $params.Keys | Should -Not -Contain "Command"
        }

        It "Protected process kill is blocked" {
            $result = Invoke-AgentJob -JobId "sec-1" -JobType "kill_process" -Payload @{ process_name = "lsass" } -Timeout 10
            # The result from Invoke-JobWithTimeout wraps the handler output
            ($result | ConvertTo-Json -Compress) | Should -Match "SECURITY_BLOCK|blocked"
        }
    }
}

AfterAll {
    Remove-Item "$env:TEMP\CyberShield\test-integration" -Recurse -Force -ErrorAction SilentlyContinue
}
