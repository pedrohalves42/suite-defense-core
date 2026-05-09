<#
.SYNOPSIS
    HMAC computation and verification -- HEX output (aligned with Unix agents)
#>

function Compute-HMAC {
    param(
        [string]$Message,
        [string]$Secret
    )

    # Cache HMAC object and key bytes to optimize IOPS/CPU
    if ($null -eq $Global:CachedHmacObject -or $Global:CachedHmacSecret -ne $Secret) {
        if ($Global:CachedHmacObject) { $Global:CachedHmacObject.Dispose() }
        
        $keyBytes = if ($Secret -match '^[0-9a-fA-F]{64}$') {
            $bytes = [byte[]]::new(32)
            for ($i = 0; $i -lt 64; $i += 2) {
                $bytes[$i / 2] = [Convert]::ToByte($Secret.Substring($i, 2), 16)
            }
            $bytes
        } else {
            [System.Text.Encoding]::UTF8.GetBytes($Secret)
        }

        $Global:CachedHmacObject = New-Object System.Security.Cryptography.HMACSHA256
        $Global:CachedHmacObject.Key = $keyBytes
        $Global:CachedHmacSecret = $Secret
    }

    $hash = $Global:CachedHmacObject.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Message))
    
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
