BeforeAll {
    # Mock dependencies
    function Write-Log { param([string]$Message, [string]$Level) }
    
    # Source the module
    . "$PSScriptRoot\..\modules\config.ps1"
}

Describe "Initialize-Config" {
    BeforeEach {
        # Clean up directories
        if (Test-Path "$env:TEMP\CyberShield") { Remove-Item "$env:TEMP\CyberShield" -Recurse -Force }
    }

    It "Creates required directories" {
        Initialize-Config -AgentToken "test-token" -HmacSecret "test-secret" -ApiEndpoint "https://api.example.com"
        "$env:ProgramData\CyberShield" | Should -Exist
    }

    It "Sets AgentToken from parameter" {
        Initialize-Config -AgentToken "my-token" -HmacSecret "s" -ApiEndpoint "https://api.example.com"
        $script:Config.AgentToken | Should -Be "my-token"
    }

    It "Sets ApiEndpoint from parameter" {
        Initialize-Config -AgentToken "t" -HmacSecret "s" -ApiEndpoint "https://api.example.com"
        $script:Config.ApiEndpoint | Should -Be "https://api.example.com"
    }

    It "Falls back to env var for ApiEndpoint" {
        $env:CYBERSHIELD_API_ENDPOINT = "https://env-api.example.com"
        Initialize-Config -AgentToken "t" -HmacSecret "s" -ApiEndpoint ""
        $script:Config.ApiEndpoint | Should -Be "https://env-api.example.com"
        Remove-Item Env:CYBERSHIELD_API_ENDPOINT -ErrorAction SilentlyContinue
    }

    It "Has correct default version" {
        $script:Config.Version | Should -Be "6.0.0"
    }

    It "Has correct default heartbeat interval" {
        $script:Config.HeartbeatInterval | Should -Be 60
    }
}

Describe "Get-SecretValue" {
    It "Returns fallback when file doesn't exist" {
        $result = Get-SecretValue -Name "nonexistent_secret" -Fallback "fallback-val"
        $result | Should -Be "fallback-val"
    }

    It "Returns file content when secret file exists" {
        $secretDir = "$env:ProgramData\CyberShield\secrets"
        if (-not (Test-Path $secretDir)) { New-Item -ItemType Directory -Path $secretDir -Force | Out-Null }
        "file-secret-value" | Out-File "$secretDir\test_secret" -Encoding UTF8 -NoNewline
        $result = Get-SecretValue -Name "test_secret" -Fallback "fallback"
        $result | Should -Be "file-secret-value"
        Remove-Item "$secretDir\test_secret" -Force -ErrorAction SilentlyContinue
    }
}

Describe "Export-PersistedState / Import-PersistedState" {
    BeforeAll {
        $script:DataDir = "$env:TEMP\CyberShield\test-data"
        if (-not (Test-Path $script:DataDir)) { New-Item -ItemType Directory -Path $script:DataDir -Force | Out-Null }
    }

    It "Exports state to JSON file" {
        $Global:BootScriptHash = "abc123hash"
        Export-PersistedState
        "$script:DataDir\state.json" | Should -Exist
        $state = Get-Content "$script:DataDir\state.json" -Raw | ConvertFrom-Json
        $state.boot_hash | Should -Be "abc123hash"
        $state.version | Should -Be "6.0.0"
    }

    It "Imports persisted state" {
        $Global:BootScriptHash = ""
        @{ boot_hash = "restored_hash"; version = "6.0.0" } | ConvertTo-Json | Out-File "$script:DataDir\state.json" -Encoding UTF8
        Import-PersistedState
        $Global:BootScriptHash | Should -Be "restored_hash"
    }

    AfterAll {
        Remove-Item "$env:TEMP\CyberShield\test-data" -Recurse -Force -ErrorAction SilentlyContinue
    }
}
