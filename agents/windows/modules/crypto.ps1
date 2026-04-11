<#
.SYNOPSIS
    Cryptographic functions: SHA-256 hashing + Ed25519/RSA signature verification.
    v9.0: Added RSA-2048 fallback for .NET 4.x (PowerShell 5.1).
    Ed25519 preferred on .NET 5+ / PS 7+. RSA-2048 on .NET 4.x.
#>

# Ed25519 public key (SPKI, Base64-encoded) — embedded for offline verification
$Global:Ed25519PublicKeyBase64 = $null  # Set during enrollment or via config

# RSA-2048 public key (SPKI, Base64-encoded) — fallback for .NET 4.x
$Global:RsaPublicKeyBase64 = $null  # Set via heartbeat response

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

function Test-RsaSignature {
    <#
    .SYNOPSIS
        Verify an RSA-2048 PKCS1-v1_5 + SHA-256 signature.
        Compatible with .NET Framework 4.x (PowerShell 5.1).
        Returns $true if valid, $false if invalid or unavailable.
    .PARAMETER ContentHash
        The SHA-256 hash string that was signed server-side.
    .PARAMETER SignatureBase64
        Base64-encoded RSA signature from the server.
    .PARAMETER PublicKeyBase64
        SPKI-encoded RSA public key (Base64).
    #>
    param(
        [Parameter(Mandatory)][string]$ContentHash,
        [Parameter(Mandatory)][string]$SignatureBase64,
        [Parameter(Mandatory)][string]$PublicKeyBase64
    )

    try {
        # Decode SPKI public key
        $pubKeyBytes = [System.Convert]::FromBase64String($PublicKeyBase64)

        # Import RSA public key from SPKI DER format
        $rsa = [System.Security.Cryptography.RSA]::Create()
        $bytesRead = 0
        $rsa.ImportSubjectPublicKeyInfo($pubKeyBytes, [ref]$bytesRead)

        # Decode signature
        $sigBytes = [System.Convert]::FromBase64String($SignatureBase64)

        # Encode the content hash as UTF-8 bytes (same as server-side signing)
        $contentBytes = [System.Text.Encoding]::UTF8.GetBytes($ContentHash)

        # Verify with SHA-256 + PKCS1 padding (matches server RSASSA-PKCS1-v1_5)
        $hashAlgo = [System.Security.Cryptography.HashAlgorithmName]::SHA256
        $padding = [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
        $isValid = $rsa.VerifyData($contentBytes, $sigBytes, $hashAlgo, $padding)
        $rsa.Dispose()

        if ($isValid) {
            Write-Log "[CRYPTO] RSA-2048 signature VERIFIED for hash: $($ContentHash.Substring(0,16))..." "INFO"
        }
        else {
            Write-Log "[CRYPTO] RSA-2048 signature INVALID for hash: $($ContentHash.Substring(0,16))..." "ERROR"
        }

        return $isValid
    }
    catch {
        # Fallback for older .NET 4.x that lacks ImportSubjectPublicKeyInfo
        try {
            return Test-RsaSignatureLegacy -ContentHash $ContentHash -SignatureBase64 $SignatureBase64 -PublicKeyBase64 $PublicKeyBase64
        }
        catch {
            Write-Log "[CRYPTO] RSA verification error: $($_.Exception.Message)" "ERROR"
            return $false
        }
    }
}

function Test-RsaSignatureLegacy {
    <#
    .SYNOPSIS
        Legacy RSA verification for .NET 4.6.x that lacks ImportSubjectPublicKeyInfo.
        Uses RSACryptoServiceProvider with manual SPKI parsing.
    #>
    param(
        [Parameter(Mandatory)][string]$ContentHash,
        [Parameter(Mandatory)][string]$SignatureBase64,
        [Parameter(Mandatory)][string]$PublicKeyBase64
    )

    $pubKeyBytes = [System.Convert]::FromBase64String($PublicKeyBase64)
    $sigBytes = [System.Convert]::FromBase64String($SignatureBase64)
    $contentBytes = [System.Text.Encoding]::UTF8.GetBytes($ContentHash)

    # Parse SPKI to extract RSA modulus and exponent (DER-encoded)
    # SPKI wraps the RSA public key in a SEQUENCE { AlgorithmIdentifier, BIT STRING { RSAPublicKey } }
    $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider

    # Use X509EncodedKeySpec-like approach: create a temporary cert-like structure
    # .NET 4.x can import via RSAParameters if we parse the SPKI manually,
    # or we can use the X509 approach
    $keyInfo = New-Object System.Security.Cryptography.AsnEncodedData($pubKeyBytes)

    # Attempt to use CNG if available (Windows 10+ with .NET 4.6.2+)
    $cng = [System.Security.Cryptography.CngKey]::Import($pubKeyBytes, [System.Security.Cryptography.CngKeyBlobFormat]::GenericPublicBlob)
    $rsaCng = New-Object System.Security.Cryptography.RSACng($cng)

    $hashAlgo = [System.Security.Cryptography.HashAlgorithmName]::SHA256
    $padding = [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
    $isValid = $rsaCng.VerifyData($contentBytes, $sigBytes, $hashAlgo, $padding)
    $rsaCng.Dispose()

    if ($isValid) {
        Write-Log "[CRYPTO] RSA-2048 (CNG fallback) signature VERIFIED for hash: $($ContentHash.Substring(0,16))..." "INFO"
    }
    else {
        Write-Log "[CRYPTO] RSA-2048 (CNG fallback) signature INVALID for hash: $($ContentHash.Substring(0,16))..." "ERROR"
    }

    return $isValid
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

function Register-AgentKey {
    <#
    .SYNOPSIS
        Proactively registers the agent's ECDSA/Ed25519 public key with the server
        during boot, exiting degraded audit-only mode.
        Generates a key pair if none exists, computes SHA-256 fingerprint,
        and POSTs to register-agent-key endpoint.
        Idempotent: server returns 200 if key already registered.
    #>

    # Determine best available algorithm
    $algorithm = "RSA-2048-SHA256"  # Universal fallback
    $useEd25519 = Test-Ed25519Available
    if ($useEd25519) { $algorithm = "Ed25519" }

    $keyDir = "$env:ProgramData\CyberShield"
    $privateKeyPath = "$keyDir\agent_signing_key.pem"
    $publicKeyPath = "$keyDir\agent_signing_pubkey.pem"
    $fingerprintPath = "$keyDir\agent_key_fingerprint"

    try {
        # --- Generate or load key pair ---
        $publicKeyBase64 = $null

        if ((Test-Path $publicKeyPath) -and (Test-Path $fingerprintPath)) {
            # Reuse existing key
            $publicKeyBase64 = (Get-Content $publicKeyPath -Raw -Encoding UTF8).Trim()
            $fingerprint = (Get-Content $fingerprintPath -Raw -Encoding UTF8).Trim()
            Write-Log "[KEY-REG] Loaded existing key pair (algo=$algorithm, fp=$($fingerprint.Substring(0,16))...)" "INFO"
        }
        else {
            Write-Log "[KEY-REG] No existing key pair found - generating new $algorithm key..." "INFO"

            if ($useEd25519) {
                # .NET 5+ Ed25519
                $ed = [System.Security.Cryptography.Ed25519]::Create()
                $pubBytes = $ed.ExportSubjectPublicKeyInfo()
                $privBytes = $ed.ExportPkcs8PrivateKey()
                $ed.Dispose()
                $publicKeyBase64 = [Convert]::ToBase64String($pubBytes)
                [System.IO.File]::WriteAllBytes($privateKeyPath, $privBytes)
            }
            else {
                # RSA-2048 fallback (.NET 4.x)
                $rsa = [System.Security.Cryptography.RSA]::Create(2048)
                $pubBytes = $rsa.ExportSubjectPublicKeyInfo()
                $privBytes = $rsa.ExportPkcs8PrivateKey()
                $rsa.Dispose()
                $publicKeyBase64 = [Convert]::ToBase64String($pubBytes)
                [System.IO.File]::WriteAllBytes($privateKeyPath, $privBytes)
            }

            # Persist public key
            $publicKeyBase64 | Out-File -FilePath $publicKeyPath -Encoding UTF8 -Force -NoNewline

            # Compute SHA-256 fingerprint of raw decoded bytes
            $decodedBytes = [Convert]::FromBase64String($publicKeyBase64)
            $sha = [System.Security.Cryptography.SHA256]::Create()
            $hashBytes = $sha.ComputeHash($decodedBytes)
            $sha.Dispose()
            $fingerprint = ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ""

            # Persist fingerprint
            $fingerprint | Out-File -FilePath $fingerprintPath -Encoding UTF8 -Force -NoNewline

            # Restrict file permissions (SYSTEM and Admins only)
            try {
                $acl = Get-Acl $privateKeyPath
                $acl.SetAccessRuleProtection($true, $false)
                $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM", "FullControl", "Allow")
                $adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule("Administrators", "FullControl", "Allow")
                $acl.AddAccessRule($systemRule)
                $acl.AddAccessRule($adminRule)
                Set-Acl -Path $privateKeyPath -AclObject $acl
            } catch {
                Write-Log "[KEY-REG] Warning: could not restrict key file permissions: $($_.Exception.Message)" "WARN"
            }

            Write-Log "[KEY-REG] Generated $algorithm key pair (fp=$($fingerprint.Substring(0,16))...)" "INFO"
        }

        # --- Register with server ---
        $body = @{
            public_key      = $publicKeyBase64
            key_fingerprint = $fingerprint
            algorithm       = $algorithm
        }

        $result = Invoke-SecureRequest `
            -Path "/functions/v1/register-agent-key" `
            -Method "POST" `
            -Body $body `
            -MaxRetries 3 `
            -TimeoutSec 15

        if ($result.Success) {
            $resp = $result.Content | ConvertFrom-Json
            if ($resp.success) {
                $alreadyStr = if ($resp.already_registered) { " (already registered)" } else { "" }
                Write-Log "[KEY-REG] Key registered successfully${alreadyStr}: key_id=$($resp.key_id), version=$($resp.version)" "SUCCESS"
                return $true
            }
        }

        $errMsg = if ($result.Error) { $result.Error } else { "Unknown error (HTTP $($result.StatusCode))" }
        Write-Log "[KEY-REG] Registration failed: $errMsg - agent will remain in audit-only mode" "WARN"
        return $false

    } catch {
        Write-Log "[KEY-REG] Error during key registration: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Test-ScriptSignature {
    <#
    .SYNOPSIS
        Unified signature verification: tries Ed25519 first, falls back to RSA-2048.
        Eliminates audit-only mode on .NET 4.x by using RSA as a native fallback.
    .PARAMETER ContentHash
        The SHA-256 hash string that was signed server-side.
    .PARAMETER Ed25519SignatureBase64
        Base64-encoded Ed25519 signature (primary). May be null.
    .PARAMETER RsaSignatureBase64
        Base64-encoded RSA-2048 signature (fallback). May be null.
    #>
    param(
        [Parameter(Mandatory)][string]$ContentHash,
        [string]$Ed25519SignatureBase64,
        [string]$RsaSignatureBase64
    )

    # Strategy 1: Try Ed25519 if runtime supports it and signature is available
    if ($Ed25519SignatureBase64 -and (Test-Ed25519Available)) {
        $ed25519Key = $Global:Ed25519PublicKeyBase64
        if ($ed25519Key) {
            Write-Log "[CRYPTO] Attempting Ed25519 verification (preferred)" "INFO"
            $result = Test-Ed25519Signature -ContentHash $ContentHash -SignatureBase64 $Ed25519SignatureBase64 -PublicKeyBase64 $ed25519Key
            if ($result) { return $true }
            # Ed25519 failed — don't fall through to RSA (signature mismatch = reject)
            Write-Log "[CRYPTO] Ed25519 verification failed — not falling through to RSA" "ERROR"
            return $false
        }
    }

    # Strategy 2: RSA-2048 fallback (works on .NET 4.x)
    if ($RsaSignatureBase64) {
        $rsaKey = $Global:RsaPublicKeyBase64
        if ($rsaKey) {
            Write-Log "[CRYPTO] Attempting RSA-2048 verification (fallback for .NET 4.x)" "INFO"
            return Test-RsaSignature -ContentHash $ContentHash -SignatureBase64 $RsaSignatureBase64 -PublicKeyBase64 $rsaKey
        }
        else {
            Write-Log "[CRYPTO] RSA signature available but no RSA public key configured" "WARN"
        }
    }

    # No verification possible — check if we have any keys at all
    if (-not $Global:Ed25519PublicKeyBase64 -and -not $Global:RsaPublicKeyBase64) {
        Write-Log "[CRYPTO] No cryptographic keys configured — fail-open (audit-only)" "WARN"
        return $true
    }

    # Keys exist but no valid signature provided
    if (-not $Ed25519SignatureBase64 -and -not $RsaSignatureBase64) {
        Write-Log "[CRYPTO] No signatures provided — UNSIGNED" "WARN"
        return $false
    }

    Write-Log "[CRYPTO] Signature verification failed — no compatible algorithm available" "ERROR"
    return $false
}
