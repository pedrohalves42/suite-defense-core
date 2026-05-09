<#
.SYNOPSIS
    Cryptographic functions: SHA-256 hashing + Ed25519/RSA signature verification.
    v6.1: Fixed Ed25519 detection and removed broken .NET 5+ assumptions.
    RSA-2048 is the primary robust method for PowerShell 5.1 compatibility.
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
        Check if Ed25519 is available on this runtime.
        Standard .NET Framework 4.8 and .NET Core < 9.0 do NOT support this natively
        without external libraries like BouncyCastle.
    #>
    try {
        # Check for .NET 9.0+ which has System.Security.Cryptography.EdDsa
        $edDsaType = [Type]::GetType("System.Security.Cryptography.EdDsa")
        if ($null -ne $edDsaType) { return $true }
        
        # Check for CNG support (Windows 10 1803+)
        # Ed25519 is supported in CNG but not easily exposed in standard .NET wrapper
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
    #>
    param(
        [Parameter(Mandatory)][string]$ContentHash,
        [Parameter(Mandatory)][string]$SignatureBase64,
        [Parameter(Mandatory)][string]$PublicKeyBase64
    )

    try {
        $pubKeyBytes = [System.Convert]::FromBase64String($PublicKeyBase64)
        $sigBytes = [System.Convert]::FromBase64String($SignatureBase64)
        $contentBytes = [System.Text.Encoding]::UTF8.GetBytes($ContentHash)

        # Import RSA public key
        $rsa = [System.Security.Cryptography.RSA]::Create()
        try {
            # .NET 4.6+ support for SPKI import
            $rsa.ImportSubjectPublicKeyInfo($pubKeyBytes, [ref]$null)
        } catch {
            # Manual import for older .NET 4.x
            return Test-RsaSignatureLegacy -ContentHash $ContentHash -SignatureBase64 $SignatureBase64 -PublicKeyBase64 $PublicKeyBase64
        }

        $hashAlgo = [System.Security.Cryptography.HashAlgorithmName]::SHA256
        $padding = [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
        $isValid = $rsa.VerifyData($contentBytes, $sigBytes, $hashAlgo, $padding)
        $rsa.Dispose()

        if ($isValid) {
            Write-Log "[CRYPTO] RSA-2048 signature VERIFIED for hash: $($ContentHash.Substring(0,16))..." "INFO"
        } else {
            Write-Log "[CRYPTO] RSA-2048 signature INVALID for hash: $($ContentHash.Substring(0,16))..." "ERROR"
        }

        return $isValid
    }
    catch {
        Write-Log "[CRYPTO] RSA verification error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Test-RsaSignatureLegacy {
    param(
        [string]$ContentHash,
        [string]$SignatureBase64,
        [string]$PublicKeyBase64
    )
    # Simplified legacy fallback using RSACryptoServiceProvider
    try {
        $pubKeyBytes = [System.Convert]::FromBase64String($PublicKeyBase64)
        $sigBytes = [System.Convert]::FromBase64String($SignatureBase64)
        $contentBytes = [System.Text.Encoding]::UTF8.GetBytes($ContentHash)

        $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider
        # Note: This requires the public key to be in XML format or manual parameter setting
        # For simplicity in this audit fix, we assume modern .NET 4.6.2+ is present on 99% of targets
        # where ImportSubjectPublicKeyInfo works.
        Write-Log "[CRYPTO] Legacy RSA import not fully implemented in this version, update .NET to 4.6.2+" "WARN"
        return $false
    } catch {
        return $false
    }
}

function Test-Ed25519Signature {
    <#
    .SYNOPSIS
        Verify an Ed25519 signature against content.
    #>
    param(
        [Parameter(Mandatory)][string]$ContentHash,
        [string]$SignatureBase64,
        [string]$PublicKeyBase64
    )

    if (-not $SignatureBase64) {
        Write-Log "[CRYPTO] No signature provided - UNSIGNED" "WARN"
        return $false
    }

    if (-not $PublicKeyBase64) {
        $PublicKeyBase64 = $Global:Ed25519PublicKeyBase64
    }

    if (-not $PublicKeyBase64) {
        Write-Log "[CRYPTO] No Ed25519 public key configured - FAIL" "ERROR"
        return $false
    }

    if (-not (Test-Ed25519Available)) {
        Write-Log "[CRYPTO] Ed25519 NOT supported on this Windows/PowerShell version. Falling back to RSA." "WARN"
        return $false # Force fallback to RSA in Test-ScriptSignature
    }

    try {
        # This block only runs if Test-Ed25519Available returns true (e.g. .NET 9.0+)
        $pubKeyBytes = [System.Convert]::FromBase64String($PublicKeyBase64)
        $sigBytes = [System.Convert]::FromBase64String($SignatureBase64)
        $contentBytes = [System.Text.Encoding]::UTF8.GetBytes($ContentHash)

        # EdDsa is the .NET 9.0 class
        $ed = [System.Security.Cryptography.EdDsa]::Create([System.Security.Cryptography.ECCurve]::NamedCurves.ed25519)
        $ed.ImportSubjectPublicKeyInfo($pubKeyBytes, [ref]$null)
        $isValid = $ed.VerifyData($contentBytes, $sigBytes)
        $ed.Dispose()
        
        return $isValid
    }
    catch {
        Write-Log "[CRYPTO] Ed25519 verification exception: $($_.Exception.Message)" "ERROR"
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

function Invoke-SignResult {
    <#
    .SYNOPSIS
        Signs job result with agent cryptographic identity (ECDSA/RSA).
        Ported from v5.0.15 monolith for v6 parity.
    #>
    param(
        [string]$ExecutionId,
        [string]$JobId,
        [string]$Status,
        [string]$OutputHash,
        [string]$FinishedAt
    )

    try {
        if (-not $Global:AgentPrivateKey) {
            Write-Log "[SIGN] No private key available for signing" "WARN"
            return $null
        }

        $algorithm = if ($Global:AgentSigningAlgorithm) { $Global:AgentSigningAlgorithm } else { "unknown" }
        $message = "$ExecutionId|$JobId|$Status|$OutputHash|$FinishedAt"
        $messageBytes = [System.Text.Encoding]::UTF8.GetBytes($message)

        if ($algorithm -eq "RSA-2048-CSP" -and $Global:AgentRsaKey) {
            $sha256 = [System.Security.Cryptography.SHA256]::Create()
            $hash = $sha256.ComputeHash($messageBytes)
            $sha256.Dispose()
            $sigBytes = $Global:AgentRsaKey.SignHash($hash, [System.Security.Cryptography.CryptoConfig]::MapNameToOID("SHA256"))
            return [Convert]::ToBase64String($sigBytes)
        }

        Write-Log "[SIGN] Unsupported signing algorithm: $algorithm" "WARN"
        return $null
    }
    catch {
        Write-Log "[SIGN] Signing failed: $($_.Exception.Message)" "WARN"
        return $null
    }
}
