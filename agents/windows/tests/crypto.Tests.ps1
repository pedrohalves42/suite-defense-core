BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }
    . "$PSScriptRoot\..\modules\crypto.ps1"
}

Describe "Initialize-Crypto" {
    It "Returns true on successful initialization" {
        $result = Initialize-Crypto
        $result | Should -BeTrue
    }

    It "Sets UseECDSA or CryptoProvider" {
        Initialize-Crypto | Out-Null
        ($script:UseECDSA -or $null -ne $script:CryptoProvider) | Should -BeTrue
    }
}

Describe "Get-PayloadHash" {
    It "Returns a 64-char hex string" {
        $hash = Get-PayloadHash -Payload "test-payload"
        $hash.Length | Should -Be 64
        $hash | Should -Match '^[0-9a-f]{64}$'
    }

    It "Returns consistent results" {
        $h1 = Get-PayloadHash -Payload "consistent"
        $h2 = Get-PayloadHash -Payload "consistent"
        $h1 | Should -Be $h2
    }

    It "Returns different hashes for different payloads" {
        $h1 = Get-PayloadHash -Payload "payload-a"
        $h2 = Get-PayloadHash -Payload "payload-b"
        $h1 | Should -Not -Be $h2
    }

    It "Handles empty payload" {
        $hash = Get-PayloadHash -Payload ""
        $hash.Length | Should -Be 64
    }
}

Describe "Sign-Payload" {
    BeforeAll {
        Initialize-Crypto | Out-Null
    }

    It "Returns a non-empty base64 signature" {
        $sig = Sign-Payload -Payload "test-data"
        $sig | Should -Not -BeNullOrEmpty
        { [Convert]::FromBase64String($sig) } | Should -Not -Throw
    }

    It "Returns different signatures for different payloads" {
        $s1 = Sign-Payload -Payload "data-a"
        $s2 = Sign-Payload -Payload "data-b"
        $s1 | Should -Not -Be $s2
    }
}
