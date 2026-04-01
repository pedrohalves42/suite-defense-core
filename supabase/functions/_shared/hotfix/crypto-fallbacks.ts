import type { HotfixContext } from './types.ts';

/**
 * HOTFIX KEYGEN-PRECHECK: Inject canExportPkcs8 pre-check before ECDSA keygen.
 * 
 * On .NET Framework 4.x (PS 5.1), ExportPkcs8PrivateKey() does not exist on ECDsaCng,
 * causing Initialize-AgentKeys to fail on first boot and putting the agent in DEGRADED mode.
 * 
 * This hotfix detects the OLD pattern (Initialize-AgentKeys without canExportPkcs8) and
 * injects the pre-check that skips directly to RSA if ExportPkcs8 is unavailable.
 * 
 * Also handles v4 scripts with New-SigningKeyPair that call ExportPkcs8PrivateKey() directly.
 */
export function hotfixEcdsaKeygenPreCheck(ctx: HotfixContext): void {
  // Skip if already has the pre-check (idempotent)
  if (ctx.content.includes('canExportPkcs8') || ctx.content.includes('HOTFIX-KEYGEN-PRECHECK')) {
    return;
  }

  let changed = false;

  // Pattern 1: v5 old scripts with Initialize-AgentKeys that have ECDSA keygen WITHOUT pre-check
  // Match: "Generating new ECDSA P-256 keypair" inside Initialize-AgentKeys
  if (ctx.content.includes('function Initialize-AgentKeys') && ctx.content.includes('ExportPkcs8PrivateKey')) {
    const v5Pattern = /(function Initialize-AgentKeys\s*\{[\s\S]*?)(Write-Log "\[KEYS\] Generating new ECDSA P-256 keypair)/;
    const v5Match = ctx.content.match(v5Pattern);
    if (v5Match) {
      const preCheck = `# HOTFIX-KEYGEN-PRECHECK: Test ExportPkcs8PrivateKey before attempting ECDSA
        $canExportPkcs8 = $false
        try {
            $testEcdsa = [System.Security.Cryptography.ECDsaCng]::new(256)
            try { $null = $testEcdsa.ExportPkcs8PrivateKey(); $canExportPkcs8 = $true }
            catch { $canExportPkcs8 = $false }
            finally { try { $testEcdsa.Dispose() } catch {} }
        } catch { $canExportPkcs8 = $false }

        if (-not $canExportPkcs8) {
            Write-Log "[KEYS] .NET Framework detected (ExportPkcs8PrivateKey not available) - using RSACryptoServiceProvider directly" "INFO"
            # HOTFIX-KEYGEN-PRECHECK: Generate RSA-2048 keys directly
            try {
                $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider(2048)
                $privateKeyBase64 = [Convert]::ToBase64String($rsa.ExportCspBlob($true))
                $publicKeyBase64 = [Convert]::ToBase64String($rsa.ExportCspBlob($false))
                $publicKeyBytes = $rsa.ExportCspBlob($false)
                $Global:AgentRsaKey = $rsa
                $Global:AgentSigningAlgorithm = "RSA-2048-SHA256"
                Write-Log "[KEYS] RSA-2048 keypair generated (HOTFIX-KEYGEN-PRECHECK)" "SUCCESS"
                # Save keys and return success
                $sha256 = [System.Security.Cryptography.SHA256]::Create()
                $fingerprintBytes = $sha256.ComputeHash($publicKeyBytes)
                $Global:AgentFingerprint = ($fingerprintBytes | ForEach-Object { $_.ToString("x2") }) -join ""
                $Global:AgentPrivateKey = $privateKeyBase64
                $Global:AgentPublicKey = $publicKeyBase64
                $keyDir = "C:\\CyberShield\\keys"
                if (-not (Test-Path $keyDir)) { New-Item -ItemType Directory -Path $keyDir -Force | Out-Null }
                @{
                    algorithm = $Global:AgentSigningAlgorithm
                    private_key = $privateKeyBase64
                    public_key = $publicKeyBase64
                    fingerprint = $Global:AgentFingerprint
                    generated_at = (Get-Date).ToUniversalTime().ToString("o")
                } | ConvertTo-Json | Out-File "$keyDir\\agent_keys.json" -Encoding UTF8 -Force
                return $true
            } catch {
                Write-Log "[KEYS] RSA-2048 fallback failed: $($_.Exception.Message)" "ERROR"
                return $false
            }
        }

        `;
      ctx.content = ctx.content.replace(v5Pattern, `$1${preCheck}$2`);
      changed = true;
    }
  }

  // Pattern 2: v4 scripts with New-SigningKeyPair that call ExportPkcs8PrivateKey() directly
  if (ctx.content.includes('function New-SigningKeyPair') && ctx.content.includes('ExportPkcs8PrivateKey') && !ctx.content.includes('function Initialize-AgentKeys')) {
    const v4Pattern = /(function New-SigningKeyPair[\s\S]*?try\s*\{[\s\S]*?)(Write-Log "\[SIGNING\] Generating new ECDSA P-256 keypair)/;
    const v4Match = ctx.content.match(v4Pattern);
    if (v4Match) {
      const preCheckV4 = `# HOTFIX-KEYGEN-PRECHECK: Test ExportPkcs8PrivateKey before attempting ECDSA
        $canExportPkcs8 = $false
        try {
            $testEcdsa = [System.Security.Cryptography.ECDsaCng]::new(256)
            try { $null = $testEcdsa.ExportPkcs8PrivateKey(); $canExportPkcs8 = $true }
            catch { $canExportPkcs8 = $false }
            finally { try { $testEcdsa.Dispose() } catch {} }
        } catch { $canExportPkcs8 = $false }

        if (-not $canExportPkcs8) {
            Write-Log "[SIGNING] .NET Framework detected - generating RSA-2048 instead of ECDSA" "WARN"
            $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider(2048)
            $publicKeyBase64 = [Convert]::ToBase64String($rsa.ExportCspBlob($false))
            $privateKeyBase64 = [Convert]::ToBase64String($rsa.ExportCspBlob($true))
            $sha256 = [System.Security.Cryptography.SHA256]::Create()
            $fingerprintBytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($publicKeyBase64))
            $fingerprint = [BitConverter]::ToString($fingerprintBytes).Replace("-", "").ToLower()
            Write-Log "[SIGNING] Generated RSA-2048 keypair with fingerprint: $($fingerprint.Substring(0, 16))..." "SUCCESS"
            return @{
                PublicKey = $publicKeyBase64
                PrivateKey = $privateKeyBase64
                Fingerprint = $fingerprint
                Algorithm = "RSA-2048-SHA256"
                GeneratedAt = (Get-Date).ToUniversalTime().ToString("o")
            }
        }

        `;
      ctx.content = ctx.content.replace(v4Pattern, `$1${preCheckV4}$2`);
      changed = true;
    }
  }

  if (changed) {
    ctx.reasons.push('ecdsa_keygen_precheck');
  }
}

/** HOTFIX 2: Legacy ECDSA fallback (CNG container creation unstable) */
export function hotfixLegacyEcdsaFallback(ctx: HotfixContext): void {
  if (!ctx.content.includes('ECDsaCng]::new(256)') && ctx.content.includes('if ($attempt -eq $maxKeyAttempts)')) {
    const updated = ctx.content.replace(
      /if \(\$attempt -eq \$maxKeyAttempts\) \{[\s\S]*?Write-Log "\[KEYS\] All \$maxKeyAttempts ECDSA attempts failed" "ERROR"[\s\S]*?return \$false\s*\}/m,
      `if ($attempt -eq $maxKeyAttempts) {
                    # v5.0.14 HOTFIX: fallback for legacy Windows/.NET where CNG container creation is unstable
                    try {
                        $ecdsa = [System.Security.Cryptography.ECDsaCng]::new(256)
                        if ($null -ne $ecdsa) {
                            Write-Log "[KEYS] Fallback ECDSA keypair generated via ECDsaCng(256)" "WARN"
                            break
                        }
                    } catch {
                        Write-Log "[KEYS] ECDsaCng fallback failed: $($_.Exception.Message)" "WARN"
                    }

                    try {
                        $ecdsa = [System.Security.Cryptography.ECDsa]::Create()
                        if ($null -ne $ecdsa) {
                            try {
                                if ($ecdsa.KeySize -ne 256) { $ecdsa.KeySize = 256 }
                            } catch {
                                Write-Log "[KEYS] Managed ECDSA fallback created key with KeySize=$($ecdsa.KeySize)" "WARN"
                            }
                            Write-Log "[KEYS] Fallback ECDSA keypair generated via managed API" "WARN"
                            break
                        }
                    } catch {
                        Write-Log "[KEYS] Managed ECDSA fallback failed: $($_.Exception.Message)" "WARN"
                    }

                    Write-Log "[KEYS] All $maxKeyAttempts ECDSA attempts failed" "ERROR"
                    Write-Log "[KEYS] Result signing will be DISABLED for this agent" "WARN"
                    return $false
                }`
    );

    if (updated !== ctx.content) {
      ctx.content = updated;
      ctx.reasons.push('legacy_ecdsa_fallback');
    }
  }
}

/** HOTFIX 3+26 COMBINED: ExportPkcs8PrivateKey not available in .NET Framework 4.x */
export function hotfixExportPkcs8RsaFallback(ctx: HotfixContext): void {
  if (ctx.content.includes('$ecdsa.ExportPkcs8PrivateKey()') && !ctx.content.includes('HOTFIX-EXPORT') && !ctx.content.includes('RSACryptoServiceProvider fallback')) {
    const updated = ctx.content.replace(
      /# Export private key \(PKCS#8\)\s*\r?\n\s*\$privateKeyBytes = \$ecdsa\.ExportPkcs8PrivateKey\(\)\s*\r?\n\s*\$privateKeyBase64 = \[Convert\]::ToBase64String\(\$privateKeyBytes\)\s*\r?\n\s*\r?\n\s*# Export public key \(SubjectPublicKeyInfo\)\s*\r?\n\s*\$publicKeyBytes = \$ecdsa\.ExportSubjectPublicKeyInfo\(\)\s*\r?\n\s*\$publicKeyBase64 = \[Convert\]::ToBase64String\(\$publicKeyBytes\)/,
      `# HOTFIX-EXPORT + HOTFIX-RSA-FALLBACK: Export keys with RSA-2048 fallback for .NET 4.x
        $privateKeyBase64 = $null
        $publicKeyBase64 = $null
        $publicKeyBytes = $null
        try {
            # .NET Core 3.0+ path
            $privateKeyBytes = $ecdsa.ExportPkcs8PrivateKey()
            $privateKeyBase64 = [Convert]::ToBase64String($privateKeyBytes)
            $publicKeyBytes = $ecdsa.ExportSubjectPublicKeyInfo()
            $publicKeyBase64 = [Convert]::ToBase64String($publicKeyBytes)
        } catch {
            Write-Log "[KEYS] ECDSA PKCS8 export not available, falling back to RSA-2048..." "WARN"
            # HOTFIX-RSA-FALLBACK: Generate RSA-2048 keypair using RSACryptoServiceProvider (.NET 4.x compatible)
            try {
                $ecdsa.Dispose()  # Release the unusable ECDSA key
                $ecdsa = $null
            } catch { }
            try {
                # RSACryptoServiceProvider works on ALL .NET Framework versions (4.0+)
                $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider(2048)
                $privateKeyBase64 = [Convert]::ToBase64String($rsa.ExportCspBlob($true))
                $publicKeyBase64 = [Convert]::ToBase64String($rsa.ExportCspBlob($false))
                $publicKeyBytes = $rsa.ExportCspBlob($false)
                # Store RSA object globally for signing
                $Global:AgentRsaKey = $rsa
                $Global:AgentSigningAlgorithm = "RSA-2048-SHA256"
                Write-Log "[KEYS] RSA-2048 fallback keypair generated successfully (RSACryptoServiceProvider)" "INFO"
            } catch {
                Write-Log "[KEYS] RSA-2048 fallback also failed: $($_.Exception.Message)" "ERROR"
                # Last resort: synthetic fingerprint with .NET 4.x compatible RNG
                $randomBytes = [byte[]]::new(32)
                $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($randomBytes)
                $publicKeyBytes = $randomBytes
                $publicKeyBase64 = [Convert]::ToBase64String($randomBytes)
            }
        }`
    );
    if (updated !== ctx.content) {
      ctx.content = updated;
      ctx.reasons.push('export_pkcs8_rsa_fallback_combined');
    }
  }
}

/** HOTFIX 22: CNG key creation "Object already exists" */
export function hotfixCngCleanup(ctx: HotfixContext): void {
  if (ctx.content.includes('CngKey]::Create(') && !ctx.content.includes('HOTFIX-CNG-CLEANUP')) {
    let updatedCng = ctx.content.replace(
      /\$cngKey = \[System\.Security\.Cryptography\.CngKey\]::Create\(\s*\n\s*\[System\.Security\.Cryptography\.CngAlgorithm\]::ECDsaP256,\s*\n\s*\$null,\s*(?:# No name = ephemeral, no conflict|# Ephemeral key \(HOTFIX-CNG-CLEANUP\))\s*\n\s*\$creationParams\s*\)/g,
      `# HOTFIX-CNG-CLEANUP: OverwriteExistingKey prevents "Object already exists" errors
                $creationParams.KeyCreationOptions = [System.Security.Cryptography.CngKeyCreationOptions]::OverwriteExistingKey
                $cngKey = [System.Security.Cryptography.CngKey]::Create(
                    [System.Security.Cryptography.CngAlgorithm]::ECDsaP256,
                    $null,  # Ephemeral key (HOTFIX-CNG-CLEANUP)
                    $creationParams
                )`
    );
    if (updatedCng === ctx.content) {
      updatedCng = ctx.content.replace(
        /# HOTFIX-CNG-CLEANUP: Delete any leftover CNG containers before creating[\s\S]*?\$cngKey = \[System\.Security\.Cryptography\.CngKey\]::Create\(\s*\n\s*\[System\.Security\.Cryptography\.CngAlgorithm\]::ECDsaP256,\s*\n\s*\$null,\s*# Ephemeral key \(HOTFIX-CNG-CLEANUP\)\s*\n\s*\$creationParams\s*\)/g,
        `# HOTFIX-CNG-CLEANUP: OverwriteExistingKey prevents "Object already exists" errors
                $creationParams.KeyCreationOptions = [System.Security.Cryptography.CngKeyCreationOptions]::OverwriteExistingKey
                $cngKey = [System.Security.Cryptography.CngKey]::Create(
                    [System.Security.Cryptography.CngAlgorithm]::ECDsaP256,
                    $null,  # Ephemeral key (HOTFIX-CNG-CLEANUP)
                    $creationParams
                )`
      );
    }
    if (updatedCng !== ctx.content) {
      ctx.content = updatedCng;
      ctx.reasons.push('cng_cleanup_fix');
    }
  }
}

/** HOTFIX 26: RSA-2048 fallback when ECDSA PKCS8 export fails */
export function hotfixRsa2048Fallback(ctx: HotfixContext): void {
  if (ctx.content.includes('HOTFIX-EXPORT') && ctx.content.includes('using in-memory ECDSA object') && !ctx.content.includes('HOTFIX-RSA-FALLBACK')) {
    ctx.content = ctx.content.replace(
      /Write-Log "\[KEYS\] ExportPkcs8\/SPKI not available \(\$\(\$_\.Exception\.Message\)\), using in-memory ECDSA object" "WARN"\s*\n\s*# Keep \$ecdsa object in memory for direct signing - no export needed\s*\n\s*# Generate a synthetic fingerprint from the key parameters\s*\n\s*try \{\s*\n\s*\$ecParams = \$ecdsa\.ExportParameters\(\$false\)\s*\n\s*\$publicKeyBytes = \[byte\[\]\]\(\$ecParams\.Q\.X \+ \$ecParams\.Q\.Y\)\s*\n\s*\$publicKeyBase64 = \[Convert\]::ToBase64String\(\$publicKeyBytes\)\s*\n\s*\} catch \{\s*\n\s*Write-Log "\[KEYS\] ExportParameters also failed, using random fingerprint" "WARN"\s*\n\s*\$randomBytes = \[byte\[\]\]::new\(32\)\s*\n\s*\[System\.Security\.Cryptography\.RandomNumberGenerator\]::(?:Fill\(\$randomBytes\)|Create\(\);\s*\$rng\.GetBytes\(\$randomBytes\))\s*\n\s*\$publicKeyBytes = \$randomBytes\s*\n\s*\$publicKeyBase64 = \[Convert\]::ToBase64String\(\$randomBytes\)\s*\n\s*\}/,
      `Write-Log "[KEYS] ECDSA PKCS8 export not available, falling back to RSA-2048..." "WARN"
            # HOTFIX-RSA-FALLBACK: Generate RSA-2048 keypair using RSACryptoServiceProvider (.NET 4.x compatible)
            try {
                $ecdsa.Dispose()  # Release the unusable ECDSA key
                $ecdsa = $null
            } catch { }
            try {
                # RSACryptoServiceProvider works on ALL .NET Framework versions (4.0+)
                $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider(2048)
                $privateKeyBase64 = [Convert]::ToBase64String($rsa.ExportCspBlob($true))
                $publicKeyBase64 = [Convert]::ToBase64String($rsa.ExportCspBlob($false))
                $publicKeyBytes = $rsa.ExportCspBlob($false)
                # Store RSA object globally for signing
                $Global:AgentRsaKey = $rsa
                $Global:AgentSigningAlgorithm = "RSA-2048-SHA256"
                Write-Log "[KEYS] RSA-2048 fallback keypair generated successfully (RSACryptoServiceProvider)" "INFO"
            } catch {
                Write-Log "[KEYS] RSA-2048 fallback also failed: $($_.Exception.Message)" "ERROR"
                # Last resort: synthetic fingerprint with .NET 4.x compatible RNG
                $randomBytes = [byte[]]::new(32)
                $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($randomBytes)
                $publicKeyBytes = $randomBytes
                $publicKeyBase64 = [Convert]::ToBase64String($randomBytes)
            }`
    );
    ctx.reasons.push('rsa_2048_fallback');
  }
}

/** HOTFIX 26b: RSA signing in Submit-JobResult */
export function hotfixRsaSignFallback(ctx: HotfixContext): void {
  if (ctx.content.includes('$ecdsa.SignData') && !ctx.content.includes('HOTFIX-RSA-SIGN') && !ctx.content.includes('HOTFIX-ECDSA-RSA-AUTOREGEN')) {
    const updated = ctx.content.replace(
      /\$signatureBytes = \$ecdsa\.SignData\(\[System\.Text\.Encoding\]::UTF8\.GetBytes\(\$canonicalPayload\), \[System\.Security\.Cryptography\.HashAlgorithmName\]::SHA256\)/g,
      `# HOTFIX-RSA-SIGN: Use RSA if ECDSA private key was not exportable
            if ($Global:AgentSigningAlgorithm -eq "RSA-2048-SHA256" -and $Global:AgentRsaKey) {
                $signatureBytes = $Global:AgentRsaKey.SignData([System.Text.Encoding]::UTF8.GetBytes($canonicalPayload), [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
            } else {
                $signatureBytes = $ecdsa.SignData([System.Text.Encoding]::UTF8.GetBytes($canonicalPayload), [System.Security.Cryptography.HashAlgorithmName]::SHA256)
            } <# HOTFIX-RSA-SIGN #>`
    );
    if (updated !== ctx.content) {
      ctx.content = updated;
      ctx.reasons.push('rsa_sign_fallback');
    }
  }
}

/** HOTFIX 26c: Report correct algorithm in key registration and heartbeat */
export function hotfixRsaAlgoReport(ctx: HotfixContext): void {
  if (ctx.content.includes('"ECDSA-P256-SHA256"') && ctx.content.includes('algorithm =') && !ctx.content.includes('HOTFIX-RSA-ALGO')) {
    ctx.content = ctx.content.replace(
      /algorithm = "ECDSA-P256-SHA256"/g,
      'algorithm = $(if ($Global:AgentSigningAlgorithm) { $Global:AgentSigningAlgorithm } else { "ECDSA-P256-SHA256" }) <# HOTFIX-RSA-ALGO #>'
    );
    ctx.reasons.push('rsa_algo_report');
  }
}

/** HOTFIX 27: Fix RSA fallback that used .NET Core APIs */
export function hotfixRsaNet4x(ctx: HotfixContext): void {
  if (ctx.content.includes('HOTFIX-RSA-FALLBACK') && ctx.content.includes('RSA]::Create(2048)') && !ctx.content.includes('HOTFIX-RSA-NET4X')) {
    ctx.content = ctx.content.replace(
      /\$rsa = \[System\.Security\.Cryptography\.RSA\]::Create\(2048\)\s*\n\s*\$privateKeyBytes = \$rsa\.ExportPkcs8PrivateKey\(\)\s*\n\s*\$privateKeyBase64 = \[Convert\]::ToBase64String\(\$privateKeyBytes\)\s*\n\s*\$publicKeyBytes = \$rsa\.ExportSubjectPublicKeyInfo\(\)\s*\n\s*\$publicKeyBase64 = \[Convert\]::ToBase64String\(\$publicKeyBytes\)/,
      `# HOTFIX-RSA-NET4X: Use RSACryptoServiceProvider (.NET 4.x compatible)
                $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider(2048)
                $privateKeyBase64 = [Convert]::ToBase64String($rsa.ExportCspBlob($true))
                $publicKeyBytes = $rsa.ExportCspBlob($false)
                $publicKeyBase64 = [Convert]::ToBase64String($publicKeyBytes)`
    );
    ctx.reasons.push('rsa_net4x_compat');
  }
}

/** HOTFIX 28: Replace RandomNumberGenerator.Fill() with .Create().GetBytes() */
export function hotfixRngNet4x(ctx: HotfixContext): void {
  if (ctx.content.includes('RandomNumberGenerator]::Fill(')) {
    ctx.content = ctx.content.replace(
      /\[System\.Security\.Cryptography\.RandomNumberGenerator\]::Fill\((\$\w+)\)/g,
      '$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($1) <# HOTFIX-RNG-NET4X #>'
    );
    ctx.reasons.push('rng_net4x_compat');
  }
}

/** HOTFIX 31: Guard null $ecdsa after RSA-2048 fallback */
export function hotfixNullEcdsaGuard(ctx: HotfixContext): void {
  if (ctx.content.includes('HOTFIX-RSA-FALLBACK') && !ctx.content.includes('HOTFIX-NULL-ECDSA-GUARD')) {
    ctx.content = ctx.content.replace(
      /(?<!try\s*\{\s*)\$ecdsa\.Dispose\(\)(?!\s*#\s*Release)/g,
      'if ($null -ne $ecdsa) { $ecdsa.Dispose() } <# HOTFIX-NULL-ECDSA-GUARD #>'
    );
    ctx.content = ctx.content.replace(
      /\$ecParams\s*=\s*\$ecdsa\.ExportParameters\(\$false\)/g,
      '$ecParams = if ($null -ne $ecdsa) { $ecdsa.ExportParameters($false) } else { $null } <# HOTFIX-NULL-ECDSA-GUARD #>'
    );
    ctx.content = ctx.content.replace(
      /\$Global:AgentPrivateKey\s*=\s*\$privateKeyBase64\s*\n\s*\$Global:AgentPublicKey\s*=\s*\$publicKeyBase64/g,
      (match) => match
    );
    ctx.reasons.push('null_ecdsa_guard');
  }
}

/** HOTFIX 33: Replace ECDSA default signing with RSA auto-regen fallback */
export function hotfixEcdsaRsaAutoregen(ctx: HotfixContext): void {
  if (ctx.content.includes('# Default: ECDSA-P256-SHA256') && !ctx.content.includes('HOTFIX-ECDSA-RSA-AUTOREGEN')) {
    const updatedEcdsaBlock = ctx.content.replace(
      /# Default: ECDSA-P256-SHA256\s*\r?\n\s*\$privateKeyBytes = \[Convert\]::FromBase64String\(\$Global:AgentPrivateKey\)\s*\r?\n\s*\$ecdsa = \$null\s*\r?\n\s*try \{[\s\S]*?\$ecdsa\.SignData\(\$payloadBytes[\s\S]*?\}\s*finally\s*\{[\s\S]*?\$ecdsa\.Dispose\(\)[\s\S]*?\}/m,
      `# Default: ECDSA-P256-SHA256 with RSA auto-regeneration fallback <# HOTFIX-ECDSA-RSA-AUTOREGEN #>
        $privateKeyBytes = [Convert]::FromBase64String($Global:AgentPrivateKey)
        $ecdsa = $null
        $ecdsaFailed = $false
        try {
            $ecdsa = [System.Security.Cryptography.ECDsa]::Create()
            if ($null -eq $ecdsa) { throw "ECDsa.Create() returned null" }
            $bytesRead = 0
            try {
                $null = $ecdsa.ImportPkcs8PrivateKey($privateKeyBytes, [ref]$bytesRead)
            } catch {
                Write-Log "[SIGN] ImportPkcs8PrivateKey unavailable, trying CngKey.Import" "WARN"
                if ($null -ne $ecdsa) { $ecdsa.Dispose(); $ecdsa = $null }
                try {
                    $cngKey = [System.Security.Cryptography.CngKey]::Import(
                        $privateKeyBytes,
                        [System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob
                    )
                    $ecdsa = [System.Security.Cryptography.ECDsaCng]::new($cngKey)
                } catch {
                    Write-Log "[SIGN] CngKey.Import also failed. Triggering RSA auto-regeneration." "WARN"
                    $ecdsaFailed = $true
                }
            }
            if (-not $ecdsaFailed) {
                $signatureBytes = $ecdsa.SignData($payloadBytes, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
                $signature = [Convert]::ToBase64String($signatureBytes)
                Write-Log "[SIGN] Signed result for execution $ExecutionId using $algorithm" "DEBUG"
                return $signature
            }
        } catch {
            Write-Log "[SIGN] ECDSA signing failed completely: $($_.Exception.Message). Triggering RSA auto-regen." "WARN"
            $ecdsaFailed = $true
        } finally {
            if ($null -ne $ecdsa) { $ecdsa.Dispose() }
        }

        # ECDSA failed on this system - auto-regenerate as RSA-2048-XML for permanent fix
        if ($ecdsaFailed) {
            Write-Log "[SIGN] Auto-regenerating keys as RSA-2048-XML for PS 5.1 compatibility..." "WARN"
            try {
                $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider(2048)
                $rsaXml = $rsa.ToXmlString($true)
                $rsaPublicXml = $rsa.ToXmlString($false)
                $Global:AgentPrivateKey = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($rsaXml))
                $Global:AgentSigningAlgorithm = "RSA-2048-XML"
                $Global:AgentPublicKey = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($rsaPublicXml))
                
                # Persist new keys
                $keyDir = "C:\\CyberShield\\keys"
                if (-not (Test-Path $keyDir)) { New-Item -ItemType Directory -Path $keyDir -Force | Out-Null }
                $rsaXml | Out-File "$keyDir\\agent_private.xml" -Encoding UTF8 -Force
                $rsaPublicXml | Out-File "$keyDir\\agent_public.xml" -Encoding UTF8 -Force
                "RSA-2048-XML" | Out-File "$keyDir\\algorithm.txt" -Encoding UTF8 -Force
                
                # Sign with new RSA key
                $signatureBytes = $rsa.SignData($payloadBytes, "SHA256")
                $signature = [Convert]::ToBase64String($signatureBytes)
                $rsa.Dispose()
                
                Write-Log "[SIGN] RSA-2048-XML keys generated and persisted. Signed successfully." "SUCCESS"
                return $signature
            } catch {
                Write-Log "[SIGN] RSA auto-regen failed: $($_.Exception.Message)" "ERROR"
                return $null
            }
        }`
    );

    if (updatedEcdsaBlock !== ctx.content) {
      ctx.content = updatedEcdsaBlock;
      ctx.reasons.push('ecdsa_rsa_autoregen');
    }
  }
}

/** HOTFIX 33b: Detect null/empty private_key with ECDSA algorithm */
export function hotfixNullPrivkeyRegen(ctx: HotfixContext): void {
  if (ctx.content.includes('Initialize-AgentKeys') && ctx.content.includes('agent_keys.json') && !ctx.content.includes('HOTFIX-NULL-PRIVKEY-REGEN')) {
    const nullKeyCheck = ctx.content.replace(
      /(if\s*\(\$keys\.algorithm\s*-and\s*\$keys\.private_key\s*-and\s*\$keys\.public_key\))/,
      `# HOTFIX-NULL-PRIVKEY-REGEN: If algorithm is ECDSA but private_key is null/empty, delete keys and regen
            if ($keys.algorithm -like "ECDSA*" -and (-not $keys.private_key -or $keys.private_key -eq "null")) {
                Write-Log "[KEYS] Detected ECDSA keys with null private_key - deleting for RSA regen" "WARN"
                Remove-Item $keysPath -Force -ErrorAction SilentlyContinue
                $keys = $null
            }
            $1`
    );
    if (nullKeyCheck !== ctx.content) {
      ctx.content = nullKeyCheck;
      ctx.reasons.push('null_privkey_regen');
    } else {
      const fallback = ctx.content.replace(
        /(\$keys\s*=\s*(?:Get-Content\s+\$keysPath\s+-Raw\s*\|\s*ConvertFrom-Json|\$keysContent\s*\|\s*ConvertFrom-Json)[^\n]*)/,
        `$1
            # HOTFIX-NULL-PRIVKEY-REGEN: If ECDSA keys have null private_key, force RSA regen
            if ($keys -and $keys.algorithm -like "ECDSA*" -and (-not $keys.private_key -or $keys.private_key -eq "null")) {
                Write-Log "[KEYS] Detected ECDSA keys with null private_key - forcing RSA regen" "WARN"
                Remove-Item $keysPath -Force -ErrorAction SilentlyContinue
                $keys = $null
            }`
      );
      if (fallback !== ctx.content) {
        ctx.content = fallback;
        ctx.reasons.push('null_privkey_regen');
      }
    }
  }
}

/** HOTFIX 36: Remove orphan closing brace left by HOTFIX 33 */
export function hotfixOrphanBraceCleanup(ctx: HotfixContext): void {
  if (ctx.content.includes('HOTFIX-ECDSA-RSA-AUTOREGEN')) {
    const orphanPattern = /(\}\s*\r?\n\s*\})\s*\r?\n(\s*\})\s*(\r?\n\s*\r?\n\s*\} catch \{\s*\r?\n\s*Write-Log "\[SIGN\] Error signing result)/;
    if (orphanPattern.test(ctx.content)) {
      ctx.content = ctx.content.replace(orphanPattern, (_match, p1, _orphan, p3) => {
        return p1 + p3;
      });
      ctx.reasons.push('orphan_brace_cleanup');
    }
  }
}
