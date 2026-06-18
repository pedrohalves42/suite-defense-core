<#
.SYNOPSIS
    HMAC computation and verification -- HEX output (aligned with Unix agents)

.NOTES
    Phase 6.1 (ADR-003): cache state moved from $Global:CachedHmacObject /
    $Global:CachedHmacSecret to module-private $script: scope. The cache is
    purely internal to this module — no other module reads it — so the
    refactor is invisible to callers and removes 6 globals from the legacy
    surface tracked by the no-new-globals gate.
#>

# Module-private HMAC cache (Phase 6.1)
$script:CachedHmacObject = $null
$script:CachedHmacSecret = $null

function Compute-HMAC {
    param(
        [string]$Message,
        [string]$Secret
    )

    # Cache HMAC object and key bytes to optimize IOPS/CPU
    if ($null -eq $script:CachedHmacObject -or $script:CachedHmacSecret -ne $Secret) {
        if ($script:CachedHmacObject) { $script:CachedHmacObject.Dispose() }

        $keyBytes = if ($Secret -match '^[0-9a-fA-F]{64}$') {
            $bytes = [byte[]]::new(32)
            for ($i = 0; $i -lt 64; $i += 2) {
                $bytes[$i / 2] = [Convert]::ToByte($Secret.Substring($i, 2), 16)
            }
            $bytes
        } else {
            [System.Text.Encoding]::UTF8.GetBytes($Secret)
        }

        $script:CachedHmacObject = New-Object System.Security.Cryptography.HMACSHA256
        $script:CachedHmacObject.Key = $keyBytes
        $script:CachedHmacSecret = $Secret
    }

    # Use UTF8 without BOM explicitly to ensure cross-platform compatibility
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $hash = $script:CachedHmacObject.ComputeHash($utf8NoBom.GetBytes($Message))

    # Output as lowercase hex (aligned with Unix agents and backend)
    return ([BitConverter]::ToString($hash) -replace '-', '').ToLower()
}


function New-HmacNonce {
    <#
    .SYNOPSIS
        Generates a cryptographically secure nonce (32 hex chars / 16 bytes)
    #>
    $bytes = [byte[]]::new(16)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return ([BitConverter]::ToString($bytes) -replace '-', '').ToLower()
}

function Test-HMAC {
    param(
        [string]$Message,
        [string]$Signature,
        [string]$Secret
    )

    $expected = Compute-HMAC -Message $Message -Secret $Secret
    # Constant-time comparison (both are lowercase hex of same length)
    if ($expected.Length -ne $Signature.Length) { return $false }

    $diff = 0
    for ($i = 0; $i -lt $expected.Length; $i++) {
        $diff = $diff -bor ([byte][char]$expected[$i] -bxor [byte][char]$Signature[$i])
    }
    return $diff -eq 0
}
