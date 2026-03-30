<#
.SYNOPSIS
    HMAC computation and verification
#>

function Compute-HMAC {
    param(
        [string]$Message,
        [string]$Secret
    )

    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($Secret)
    $hash = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Message))
    $hmac.Dispose()
    return [Convert]::ToBase64String($hash)
}

function Test-HMAC {
    param(
        [string]$Message,
        [string]$Signature,
        [string]$Secret
    )

    $expected = Compute-HMAC -Message $Message -Secret $Secret
    # Constant-time comparison
    if ($expected.Length -ne $Signature.Length) { return $false }

    $diff = 0
    for ($i = 0; $i -lt $expected.Length; $i++) {
        $diff = $diff -bor ([byte]$expected[$i] -bxor [byte]$Signature[$i])
    }
    return $diff -eq 0
}
