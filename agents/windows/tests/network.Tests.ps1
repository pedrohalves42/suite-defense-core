BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }

    $Global:AgentName = "test-agent"
    $Global:AgentVersion = "6.0.0"
    $Global:ServerUrl = "https://test.example.com"
    $Global:AgentToken = "test-token"
    $Global:HmacSecret = $null
    $Global:CachedHmacKey = $null
    $Global:TlsPinnedThumbprint = $null
    $Global:CachedNetworkOk = $false
    $Global:CachedNetworkCheckTime = [datetime]::MinValue
    $Global:LoopTimestamp = $null
    $Global:DnsBlocklistPath = "$env:TEMP\CyberShield\test-network\dns_blocklist.json"

    $testDir = "$env:TEMP\CyberShield\test-network"
    if (-not (Test-Path $testDir)) { New-Item -ItemType Directory -Path $testDir -Force | Out-Null }

    # Need hmac.ps1 for HMAC functions used by network.ps1
    . "$PSScriptRoot\..\modules\hmac.ps1"
    . "$PSScriptRoot\..\modules\network.ps1"
}

Describe "Test-TlsCertificatePin" {
    It "Returns true when no pin is set" {
        $Global:TlsPinnedThumbprint = $null
        Test-TlsCertificatePin -Thumbprint "abc123" | Should -BeTrue
    }

    It "Returns true for matching thumbprint" {
        $Global:TlsPinnedThumbprint = "ABC123"
        Test-TlsCertificatePin -Thumbprint "ABC123" | Should -BeTrue
    }

    It "Returns false for non-matching thumbprint" {
        $Global:TlsPinnedThumbprint = "ABC123"
        Test-TlsCertificatePin -Thumbprint "DEF456" | Should -BeFalse
    }
}

Describe "Test-DnsBlock" {
    It "Returns false when blocklist doesn't exist" {
        $Global:DnsBlocklistPath = "$env:TEMP\CyberShield\test-network\nonexistent.json"
        Test-DnsBlock -Domain "example.com" | Should -BeFalse
    }

    It "Returns true for blocked domain" {
        $blockFile = "$env:TEMP\CyberShield\test-network\dns_test.json"
        @{ domains = @("malware.com", "phishing.net") } | ConvertTo-Json | Out-File $blockFile -Encoding UTF8
        $Global:DnsBlocklistPath = $blockFile
        Test-DnsBlock -Domain "malware.com" | Should -BeTrue
        Remove-Item $blockFile -Force -ErrorAction SilentlyContinue
    }

    It "Returns false for non-blocked domain" {
        $blockFile = "$env:TEMP\CyberShield\test-network\dns_test2.json"
        @{ domains = @("malware.com") } | ConvertTo-Json | Out-File $blockFile -Encoding UTF8
        $Global:DnsBlocklistPath = $blockFile
        Test-DnsBlock -Domain "google.com" | Should -BeFalse
        Remove-Item $blockFile -Force -ErrorAction SilentlyContinue
    }
}

Describe "Invoke-SecureRequest" {
    It "Returns failure for invalid URL" {
        $result = Invoke-SecureRequest -Path "https://invalid.test.local/nope" -Method "GET" -MaxRetries 0 -TimeoutSec 2
        $result.Success | Should -BeFalse
    }
}

AfterAll {
    Remove-Item "$env:TEMP\CyberShield\test-network" -Recurse -Force -ErrorAction SilentlyContinue
}
