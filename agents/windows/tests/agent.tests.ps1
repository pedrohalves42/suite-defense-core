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

        It "Test-HMAC validates correct signature" {
            $msg = "test payload"
            $secret = "mysecret"
            $sig = Compute-HMAC -Message $msg -Secret $secret
            Test-HMAC -Message $msg -Signature $sig -Secret $secret | Should -Be $true
        }

        It "Test-HMAC rejects wrong signature" {
            Test-HMAC -Message "test" -Signature "wrong" -Secret "secret" | Should -Be $false
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
    }
}
