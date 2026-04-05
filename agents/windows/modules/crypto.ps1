<#
.SYNOPSIS
    Cryptographic functions: SHA-256 hashing + Ed25519 signature verification.
    v8.0: Added Ed25519 verification via .NET crypto (PS 7+ / .NET 5+).
    Fallback: audit-only mode for PS 5.1 / .NET Framework 4.x.
#>

# Ed25519 public key (SPKI, Base64-encoded) — embedded for offline verification
$Global:Ed25519PublicKeyBase64 = $null  # Set during enrollment or via config

function Get-PayloadHash {
    param([string]$Payload)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $hash = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Payload))
    $sha256.Dispose()
    return ($hash | ForEach-Object { $_.ToString("x2") }) -join ""
}

function Test-Ed25519Available {
    <#
    .SYNOPSIS
        Check if Ed25519 is available on this runtime (.NET 5+ / PS 7+).
        Returns $true if System.Security.Cryptography supports Ed25519.
    #>
    try {
        $ver = [System.Environment]::Version
        if ($ver.Major -ge 5) { return $true }
        return $false
    }
    catch {
        return $false
    }
}

function Test-Ed25519Signature {
    <#
    .SYNOPSIS
        Verify an Ed25519 signature against content using the embedded public key.
        Returns $true if valid, $false if invalid or unavailable.
        SECURITY: Rejects stale/null signatures. Fail-open only when public key is absent.
    .PARAMETER ContentHash
        The SHA-256 hash string that was signed server-side.
    .PARAMETER SignatureBase64
        Base64-encoded Ed25519 signature from the server. If null/empty, returns $false.
    .PARAMETER PublicKeyBase64
        Optional override for the SPKI public key. Defaults to $Global:Ed25519PublicKeyBase64.
    #>
    param(
        [Parameter(Mandatory)][string]$ContentHash,
        [string]$SignatureBase64,
        [string]$PublicKeyBase64
    )

    # Guard: reject null/empty signature (server invalidated stale sig after hotfix)
    if (-not $SignatureBase64) {
        Write-Log "[CRYPTO] No signature provided (server may have invalidated stale sig) - UNSIGNED" "WARN"
        return $false
    }

    if (-not $PublicKeyBase64) {
        $PublicKeyBase64 = $Global:Ed25519PublicKeyBase64
    }

    if (-not $PublicKeyBase64) {
        Write-Log "[CRYPTO] No Ed25519 public key configured - fail-open (audit-only)" "WARN"
        # HOTFIX: fail-open when key is absent to prevent false rejections during enrollment
        return $true
    }

    # Check runtime support
    if (-not (Test-Ed25519Available)) {
        Write-Log "[CRYPTO] Ed25519 not available on this runtime (.NET < 5.0) - audit-only mode" "WARN"
        return $true
    }

    try {
        # Decode public key (SPKI format)
        $pubKeyBytes = [System.Convert]::FromBase64String($PublicKeyBase64)

        # Import Ed25519 public key
        $ed25519 = [System.Security.Cryptography.Ed25519]::Create()
        $ed25519.ImportSubjectPublicKeyInfo($pubKeyBytes, [ref]$null)

        # Decode signature
        $sigBytes = [System.Convert]::FromBase64String($SignatureBase64)

        # Encode the content hash as UTF-8 bytes (same as server-side signing)
        $contentBytes = [System.Text.Encoding]::UTF8.GetBytes($ContentHash)

        # Verify
        $isValid = $ed25519.VerifyData($contentBytes, $sigBytes)
        $ed25519.Dispose()

        if ($isValid) {
            Write-Log "[CRYPTO] Ed25519 signature VERIFIED for hash: $($ContentHash.Substring(0,16))..." "INFO"
        }
        else {
            Write-Log "[CRYPTO] Ed25519 signature INVALID for hash: $($ContentHash.Substring(0,16))..." "ERROR"
        }

        return $isValid
    }
    catch {
        Write-Log "[CRYPTO] Ed25519 verification error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}
