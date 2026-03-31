BeforeAll {
    . "$PSScriptRoot\..\modules\hmac.ps1"
}

Describe "Compute-HMAC" {
    It "Returns a non-empty lowercase hex string (64 chars)" {
        $result = Compute-HMAC -Message "hello" -Secret "secret"
        $result | Should -Not -BeNullOrEmpty
        $result | Should -MatchExactly '^[0-9a-f]{64}$'
    }

    It "Returns consistent results for same input" {
        $r1 = Compute-HMAC -Message "test-message" -Secret "key123"
        $r2 = Compute-HMAC -Message "test-message" -Secret "key123"
        $r1 | Should -Be $r2
    }

    It "Returns different results for different messages" {
        $r1 = Compute-HMAC -Message "message-a" -Secret "key"
        $r2 = Compute-HMAC -Message "message-b" -Secret "key"
        $r1 | Should -Not -Be $r2
    }

    It "Returns different results for different secrets" {
        $r1 = Compute-HMAC -Message "message" -Secret "key-a"
        $r2 = Compute-HMAC -Message "message" -Secret "key-b"
        $r1 | Should -Not -Be $r2
    }

    It "Decodes hex secret correctly (64-char hex key)" {
        $hexSecret = "aa" * 32
        $result = Compute-HMAC -Message "test" -Secret $hexSecret
        $result | Should -MatchExactly '^[0-9a-f]{64}$'
    }

    It "Falls back to UTF-8 for non-hex secrets" {
        $result = Compute-HMAC -Message "test" -Secret "not-a-hex-key"
        $result | Should -MatchExactly '^[0-9a-f]{64}$'
    }
}

Describe "New-HmacNonce" {
    It "Returns a 32-char lowercase hex string" {
        $nonce = New-HmacNonce
        $nonce | Should -MatchExactly '^[0-9a-f]{32}$'
    }

    It "Returns unique values on consecutive calls" {
        $n1 = New-HmacNonce
        $n2 = New-HmacNonce
        $n1 | Should -Not -Be $n2
    }
}

Describe "Test-HMAC" {
    It "Returns true for valid signature" {
        $sig = Compute-HMAC -Message "test" -Secret "mysecret"
        $result = Test-HMAC -Message "test" -Signature $sig -Secret "mysecret"
        $result | Should -BeTrue
    }

    It "Returns false for invalid signature" {
        $result = Test-HMAC -Message "test" -Signature "00" * 32 -Secret "mysecret"
        $result | Should -BeFalse
    }

    It "Returns false for tampered message" {
        $sig = Compute-HMAC -Message "original" -Secret "key"
        $result = Test-HMAC -Message "tampered" -Signature $sig -Secret "key"
        $result | Should -BeFalse
    }

    It "Returns false for wrong secret" {
        $sig = Compute-HMAC -Message "test" -Secret "correct-key"
        $result = Test-HMAC -Message "test" -Signature $sig -Secret "wrong-key"
        $result | Should -BeFalse
    }

    It "Returns false for different-length signature" {
        $result = Test-HMAC -Message "test" -Signature "short" -Secret "key"
        $result | Should -BeFalse
    }
}
