BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }
    . "$PSScriptRoot\..\modules\crypto.ps1"
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
