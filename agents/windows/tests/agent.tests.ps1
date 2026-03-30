<#
.SYNOPSIS
    Pester tests for CyberShield Agent v6.0 modules
#>

Describe "CyberShield Agent v6.0 Modules" {
    BeforeAll {
        $modulePath = "$PSScriptRoot\..\modules"
        . "$modulePath\config.ps1"
        . "$modulePath\utils.ps1"
        . "$modulePath\crypto.ps1"
        . "$modulePath\hmac.ps1"
        . "$modulePath\telemetry.ps1"
        . "$modulePath\self-heal.ps1"
    }

    Describe "Config" {
        It "Initialize-Config should not throw" {
            { Initialize-Config -AgentToken "test" -HmacSecret "test" -ApiEndpoint "https://test.example.com" } | Should -Not -Throw
        }

        It "Config should have required keys" {
            $script:Config.Keys | Should -Contain "ApiEndpoint"
            $script:Config.Keys | Should -Contain "AgentToken"
            $script:Config.Keys | Should -Contain "HmacSecret"
            $script:Config.Keys | Should -Contain "HeartbeatInterval"
        }

        It "Config should store correct ApiEndpoint" {
            Initialize-Config -AgentToken "tok" -HmacSecret "sec" -ApiEndpoint "https://api.example.com"
            $script:Config.ApiEndpoint | Should -Be "https://api.example.com"
        }

        It "Config should store correct AgentToken" {
            Initialize-Config -AgentToken "my-token" -HmacSecret "sec" -ApiEndpoint "https://api.example.com"
            $script:Config.AgentToken | Should -Be "my-token"
        }
    }

    Describe "Utils" {
        It "Write-Log should not throw" {
            { Write-Log "Test message" "INFO" } | Should -Not -Throw
        }

        It "Test-CommandExists returns true for powershell" {
            Test-CommandExists "powershell" | Should -Be $true
        }

        It "Test-CommandExists returns false for nonexistent" {
            Test-CommandExists "nonexistent_command_xyz" | Should -Be $false
        }
    }

    Describe "HMAC" {
        It "Compute-HMAC returns non-empty string" {
            $result = Compute-HMAC -Message "test" -Secret "secret"
            $result | Should -Not -BeNullOrEmpty
        }

        It "Compute-HMAC is deterministic" {
            $hmac1 = Compute-HMAC -Message "hello" -Secret "key123"
            $hmac2 = Compute-HMAC -Message "hello" -Secret "key123"
            $hmac1 | Should -Be $hmac2
        }

        It "Compute-HMAC returns different values for different messages" {
            $hmac1 = Compute-HMAC -Message "message-a" -Secret "key"
            $hmac2 = Compute-HMAC -Message "message-b" -Secret "key"
            $hmac1 | Should -Not -Be $hmac2
        }

        It "Compute-HMAC returns different values for different secrets" {
            $hmac1 = Compute-HMAC -Message "hello" -Secret "key1"
            $hmac2 = Compute-HMAC -Message "hello" -Secret "key2"
            $hmac1 | Should -Not -Be $hmac2
        }

        It "Test-HMAC validates correct signature" {
            $msg = "test payload"
            $secret = "mysecret"
            $sig = Compute-HMAC -Message $msg -Secret $secret
            Test-HMAC -Message $msg -Signature $sig -Secret $secret | Should -Be $true
        }

        It "Test-HMAC rejects wrong signature" {
            Test-HMAC -Message "test" -Signature "wrong" -Secret "secret" | Should -Be $false
        }

        It "Test-HMAC rejects empty signature" {
            Test-HMAC -Message "test" -Signature "" -Secret "secret" | Should -Be $false
        }
    }

    Describe "Crypto" {
        It "Get-PayloadHash returns 64-char hex string" {
            $hash = Get-PayloadHash -Payload "test"
            $hash.Length | Should -Be 64
            $hash | Should -Match "^[0-9a-f]{64}$"
        }

        It "Get-PayloadHash is deterministic" {
            $h1 = Get-PayloadHash -Payload "consistency"
            $h2 = Get-PayloadHash -Payload "consistency"
            $h1 | Should -Be $h2
        }

        It "Get-PayloadHash returns different values for different inputs" {
            $h1 = Get-PayloadHash -Payload "input-a"
            $h2 = Get-PayloadHash -Payload "input-b"
            $h1 | Should -Not -Be $h2
        }
    }

    Describe "Telemetry" {
        It "Get-SystemTelemetry returns a hashtable" {
            Initialize-Config -AgentToken "test" -HmacSecret "test" -ApiEndpoint "https://test.example.com"
            $script:Config.AgentId = "test-agent-id"
            $script:Config.TenantId = "test-tenant-id"
            $result = Get-SystemTelemetry
            $result | Should -BeOfType [hashtable]
        }

        It "Get-SystemTelemetry contains required keys" {
            Initialize-Config -AgentToken "test" -HmacSecret "test" -ApiEndpoint "https://test.example.com"
            $script:Config.AgentId = "test-agent-id"
            $script:Config.TenantId = "test-tenant-id"
            $result = Get-SystemTelemetry
            $result.Keys | Should -Contain "agent_id"
            $result.Keys | Should -Contain "tenant_id"
            $result.Keys | Should -Contain "timestamp"
            $result.Keys | Should -Contain "hostname"
        }

        It "Get-SystemTelemetry agent_id matches config" {
            Initialize-Config -AgentToken "test" -HmacSecret "test" -ApiEndpoint "https://test.example.com"
            $script:Config.AgentId = "agent-123"
            $script:Config.TenantId = "tenant-456"
            $result = Get-SystemTelemetry
            $result.agent_id | Should -Be "agent-123"
            $result.tenant_id | Should -Be "tenant-456"
        }
    }

    Describe "Self-Heal" {
        It "Get-BOMSafeFileHash returns 64-char hex for a temp file" {
            $tmpFile = [System.IO.Path]::GetTempFileName()
            try {
                Set-Content -Path $tmpFile -Value "test content" -NoNewline
                $hash = Get-BOMSafeFileHash -FilePath $tmpFile
                $hash.Length | Should -Be 64
                $hash | Should -Match "^[0-9a-f]{64}$"
            }
            finally {
                Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
            }
        }

        It "Get-BOMSafeFileHash is deterministic" {
            $tmpFile = [System.IO.Path]::GetTempFileName()
            try {
                Set-Content -Path $tmpFile -Value "deterministic" -NoNewline
                $h1 = Get-BOMSafeFileHash -FilePath $tmpFile
                $h2 = Get-BOMSafeFileHash -FilePath $tmpFile
                $h1 | Should -Be $h2
            }
            finally {
                Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
            }
        }

        It "Get-BOMSafeFileHash strips BOM correctly" {
            $tmpWithBOM = [System.IO.Path]::GetTempFileName()
            $tmpWithout = [System.IO.Path]::GetTempFileName()
            try {
                # Write file with BOM
                $bom = [byte[]](0xEF, 0xBB, 0xBF)
                $content = [System.Text.Encoding]::UTF8.GetBytes("hello world")
                $allBytes = $bom + $content
                [System.IO.File]::WriteAllBytes($tmpWithBOM, $allBytes)
                
                # Write file without BOM
                [System.IO.File]::WriteAllBytes($tmpWithout, $content)
                
                $hashBOM = Get-BOMSafeFileHash -FilePath $tmpWithBOM
                $hashNoBOM = Get-BOMSafeFileHash -FilePath $tmpWithout
                $hashBOM | Should -Be $hashNoBOM
            }
            finally {
                Remove-Item $tmpWithBOM -Force -ErrorAction SilentlyContinue
                Remove-Item $tmpWithout -Force -ErrorAction SilentlyContinue
            }
        }

        It "Get-BOMSafeFileHash throws for nonexistent file" {
            { Get-BOMSafeFileHash -FilePath "C:\nonexistent_file_xyz.tmp" } | Should -Throw
        }

        It "Invoke-SelfHeal should not throw" {
            $script:FaultCount = 0
            { Invoke-SelfHeal } | Should -Not -Throw
        }
    }

    Describe "Job Runner" {
        It "Circuit breaker variables are initialized" {
            . "$PSScriptRoot\..\modules\job-runner.ps1"
            $script:ConsecutiveFailures | Should -Be 0
            $script:CircuitBreakerOpen | Should -Be $false
        }
    }
}
