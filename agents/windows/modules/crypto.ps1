<#
.SYNOPSIS
    Cryptographic functions (SHA-256 hashing only)
    v7.0: Removed dead ECDSA/RSA Sign-Payload code.
    All agent auth uses HMAC (see hmac.ps1 + network.ps1).
#>

function Get-PayloadHash {
    param([string]$Payload)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $hash = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Payload))
    $sha256.Dispose()
    return ($hash | ForEach-Object { $_.ToString("x2") }) -join ""
}
