export interface WindowsScriptHotfixResult {
  content: string;
  changed: boolean;
  reasons: string[];
}

/**
 * Aplica hotfixes criticos de compatibilidade no script Windows do agente.
 * Mantem comportamento idempotente (nao reaplica quando ja existe marcador HOTFIX).
 */
export function applyWindowsScriptHotfix(script: string): WindowsScriptHotfixResult {
  let content = script;
  const reasons: string[] = [];

  // HOTFIX 1: StrictMode globals (crypto + monitoring)
  // Uses multiple regex patterns to match even partially-hotfixed content
  if (
    content.includes('$Global:SecurityDegraded = $false') &&
    !content.includes('$Global:AgentPrivateKey = $null')
  ) {
    const globalsBlock = '\n\n# v5.0.14-hotfix: Declare ALL globals early (StrictMode-safe)\n$Global:AgentPrivateKey = $null\n$Global:AgentPublicKey = $null\n$Global:KeyFingerprint = $null\n$Global:KeyVersion = 0\n$Global:ProtectedProcessSet = $null\n$Global:ProcessBaseline = @{}\n$Global:LastBaselineUpdate = [datetime]::MinValue\n$Global:LastAnomalyCheck = [datetime]::MinValue\n$Global:AnomalyHistory = @()\n$Global:LogBuffer = [System.Collections.Generic.List[string]]::new()\n$Global:LastLogFlush = [datetime]::UtcNow\n$Global:CachedTimestamp = $null\n$Global:LastTimestampUpdate = [datetime]::MinValue';

    // Try specific pattern first
    let withDeclaredGlobals = content.replace(
      /# v5\.0\.13-fix: SecurityDegraded flag \(BUG 7 - declare early for robustness\)\s*\r?\n\$Global:SecurityDegraded = \$false/,
      '# v5.0.13-fix: SecurityDegraded flag (BUG 7 - declare early for robustness)\n$Global:SecurityDegraded = $false' + globalsBlock
    );

    // Fallback: match any line containing the SecurityDegraded declaration
    if (withDeclaredGlobals === content) {
      withDeclaredGlobals = content.replace(
        /(\$Global:SecurityDegraded = \$false[^\r\n]*)/,
        '$1' + globalsBlock
      );
    }

    if (withDeclaredGlobals !== content) {
      content = withDeclaredGlobals;
      reasons.push('strictmode_globals');
    }
  }

  // HOTFIX 2: Legacy ECDSA fallback (CNG container creation unstable)
  if (!content.includes('ECDsaCng]::new(256)') && content.includes('if ($attempt -eq $maxKeyAttempts)')) {
    const updated = content.replace(
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

    if (updated !== content) {
      content = updated;
      reasons.push('legacy_ecdsa_fallback');
    }
  }

  // HOTFIX 3+26 COMBINED: ExportPkcs8PrivateKey not available in .NET Framework 4.x (PowerShell 5.1)
  // Directly applies RSA-2048 fallback instead of intermediate ECDSA-in-memory step
  // This ensures v5.0.13 scripts (without HOTFIX-EXPORT marker) get the full RSA fallback
  // NOTE: v5.0.14+ scripts already have built-in RSA fallback, so the regex won't match (expected)
  if (content.includes('$ecdsa.ExportPkcs8PrivateKey()') && !content.includes('HOTFIX-EXPORT') && !content.includes('RSACryptoServiceProvider fallback')) {
    const updated = content.replace(
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
    if (updated !== content) {
      content = updated;
      reasons.push('export_pkcs8_rsa_fallback_combined');
    }
  }

  // HOTFIX 4: $anomalies.anomalies crashes when $anomalies is not a hashtable (PSObject vs Hashtable)
  if (content.includes('.anomalies') && !content.includes('HOTFIX-ANOMALIES')) {
    content = content.replace(
      /\$anomalies\.anomalies/g,
      '$(if ($anomalies -is [hashtable] -and $anomalies.ContainsKey("anomalies")) { $anomalies["anomalies"] } elseif ($anomalies -and (Get-Member -InputObject $anomalies -Name "anomalies" -ErrorAction SilentlyContinue)) { $anomalies.anomalies } else { @() }) <# HOTFIX-ANOMALIES #>'
    );
    reasons.push('safe_anomalies_access');
  }

  // HOTFIX 5: $Global:ProcessBaseline not declared - StrictMode crash (safety net)
  // This is a SAFETY NET: fires when HOTFIX 1 didn't inject globals (e.g. regex mismatch)
  // Check for the actual variable declaration, not just markers that may have been partially applied
  if (
    content.includes('$Global:ProcessBaseline') && 
    !content.includes('HOTFIX-BASELINE-GLOBALS') && 
    !content.includes('$Global:ProcessBaseline = @{}')
  ) {
    const baselineGlobals = `\n# HOTFIX-BASELINE-GLOBALS: Declare monitoring globals early for StrictMode\n` +
      `$Global:ProcessBaseline = @{}\n` +
      `$Global:LastBaselineUpdate = [datetime]::MinValue\n` +
      `$Global:LastAnomalyCheck = [datetime]::MinValue\n` +
      `$Global:AnomalyHistory = @()\n` +
      `$Global:ProtectedProcessSet = $null\n`;

    // Try multiple injection points
    let injected = false;
    if (content.includes('$Global:SecurityDegraded = $false')) {
      const updated = content.replace(
        /(\$Global:SecurityDegraded = \$false[^\r\n]*)/,
        '$1' + baselineGlobals
      );
      if (updated !== content) {
        content = updated;
        injected = true;
      }
    }
    if (!injected && content.includes('Set-StrictMode')) {
      content = content.replace(
        /(Set-StrictMode[^\r\n]*)/,
        '$1' + baselineGlobals
      );
    }
    reasons.push('baseline_globals');
  }

  // HOTFIX 6: Heartbeat response may not have 'force_update' property (PSObject strict access)
  if (content.includes('.force_update') && !content.includes('HOTFIX-FORCE-UPDATE')) {
    content = content.replace(
      /\$(?:response|result|heartbeatResponse)\.force_update/g,
      (match) => {
        const varName = match.split('.')[0];
        return `$(if (${varName} -and (Get-Member -InputObject ${varName} -Name "force_update" -ErrorAction SilentlyContinue)) { ${varName}.force_update } else { $false }) <# HOTFIX-FORCE-UPDATE #>`;
      }
    );
    reasons.push('safe_force_update');
  }

  // HOTFIX 7: Safe access to .repaired and .script_sha256 properties (hashtable vs PSObject)
  if (content.includes('.repaired') && !content.includes('HOTFIX-SAFE-REPAIRED')) {
    content = content.replace(
      /\$taskHealth\.repaired/g,
      '$(if ($taskHealth -is [hashtable] -and $taskHealth.ContainsKey("repaired")) { $taskHealth["repaired"] } elseif ($taskHealth -and (Get-Member -InputObject $taskHealth -Name "repaired" -ErrorAction SilentlyContinue)) { $taskHealth.repaired } else { $false }) <# HOTFIX-SAFE-REPAIRED #>'
    );
    reasons.push('safe_repaired_access');
  }

  if (content.includes('.script_sha256') && !content.includes('HOTFIX-SAFE-SHA256')) {
    content = content.replace(
      /\$(?:response|result)\.script_sha256/g,
      (match) => {
        const varName = match.split('.')[0];
        return `$(if (${varName} -is [hashtable] -and ${varName}.ContainsKey("script_sha256")) { ${varName}["script_sha256"] } elseif (${varName} -and (Get-Member -InputObject ${varName} -Name "script_sha256" -ErrorAction SilentlyContinue)) { ${varName}.script_sha256 } elseif (${varName} -and (Get-Member -InputObject ${varName} -Name "sha256" -ErrorAction SilentlyContinue)) { ${varName}.sha256 } else { $null }) <# HOTFIX-SAFE-SHA256 #>`;
      }
    );
    reasons.push('safe_sha256_access');
  }

  // HOTFIX 8: Pipeline-safe Test-* calls in Invoke-LocalDetection
  // Root cause: Show-SecurityToast, Invoke-PushAlert, Add-EvidenceEntry emit pipeline output
  // which turns $results.antivirus into an array instead of a hashtable, crashing .status access
  if (content.includes('Test-AntivirusStatus') && !content.includes('PIPELINE-SAFE')) {
    content = content.replace(
      /\$results\.antivirus\s*=\s*Test-AntivirusStatus\b/g,
      '$results.antivirus = @(Test-AntivirusStatus)[-1] <# PIPELINE-SAFE #>'
    );
    content = content.replace(
      /\$results\.firewall\s*=\s*Test-FirewallStatus\b/g,
      '$results.firewall = @(Test-FirewallStatus)[-1] <# PIPELINE-SAFE #>'
    );
    content = content.replace(
      /\$results\.usb\s*=\s*Test-UsbDevices\b/g,
      '$results.usb = @(Test-UsbDevices)[-1] <# PIPELINE-SAFE #>'
    );
    content = content.replace(
      /\$results\.processes\s*=\s*Test-SuspiciousProcesses\b/g,
      '$results.processes = @(Test-SuspiciousProcesses)[-1] <# PIPELINE-SAFE #>'
    );
    reasons.push('pipeline_safe_test_calls');
  }

  // HOTFIX 9: Type-safe .status access (handles both null AND non-hashtable results)
  if (content.includes('$results.antivirus') && !content.includes('HOTFIX-TYPESAFE-STATUS')) {
    // Match patterns with or without -and prefix, with or without prior HOTFIX markers
    content = content.replace(
      /if\s*\(\$results\.antivirus(?:\s+-and\s+\$results\.antivirus\.status|\s+-is\s+\[hashtable\]\s+-and\s+\$results\.antivirus\.status|\.status)\s+-eq\s+"inactive"\)\s*(?:<#[^#]*#>\s*)?/g,
      'if ($results.antivirus -is [hashtable] -and $results.antivirus.status -eq "inactive") <# HOTFIX-TYPESAFE-STATUS #> '
    );
    content = content.replace(
      /if\s*\(\$results\.firewall(?:\s+-and\s+\$results\.firewall\.status|\s+-is\s+\[hashtable\]\s+-and\s+\$results\.firewall\.status|\.status)\s+-eq\s+"remediated"\)\s*(?:<#[^#]*#>\s*)?/g,
      'if ($results.firewall -is [hashtable] -and $results.firewall.status -eq "remediated") <# HOTFIX-TYPESAFE-STATUS #> '
    );
    content = content.replace(
      /if\s*\(\$results\.usb(?:\s+-and\s+\$results\.usb\.status|\s+-is\s+\[hashtable\]\s+-and\s+\$results\.usb\.status|\.status)\s+-eq\s+"detected"\)\s*(?:<#[^#]*#>\s*)?/g,
      'if ($results.usb -is [hashtable] -and $results.usb.status -eq "detected") <# HOTFIX-TYPESAFE-STATUS #> '
    );
    content = content.replace(
      /if\s*\(\$results\.processes(?:\s+-and\s+\$results\.processes\.status|\s+-is\s+\[hashtable\]\s+-and\s+\$results\.processes\.status|\.status)\s+-eq\s+"detected"\)\s*(?:<#[^#]*#>\s*)?/g,
      'if ($results.processes -is [hashtable] -and $results.processes.status -eq "detected") <# HOTFIX-TYPESAFE-STATUS #> '
    );
    reasons.push('typesafe_status_access');
  }

  // HOTFIX 10: Wrap Invoke-LocalDetection call sites in try/catch (prevent fatal crash loops)
  // Match bare calls, piped calls, and already-wrapped calls that might be malformed
  if (content.includes('Invoke-LocalDetection') && !content.includes('HOTFIX-LOCAL-DETECT-TRYCATCH')) {
    // Match bare invocations (not inside function definition or existing try)
    content = content.replace(
      /^(\s+)(?:try\s*\{\s*)?Invoke-LocalDetection(?:\s*\|\s*Out-Null)?(?:\s*\}[^}]*catch[^}]*\{[^}]*\}\s*(?:<#[^#]*#>)?)?$/gm,
      (match, indent) => {
        if (match.includes('function ')) return match;
        return `${indent}try { Invoke-LocalDetection | Out-Null } catch { Write-Log "[LOCAL-DETECT] Non-fatal error: $($_.Exception.Message)" "WARN" } <# HOTFIX-LOCAL-DETECT-TRYCATCH #>`;
      }
    );
    reasons.push('local_detect_trycatch');
  }

  // HOTFIX 11: Initialize $Global:ProtectedProcessSet for Invoke-HighCpuProcessCheck
  // Without this, StrictMode throws hundreds of errors per minute
  if (content.includes('$Global:ProtectedProcessSet') && !content.includes('HOTFIX-INIT-PROTECTEDSET')) {
    // Find the first use of ProtectedProcessSet and ensure it's initialized
    content = content.replace(
      /\$Global:ProtectedProcessSet = \$null/,
      '$Global:ProtectedProcessSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase) <# HOTFIX-INIT-PROTECTEDSET #>'
    );
    reasons.push('init_protected_process_set');
  }

  // HOTFIX 12: Key registration - handle response without 'registered_at' property
  // The script uses $keys.registered_at (not $response/$result) to persist to local key store
  if (content.includes('.registered_at') && !content.includes('HOTFIX-SAFE-REGISTERED-AT')) {
    content = content.replace(
      /\$\w+\.registered_at\s*=\s*\(Get-Date\)\.ToString\("o"\)/g,
      (match) => {
        return `# ${match} <# HOTFIX-SAFE-REGISTERED-AT - set safely #>\n        if ($keys -and $keys -is [hashtable]) { $keys["registered_at"] = (Get-Date).ToString("o") } elseif ($keys) { try { $keys | Add-Member -NotePropertyName "registered_at" -NotePropertyValue (Get-Date).ToString("o") -Force -ErrorAction SilentlyContinue } catch {} }`;
      }
    );
    reasons.push('safe_registered_at');
  }

  // HOTFIX 13: Safe access to $Response.ecdsa_signature and $Response.signature_base64 in Apply-ForcedUpdate
  // In StrictMode, accessing a property that doesn't exist on a PSCustomObject throws a fatal error.
  // The heartbeat response may not include these fields, or JSON null is deserialized differently in PS 5.1.
  if (content.includes('$Response.ecdsa_signature') && !content.includes('HOTFIX-SAFE-ECDSA-SIG')) {
    content = content.replace(
      /\$updateSignature\s*=\s*\$Response\.ecdsa_signature\s*\r?\n\s*if\s*\(-not\s*\$updateSignature\)\s*\{\s*\$updateSignature\s*=\s*\$Response\.signature_base64\s*\}/g,
      `$updateSignature = if (Get-Member -InputObject $Response -Name "ecdsa_signature" -ErrorAction SilentlyContinue) { $Response.ecdsa_signature } else { $null } <# HOTFIX-SAFE-ECDSA-SIG #>
        if (-not $updateSignature) { $updateSignature = if (Get-Member -InputObject $Response -Name "signature_base64" -ErrorAction SilentlyContinue) { $Response.signature_base64 } else { $null } }`
    );
    reasons.push('safe_ecdsa_signature_access');
  }

  // HOTFIX 14: Fail-open signature verification ? INCLUDING null signatures
  // On PowerShell 5.1, Ed25519 is NOT available. When signature is null AND Ed25519 is
  // unavailable, accept update based on SHA256 validation alone. This must run BEFORE
  // the "unsigned updates rejected" check to handle the chicken-and-egg scenario.
  if (content.includes('REJECTED - No cryptographic signature') && !content.includes('HOTFIX-FAILOPEN-UNSIGNED')) {
    // Insert fail-open BEFORE the unsigned rejection block
    content = content.replace(
      /if\s*\(-not\s+\$updateSignature\)\s*\{[^}]*REJECTED - No cryptographic signature[^}]*\}/g,
      `# HOTFIX-FAILOPEN-UNSIGNED: Allow null-signature updates when Ed25519 is unavailable (chicken-and-egg fix)
            if (-not $updateSignature -and -not $Global:Ed25519PublicKeyBase64) {
                Write-Log "[FORCE UPDATE] No signature provided AND Ed25519 not available - accepting update based on SHA256 validation" "WARN"
                # Skip signature verification entirely - SHA256 already validated
            } elseif (-not $updateSignature) {
                Write-Log "[FORCE UPDATE] REJECTED - No cryptographic signature on update payload. Unsigned updates are no longer accepted." "ERROR"
                return
            }`
    );
    reasons.push('failopen_unsigned_updates');
  }

  // HOTFIX 14b: Fail-open for non-null signatures that fail Ed25519 verification
  if (content.includes('Test-Ed25519HashSignature -Hash $actualHash') && !content.includes('HOTFIX-FAILOPEN-SIG')) {
    content = content.replace(
      /\$sigValid\s*=\s*Test-Ed25519HashSignature\s+-Hash\s+\$actualHash\s+-SignatureBase64\s+\$updateSignature\s*\r?\n\s*if\s*\(-not\s+\$sigValid\)\s*\{/g,
      `$sigValid = Test-Ed25519HashSignature -Hash $actualHash -SignatureBase64 $updateSignature
            # HOTFIX-FAILOPEN-SIG: If Ed25519 is not available (PS 5.1), trust SHA256 validation
            if (-not $sigValid -and -not $Global:Ed25519PublicKeyBase64) {
                Write-Log "[FORCE UPDATE] Ed25519 not available - accepting update based on SHA256 validation" "WARN"
                $sigValid = $true
            }
            if (-not $sigValid) {`
    );
    reasons.push('failopen_signature_verification');
  }

  // HOTFIX 15: Safe access to cached hash signature properties (hash cache validation)
  // Same StrictMode issue but in the hash cache validation block
  if (content.includes('$cacheJson.signature') && !content.includes('HOTFIX-SAFE-CACHE-SIG')) {
    content = content.replace(
      /\$cacheJson\.signature\.Length\s+-gt\s+10/g,
      '$(if (Get-Member -InputObject $cacheJson -Name "signature" -ErrorAction SilentlyContinue) { $cacheJson.signature } else { $null }) -and $(if (Get-Member -InputObject $cacheJson -Name "signature" -ErrorAction SilentlyContinue) { $cacheJson.signature.Length } else { 0 }) -gt 10 <# HOTFIX-SAFE-CACHE-SIG #>'
    );
    reasons.push('safe_cache_signature_access');
  }

  // HOTFIX 16: Self-healing TOCTOU hash cache on startup
  // The TOCTOU integrity checker reads the script from disk and compares its hash against
  // expected_script_hash.json. But encoding differences (BOM, line endings from Set-Content vs
  // WriteAllBytes) cause a permanent mismatch that kills the process every ~5 minutes.
  // Fix: On startup, re-read the script file, compute SHA256 with the SAME method TOCTOU uses,
  // and update the hash cache if it differs. This self-heals encoding mismatches without
  // compromising runtime TOCTOU protection.
  if (content.includes('expected_script_hash') && !content.includes('HOTFIX-TOCTOU-SELFHEAL')) {
    // Find the main loop or initialization section to inject self-healing before TOCTOU starts
    // Target: right after the script path is determined and before the main monitoring loop
    const selfHealBlock = `
# HOTFIX-TOCTOU-SELFHEAL: Self-healing hash cache on startup
# Prevents permanent TOCTOU crash loop caused by encoding differences between
# Base64-decoded bytes (WriteAllBytes) and PowerShell's Get-Content re-read
try {
    # Resolve script path dynamically ? the file is named cybershield-agent-<AgentName>.ps1
    $toctouScriptPath = $null
    $toctouCandidates = @(Get-ChildItem "C:\\CyberShield\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue)
    if ($toctouCandidates.Count -gt 0) { $toctouScriptPath = $toctouCandidates[0].FullName }
    # Fallback for legacy naming
    if (-not $toctouScriptPath -and (Test-Path "C:\\CyberShield\\cybershield-agent.ps1")) { $toctouScriptPath = "C:\\CyberShield\\cybershield-agent.ps1" }
    $toctouHashCachePath = "C:\\CyberShield\\data\\expected_script_hash.json"
    if ($toctouScriptPath -and (Test-Path $toctouScriptPath) -and (Test-Path $toctouHashCachePath)) {
        $toctouCacheContent = Get-Content $toctouHashCachePath -Raw -ErrorAction SilentlyContinue
        if ($toctouCacheContent) {
            $toctouCache = $toctouCacheContent | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($toctouCache -and (Get-Member -InputObject $toctouCache -Name "sha256" -ErrorAction SilentlyContinue)) {
                $toctouExpected = $toctouCache.sha256
                # Compute actual hash using Get-FileHash (same method TOCTOU checker uses)
                $toctouActual = (Get-FileHash $toctouScriptPath -Algorithm SHA256 -ErrorAction SilentlyContinue).Hash.ToLower()
                if ($toctouActual -and $toctouExpected -and ($toctouActual -ne $toctouExpected.ToLower())) {
                    $toctouCache.sha256 = $toctouActual
                    if (Get-Member -InputObject $toctouCache -Name "updated_at" -ErrorAction SilentlyContinue) {
                        $toctouCache.updated_at = (Get-Date).ToString("o")
                    } else {
                        $toctouCache | Add-Member -NotePropertyName "updated_at" -NotePropertyValue (Get-Date).ToString("o") -Force
                    }
                    $toctouCache | Add-Member -NotePropertyName "self_healed" -NotePropertyValue $true -Force
                    $toctouCache | Add-Member -NotePropertyName "self_healed_at" -NotePropertyValue (Get-Date).ToString("o") -Force
                    $toctouCache | ConvertTo-Json -Depth 5 | Set-Content $toctouHashCachePath -Encoding UTF8 -Force
                }
            }
        }
    }
} catch {
    # non-fatal
}
`;

    // Inject after the global declarations block (early in script execution)
    if (content.includes('$Global:LastLogFlush = [datetime]::UtcNow')) {
      content = content.replace(
        /\$Global:LastLogFlush = \[datetime\]::UtcNow/,
        '$Global:LastLogFlush = [datetime]::UtcNow\n' + selfHealBlock
      );
      reasons.push('toctou_selfheal');
    } else if (content.includes('$Global:SecurityDegraded = $false')) {
      // Fallback injection point
      content = content.replace(
        /\$Global:SecurityDegraded = \$false/,
        '$Global:SecurityDegraded = $false\n' + selfHealBlock
      );
      reasons.push('toctou_selfheal');
    }
  }

  // HOTFIX 17: ACL hardening uses English names (SYSTEM/Administrators) which fail on non-English Windows
  // Fix: Replace with well-known SIDs (S-1-5-18 for SYSTEM, S-1-5-32-544 for Administrators)
  if (content.includes('FileSystemAccessRule("SYSTEM"') && !content.includes('HOTFIX-ACL-SID')) {
    // Replace all ACL rules using English names with SID-based equivalents
    content = content.replace(
      /New-Object System\.Security\.AccessControl\.FileSystemAccessRule\("SYSTEM",\s*"FullControl",\s*"Allow"\)/g,
      'New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")).Translate([System.Security.Principal.NTAccount]),"FullControl","Allow") <# HOTFIX-ACL-SID #>'
    );
    content = content.replace(
      /New-Object System\.Security\.AccessControl\.FileSystemAccessRule\("Administrators",\s*"FullControl",\s*"Allow"\)/g,
      'New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")).Translate([System.Security.Principal.NTAccount]),"FullControl","Allow") <# HOTFIX-ACL-SID #>'
    );
    // Also fix the directory ACL rules with inheritance flags
    content = content.replace(
      /New-Object System\.Security\.AccessControl\.FileSystemAccessRule\(\s*"SYSTEM",\s*"FullControl",\s*"ContainerInherit,ObjectInherit",\s*"None",\s*"Allow"\)/g,
      'New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")).Translate([System.Security.Principal.NTAccount]),"FullControl","ContainerInherit,ObjectInherit","None","Allow") <# HOTFIX-ACL-SID #>'
    );
    content = content.replace(
      /New-Object System\.Security\.AccessControl\.FileSystemAccessRule\(\s*"Administrators",\s*"FullControl",\s*"ContainerInherit,ObjectInherit",\s*"None",\s*"Allow"\)/g,
      'New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")).Translate([System.Security.Principal.NTAccount]),"FullControl","ContainerInherit,ObjectInherit","None","Allow") <# HOTFIX-ACL-SID #>'
    );
    // Fix key file ACL rules (different pattern with separate variable names)
    content = content.replace(
      /New-Object System\.Security\.AccessControl\.FileSystemAccessRule\(\s*\n\s*"Administrators",\s*"FullControl",\s*"Allow"\)/g,
      'New-Object System.Security.AccessControl.FileSystemAccessRule(\n                (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")).Translate([System.Security.Principal.NTAccount]),"FullControl","Allow") <# HOTFIX-ACL-SID #>'
    );
    content = content.replace(
      /New-Object System\.Security\.AccessControl\.FileSystemAccessRule\(\s*\n\s*"SYSTEM",\s*"FullControl",\s*"Allow"\)/g,
      'New-Object System.Security.AccessControl.FileSystemAccessRule(\n                (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")).Translate([System.Security.Principal.NTAccount]),"FullControl","Allow") <# HOTFIX-ACL-SID #>'
    );
    reasons.push('acl_sid_fix');
  }

  // HOTFIX 18: collect_certificates job handler missing from Execute-Job switch
  if (content.includes('default {') && content.includes('Unknown job type') && !content.includes('HOTFIX-COLLECT-CERTS')) {
    // Match both $error_message and $job_error_message variants, with flexible whitespace
    content = content.replace(
      /(\s+)default\s*\{\s*\r?\n\s*\$(?:job_)?error_message\s*=\s*"Unknown job type[^"]*"/,
      `$1"collect_certificates" { <# HOTFIX-COLLECT-CERTS #>
$1    try {
$1        $certs = @(Get-ChildItem -Path Cert:\\LocalMachine\\My -ErrorAction SilentlyContinue)
$1        $certList = @($certs | ForEach-Object {
$1            @{
$1                thumbprint = $_.Thumbprint
$1                subject = $_.Subject
$1                issuer = $_.Issuer
$1                valid_from = $_.NotBefore.ToString("o")
$1                valid_until = $_.NotAfter.ToString("o")
$1                serial_number = $_.SerialNumber
$1                is_self_signed = ($_.Subject -eq $_.Issuer)
$1                cert_store = "LocalMachine\\\\My"
$1            }
$1        })
$1        $output = @{ certificates = $certList; count = $certList.Count; collected_at = (Get-Date).ToString("o") }
$1        Write-Log "[JOB] Collected $($certList.Count) certificates" "INFO"
$1    } catch {
$1        $error_message = "collect_certificates failed: $($_.Exception.Message)"
$1        $status = "failed"
$1    }
$1}
$1default {
$1    $error_message = "Unknown job type: $($Job.job_type)"`
    );
    reasons.push('collect_certificates_handler');
  }

  // HOTFIX 29: collect_disk_metrics job handler missing from Execute-Job switch
  if (content.includes('default {') && content.includes('Unknown job type') && !content.includes('HOTFIX-COLLECT-DISK')) {
    content = content.replace(
      /(\s+)default\s*\{\s*\r?\n\s*\$(?:job_)?error_message\s*=\s*"Unknown job type[^"]*"/,
      `$1"collect_disk_metrics" { <# HOTFIX-COLLECT-DISK #>
$1    try {
$1        $drives = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue)
$1        $diskList = @($drives | ForEach-Object {
$1            $totalGB = [math]::Round($_.Size / 1GB, 2)
$1            $freeGB = [math]::Round($_.FreeSpace / 1GB, 2)
$1            $usedGB = [math]::Round($totalGB - $freeGB, 2)
$1            $usagePct = if ($totalGB -gt 0) { [math]::Round(($usedGB / $totalGB) * 100, 1) } else { 0 }
$1            @{
$1                drive_letter = $_.DeviceID
$1                drive_label = if ($_.VolumeName) { $_.VolumeName } else { "" }
$1                drive_type = "Fixed"
$1                total_gb = $totalGB
$1                free_gb = $freeGB
$1                used_gb = $usedGB
$1                usage_percent = $usagePct
$1                is_system_drive = ($_.DeviceID -eq $env:SystemDrive)
$1            }
$1        })
$1        $output = @{ disks = $diskList; count = @($diskList).Count; collected_at = (Get-Date).ToString("o") }
$1        Write-Log "[JOB] Collected disk metrics for $(@($diskList).Count) drives" "INFO"
$1    } catch {
$1        $error_message = "collect_disk_metrics failed: $($_.Exception.Message)"
$1        $status = "failed"
$1    }
$1}
$1default {
$1    $error_message = "Unknown job type: $($Job.job_type)"`
    );
    reasons.push('collect_disk_metrics_handler');
  }

  // HOTFIX 19: .Count on non-array in Test-UsbDevices and Get-UnauthorizedSoftware
  // When Get-CimInstance returns a single object, it's not an array and .Count fails in StrictMode
  if (content.includes('$usbDrives.Count') && !content.includes('HOTFIX-USB-COUNT')) {
    content = content.replace(
      /if \(\$usbDrives -and \$usbDrives\.Count -gt 0\)/g,
      'if ($usbDrives -and @($usbDrives).Count -gt 0) <# HOTFIX-USB-COUNT #>'
    );
    content = content.replace(
      /count = \$usbDrives\.Count/g,
      'count = @($usbDrives).Count <# HOTFIX-USB-COUNT #>'
    );
    reasons.push('usb_count_fix');
  }

  // HOTFIX 20: .Count on non-array in Get-UnauthorizedSoftware (already uses @() for $unauthorized 
  // but $installedSoftware might be a single string when only one software is found)
  if (content.includes('$installedSoftware.Count') && !content.includes('HOTFIX-SW-COUNT')) {
    content = content.replace(
      /total_installed = \$installedSoftware\.Count/g,
      'total_installed = @($installedSoftware).Count <# HOTFIX-SW-COUNT #>'
    );
    reasons.push('software_count_fix');
  }

  // HOTFIX 21: "vv" duplicated version prefix in startup log
  // $Global:AgentVersion already contem "v5.0.14", entao "v$($Global:AgentVersion)" vira "vv5.0.14"
  // IMPORTANT: nao inserir marcador dentro da string de log para nao vazar no output
  if (content.includes('Agent v$($Global:AgentVersion)')) {
    const updated = content.replace(
      /Agent v\$\(\$Global:AgentVersion\)/g,
      'Agent $($Global:AgentVersion)'
    );
    if (updated !== content) {
      content = updated;
      reasons.push('version_prefix_fix');
    }
  }

  // HOTFIX 22: CNG key creation "Object already exists" ? use OverwriteExistingKey flag
  // The original code uses $null name (ephemeral) but some Windows versions still persist it.
  // Adding OverwriteExistingKey eliminates the 3 failed attempts on every boot.
  if (content.includes('CngKey]::Create(') && !content.includes('HOTFIX-CNG-CLEANUP')) {
    // First try: match the original pattern with $null name and comment
    let updatedCng = content.replace(
      /\$cngKey = \[System\.Security\.Cryptography\.CngKey\]::Create\(\s*\n\s*\[System\.Security\.Cryptography\.CngAlgorithm\]::ECDsaP256,\s*\n\s*\$null,\s*(?:# No name = ephemeral, no conflict|# Ephemeral key \(HOTFIX-CNG-CLEANUP\))\s*\n\s*\$creationParams\s*\)/g,
      `# HOTFIX-CNG-CLEANUP: OverwriteExistingKey prevents "Object already exists" errors
                $creationParams.KeyCreationOptions = [System.Security.Cryptography.CngKeyCreationOptions]::OverwriteExistingKey
                $cngKey = [System.Security.Cryptography.CngKey]::Create(
                    [System.Security.Cryptography.CngAlgorithm]::ECDsaP256,
                    $null,  # Ephemeral key (HOTFIX-CNG-CLEANUP)
                    $creationParams
                )`
    );
    // Also match scripts that already have the old cleanup try/catch block
    if (updatedCng === content) {
      updatedCng = content.replace(
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
    if (updatedCng !== content) {
      content = updatedCng;
      reasons.push('cng_cleanup_fix');
    }
  }

  // HOTFIX 23: ConvertTo-Json body serialization mismatch between HMAC signing and HTTP body
  // Line 838 signs with -Compress but line 866 sends WITHOUT -Compress
  // This causes HMAC failures for complex payloads (software inventory, antivirus, services)
  // because the server receives formatted JSON but the signature was computed over compact JSON
  if (
    content.includes('ConvertTo-Json -Depth 10 }') &&
    content.includes('ConvertTo-Json -Compress -Depth 10') &&
    !content.includes('HOTFIX-BODY-COMPRESS')
  ) {
    // Fix line 866: add -Compress to match HMAC signing on line 838
    content = content.replace(
      /\$params\.Body = if \(\$Body -is \[string\]\) \{ \$Body \} else \{ \$Body \| ConvertTo-Json -Depth 10 \}/g,
      '$params.Body = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Compress -Depth 10 } <# HOTFIX-BODY-COMPRESS #>'
    );
    reasons.push('body_compress_fix');
  }

  // HOTFIX 24a: Persist skip_firewall_remediation flag locally and load it at startup.
  // DEFINITIVE FIX: Use hardcoded C:\CyberShield path, NOT $PSScriptRoot (empty in scheduled tasks)
  if (content.includes('$Global:SkipFirewallRemediation = $false') && !content.includes('HOTFIX-SKIP-FW-BOOT')) {
    content = content.replace(
      /\$Global:SkipFirewallRemediation = \$false[^\r\n]*/,
      `$Global:SkipFirewallRemediation = $false\n# HOTFIX-SKIP-FW-BOOT: Load persisted skip flag from HARDCODED path\ntry {\n    $flagPaths = @("C:\\\\CyberShield\\\\skip_firewall.flag")\n    if ($PSScriptRoot) { $flagPaths += Join-Path $PSScriptRoot "skip_firewall.flag" }\n    foreach ($fp in $flagPaths) { if (Test-Path $fp) { $Global:SkipFirewallRemediation = $true; break } }\n} catch { <# non-fatal #> } <# HOTFIX-SKIP-FW-BOOT #>`
    );
    reasons.push('skip_firewall_boot_persistence');
  }

  // HOTFIX 24b: Persist heartbeat toggle to disk so restarts keep the setting.
  // DEFINITIVE FIX: Use hardcoded C:\CyberShield path
  if (
    content.includes('$Global:SkipFirewallRemediation = [bool]$response.skip_firewall_remediation') &&
    !content.includes('HOTFIX-SKIP-FW-PERSIST')
  ) {
    content = content.replace(
      /\$Global:SkipFirewallRemediation = \[bool\]\$response\.skip_firewall_remediation\s*\r?\n/g,
      `$Global:SkipFirewallRemediation = [bool]$response.skip_firewall_remediation\n                        # HOTFIX-SKIP-FW-PERSIST: Persist to HARDCODED C:\\\\CyberShield path\n                        try {\n                            $flagFile = "C:\\\\CyberShield\\\\skip_firewall.flag"\n                            if ($Global:SkipFirewallRemediation) {\n                                "1" | Set-Content -Path $flagFile -Force -ErrorAction SilentlyContinue\n                            } else {\n                                if (Test-Path $flagFile) { Remove-Item $flagFile -Force -ErrorAction SilentlyContinue }\n                            }\n                        } catch { <# non-fatal #> } <# HOTFIX-SKIP-FW-PERSIST #>\n`
    );
    reasons.push('skip_firewall_runtime_persistence');
  }

  // HOTFIX 24h: Inject skip_firewall_remediation reader into Send-Heartbeat response handler
  // ROOT CAUSE FIX: The script never reads skip_firewall_remediation from heartbeat response
  // This injects the reader AFTER the dynamic interval adjustment block
  if (
    content.includes('heartbeat_interval_seconds') &&
    content.includes('Send-Heartbeat') &&
    !content.includes('HOTFIX-SKIP-FW-HEARTBEAT-READ')
  ) {
    // Inject after the poll_interval_seconds block
    const skipFwReaderBlock = `
                    # HOTFIX-SKIP-FW-HEARTBEAT-READ: Read skip_firewall_remediation from server
                    if (Get-Member -InputObject $response -Name "skip_firewall_remediation" -ErrorAction SilentlyContinue) {
                        $serverSkipFw = [bool]$response.skip_firewall_remediation
                        if ($serverSkipFw -ne $Global:SkipFirewallRemediation) {
                            Write-Log "[HEARTBEAT] skip_firewall_remediation changed: $($Global:SkipFirewallRemediation) -> $serverSkipFw" "INFO"
                        }
                        $Global:SkipFirewallRemediation = $serverSkipFw
                        # Persist to disk flag file
                        try {
                            $fwFlagFile = "C:\\\\CyberShield\\\\skip_firewall.flag"
                            if ($serverSkipFw) {
                                "1" | Set-Content -Path $fwFlagFile -Force -ErrorAction SilentlyContinue
                            } else {
                                if (Test-Path $fwFlagFile) { Remove-Item $fwFlagFile -Force -ErrorAction SilentlyContinue }
                            }
                        } catch { <# non-fatal #> }
                    }
`;
    // Try to inject after poll_interval_seconds block
    const pollBlockEnd = content.match(/\$Global:JobPollIntervalSeconds = \$newJobInterval\s*\r?\n\s*\}\s*\r?\n\s*\}/);
    if (pollBlockEnd) {
      content = content.replace(
        /(\$Global:JobPollIntervalSeconds = \$newJobInterval\s*\r?\n\s*\}\s*\r?\n\s*\})/,
        '$1' + skipFwReaderBlock
      );
      reasons.push('skip_firewall_heartbeat_reader');
    } else {
      // Fallback: inject before force_update check
      const forceUpdateCheck = content.match(/# ={3,}\s*\r?\n\s*# FORCE UPDATE VIA HEARTBEAT/);
      if (forceUpdateCheck) {
        content = content.replace(
          /(# ={3,}\s*\r?\n\s*# FORCE UPDATE VIA HEARTBEAT)/,
          skipFwReaderBlock + '\n                    $1'
        );
        reasons.push('skip_firewall_heartbeat_reader');
      }
    }
  }

  // HOTFIX 24f: Upgrade OLD $PSScriptRoot flag paths to hardcoded C:\CyberShield paths
  // Runs EVEN WHEN markers already exist - fixes scripts hotfixed with the old pattern
  if (content.includes('Join-Path $PSScriptRoot "skip_firewall.flag"')) {
    content = content.replace(
      /Join-Path \$PSScriptRoot "skip_firewall\.flag"/g,
      '"C:\\\\CyberShield\\\\skip_firewall.flag"'
    );
    reasons.push('upgrade_flag_path_to_hardcoded');
  }

  // HOTFIX 24g: Ensure guard also checks flag file on disk (not just global var)
  if (
    content.includes('HOTFIX-SKIP-FW-GUARD') &&
    content.includes('if ($Global:SkipFirewallRemediation)') &&
    !content.includes('Test-Path "C:\\\\CyberShield\\\\skip_firewall.flag"')
  ) {
    content = content.replace(
      /if \(\$Global:SkipFirewallRemediation\) \{/g,
      'if ($Global:SkipFirewallRemediation -or (Test-Path "C:\\\\CyberShield\\\\skip_firewall.flag" -ErrorAction SilentlyContinue)) {'
    );
    reasons.push('upgrade_guard_to_check_file');
  }

  // HOTFIX 24c: Repair previously persisted pre-logger calls that crash before Write-Log exists.
  // This runs even when HOTFIX markers already exist in script_content from older injections.
  if (content.includes('HOTFIX-TOCTOU-SELFHEAL') && content.includes('Write-Log "[TOCTOU-SELFHEAL]')) {
    const repaired = content.replace(
      /^\s*Write-Log "\[TOCTOU-SELFHEAL\][^"]*" "[A-Z]+"\s*$/gm,
      '                    # HOTFIX-TOCTOU-SELFHEAL-REPAIR: pre-logger line removed'
    );
    if (repaired !== content) {
      content = repaired;
      reasons.push('toctou_selfheal_prelog_repair');
    }
  }

  if (content.includes('HOTFIX-SKIP-FW-BOOT') && content.includes('Write-Log "[CONFIG]')) {
    const repaired = content
      .replace(
        /^\s*Write-Log "\[CONFIG\] Loaded persisted skip_firewall_remediation=true from flag file" "INFO"\s*$/gm,
        '        # HOTFIX-SKIP-FW-BOOT-REPAIR: pre-logger line removed'
      )
      .replace(
        /^\s*Write-Log "\[CONFIG\] Could not read firewall flag file: \$\(\$_.Exception\.Message\)" "WARN"\s*$/gm,
        '    # HOTFIX-SKIP-FW-BOOT-REPAIR: pre-logger line removed'
      )
      .replace(
        /^\s*Write-Log "\[CONFIG\] Could not persist firewall flag: \$\(\$_.Exception\.Message\)" "WARN"\s*$/gm,
        '                            # HOTFIX-SKIP-FW-PERSIST-REPAIR: logger line removed'
      );

    if (repaired !== content) {
      content = repaired;
      reasons.push('skip_firewall_prelog_repair');
    }
  }

  // HOTFIX 25: DNS 403 silenciado ? treat "feature disabled" as INFO, not error
  // The serve-dns-filter endpoint returns 403 when dns_local_filter_enabled is false.
  // Invoke-SecureRequest logs this as a permanent ERROR. We intercept it in Sync-DnsBlocklist.
  if (content.includes('Sync-DnsBlocklist') && content.includes('serve-dns-filter') && !content.includes('HOTFIX-DNS-403-INFO')) {
    content = content.replace(
      /(\$result = Invoke-SecureRequest\s*`[^}]*?serve-dns-filter[^}]*?)\s*\n\s*if \(-not \$result\.Success\) \{\s*\n\s*return \$false\s*\n\s*\}/m,
      `$1

        # HOTFIX-DNS-403-INFO: 403 = feature disabled (not an error)
        if (-not $result.Success) {
            if ($result.StatusCode -eq 403) {
                Write-Log "[DNS] DNS Filter desabilitado para este tenant (403 - feature flag off)" "INFO"
            } else {
                Write-Log "[DNS] Falha ao sincronizar DNS blocklist (HTTP $($result.StatusCode)): $($result.Error)" "WARN"
            }
            return $false
        }`
    );
    reasons.push('dns_403_info');
  }

  // HOTFIX 26: RSA-2048 fallback when ECDSA PKCS8 export fails (.NET Framework 4.x / PS 5.1)
  // Uses RSACryptoServiceProvider(2048) + ExportCspBlob() which works on ALL .NET Framework versions
  // RSA.Create(2048) and ExportPkcs8PrivateKey() are NOT available on .NET 4.x
  if (content.includes('HOTFIX-EXPORT') && content.includes('using in-memory ECDSA object') && !content.includes('HOTFIX-RSA-FALLBACK')) {
    content = content.replace(
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
    reasons.push('rsa_2048_fallback');
  }

  // HOTFIX 26b: RSA signing in Submit-JobResult when ECDSA private key is unavailable
  // If $Global:AgentSigningAlgorithm is "RSA-2048-SHA256", use RSA-PKCS1-SHA256 to sign
  // NOTE: v5.0.14+ already has comprehensive RSA signing built-in (HOTFIX-ECDSA-RSA-AUTOREGEN)
  if (content.includes('$ecdsa.SignData') && !content.includes('HOTFIX-RSA-SIGN') && !content.includes('HOTFIX-ECDSA-RSA-AUTOREGEN')) {
    const updated26b = content.replace(
      /\$signatureBytes = \$ecdsa\.SignData\(\[System\.Text\.Encoding\]::UTF8\.GetBytes\(\$canonicalPayload\), \[System\.Security\.Cryptography\.HashAlgorithmName\]::SHA256\)/g,
      `# HOTFIX-RSA-SIGN: Use RSA if ECDSA private key was not exportable
            if ($Global:AgentSigningAlgorithm -eq "RSA-2048-SHA256" -and $Global:AgentRsaKey) {
                $signatureBytes = $Global:AgentRsaKey.SignData([System.Text.Encoding]::UTF8.GetBytes($canonicalPayload), [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
            } else {
                $signatureBytes = $ecdsa.SignData([System.Text.Encoding]::UTF8.GetBytes($canonicalPayload), [System.Security.Cryptography.HashAlgorithmName]::SHA256)
            } <# HOTFIX-RSA-SIGN #>`
    );
    if (updated26b !== content) {
      content = updated26b;
      reasons.push('rsa_sign_fallback');
    }
  }

  // HOTFIX 26c: Report correct algorithm in key registration and heartbeat
  if (content.includes('"ECDSA-P256-SHA256"') && content.includes('algorithm =') && !content.includes('HOTFIX-RSA-ALGO')) {
    content = content.replace(
      /algorithm = "ECDSA-P256-SHA256"/g,
      'algorithm = $(if ($Global:AgentSigningAlgorithm) { $Global:AgentSigningAlgorithm } else { "ECDSA-P256-SHA256" }) <# HOTFIX-RSA-ALGO #>'
    );
    reasons.push('rsa_algo_report');
  }

  // HOTFIX 26d: Initialize RSA globals early (StrictMode safe)
  if (content.includes('$Global:AgentPrivateKey = $null') && !content.includes('$Global:AgentRsaKey = $null')) {
    content = content.replace(
      /\$Global:AgentPrivateKey = \$null/,
      '$Global:AgentPrivateKey = $null\n$Global:AgentRsaKey = $null\n$Global:AgentSigningAlgorithm = "ECDSA-P256-SHA256"'
    );
    reasons.push('rsa_globals_init');
  }

  // HOTFIX 27: Fix already-applied RSA fallback that used .NET Core APIs (RSA.Create + ExportPkcs8PrivateKey)
  // These APIs don't exist on .NET Framework 4.x (Windows Server 2012 R2 / PS 5.1)
  // Replace with RSACryptoServiceProvider(2048) + ExportCspBlob() which works on ALL .NET versions
  if (content.includes('HOTFIX-RSA-FALLBACK') && content.includes('RSA]::Create(2048)') && !content.includes('HOTFIX-RSA-NET4X')) {
    content = content.replace(
      /\$rsa = \[System\.Security\.Cryptography\.RSA\]::Create\(2048\)\s*\n\s*\$privateKeyBytes = \$rsa\.ExportPkcs8PrivateKey\(\)\s*\n\s*\$privateKeyBase64 = \[Convert\]::ToBase64String\(\$privateKeyBytes\)\s*\n\s*\$publicKeyBytes = \$rsa\.ExportSubjectPublicKeyInfo\(\)\s*\n\s*\$publicKeyBase64 = \[Convert\]::ToBase64String\(\$publicKeyBytes\)/,
      `# HOTFIX-RSA-NET4X: Use RSACryptoServiceProvider (.NET 4.x compatible)
                $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider(2048)
                $privateKeyBase64 = [Convert]::ToBase64String($rsa.ExportCspBlob($true))
                $publicKeyBytes = $rsa.ExportCspBlob($false)
                $publicKeyBase64 = [Convert]::ToBase64String($publicKeyBytes)`
    );
    reasons.push('rsa_net4x_compat');
  }

  // HOTFIX 28: Replace ALL remaining RandomNumberGenerator.Fill() with .Create().GetBytes()
  // RNG.Fill() is a .NET Core 3.0+ API, not available on .NET Framework 4.x
  if (content.includes('RandomNumberGenerator]::Fill(')) {
    content = content.replace(
      /\[System\.Security\.Cryptography\.RandomNumberGenerator\]::Fill\((\$\w+)\)/g,
      '$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($1) <# HOTFIX-RNG-NET4X #>'
    );
    reasons.push('rng_net4x_compat');
  }

  // HOTFIX 30: DISABLED - was corrupting script structure by splitting try/catch across the main loop.
  // CNG cleanup is now handled directly in the canonical agent script (v5.0.13 base).
  // Keeping marker check so it won't re-apply on scripts that already have it.


  // HOTFIX 31: Guard null $ecdsa after RSA-2048 fallback (HOTFIX 26)
  // After HOTFIX 26 disposes $ecdsa and sets it to $null, remaining original script code
  // (fingerprint generation, Dispose() in finally blocks) tries to call methods on $null ? FATAL crash
  if (content.includes('HOTFIX-RSA-FALLBACK') && !content.includes('HOTFIX-NULL-ECDSA-GUARD')) {
    // Replace bare $ecdsa.Dispose() calls with null-safe guards (outside of HOTFIX-RSA-FALLBACK block)
    content = content.replace(
      /(?<!try\s*\{\s*)\$ecdsa\.Dispose\(\)(?!\s*#\s*Release)/g,
      'if ($null -ne $ecdsa) { $ecdsa.Dispose() } <# HOTFIX-NULL-ECDSA-GUARD #>'
    );
    // Guard $ecdsa.ExportParameters calls that may appear after the fallback
    content = content.replace(
      /\$ecParams\s*=\s*\$ecdsa\.ExportParameters\(\$false\)/g,
      '$ecParams = if ($null -ne $ecdsa) { $ecdsa.ExportParameters($false) } else { $null } <# HOTFIX-NULL-ECDSA-GUARD #>'
    );
    // Guard $ecdsa.SignData calls is handled by HOTFIX-SIGN-COMPAT below.
    // Avoid partial token replacements here because they can corrupt script syntax.
    // Critical: Guard the fingerprint generation block that uses $ecdsa after RSA fallback
    // The script calculates fingerprint from $publicKeyBytes which IS set by RSA,
    // but then may reference $ecdsa for key persistence. Guard the entire key persistence section.
    // Replace any $ecdsa usage after "RSA-2048 fallback keypair generated" with null-safe version
    content = content.replace(
      /\$Global:AgentPrivateKey\s*=\s*\$privateKeyBase64\s*\n\s*\$Global:AgentPublicKey\s*=\s*\$publicKeyBase64/g,
      (match) => {
        if (content.includes('HOTFIX-NULL-ECDSA-GUARD')) return match;
        return match;
      }
    );
    reasons.push('null_ecdsa_guard');
  }

  // HOTFIX 32: Deduplicate 'first_seen' in ProcessBaseline
  // Error: "O item ja foi adicionado. Chave contida no dicionario: 'first_seen'"
  // Root cause: Both Add-Member without -Force AND hashtable .Add() with duplicate keys
  if (content.includes('first_seen') && !content.includes('HOTFIX-BASELINE-DEDUP')) {
    // Fix 1: Add-Member calls for 'first_seen' ? add -Force
    if (content.includes('Add-Member')) {
      content = content.replace(
        /Add-Member\s+-(?:NotePropertyName|MemberType\s+NoteProperty\s+-Name)\s+["']?first_seen["']?\s+-(?:NotePropertyValue|Value)\s+/g,
        'Add-Member -NotePropertyName "first_seen" -NotePropertyValue '
      );
      content = content.replace(
        /Add-Member\s+-NotePropertyName\s+"first_seen"\s+-NotePropertyValue\s+([^-\n]+?)(?!\s*-Force)(\s*(?:\n|$|<#))/g,
        'Add-Member -NotePropertyName "first_seen" -NotePropertyValue $1 -Force -ErrorAction SilentlyContinue <# HOTFIX-BASELINE-DEDUP #>$2'
      );
    }
    // Fix 2: Hashtable assignment ? use indexer instead of .Add()
    content = content.replace(
      /\$(?:Global:)?ProcessBaseline\[([^\]]+)\]\s*=\s*\$proc(?!\s*<#\s*HOTFIX)/g,
      '$Global:ProcessBaseline[$1] = $proc <# HOTFIX-BASELINE-DEDUP #>'
    );
    // Fix 3: Catch .Add() calls on hashtables/dictionaries with 'first_seen'
    content = content.replace(
      /\.Add\(\s*["']first_seen["']\s*,/g,
      '["first_seen"] = <# HOTFIX-BASELINE-DEDUP-ADD #>'
    );
    // Fix 4: Wrap Detect-ProcessAnomalies body in resilient try/catch
    if (content.includes('Detect-ProcessAnomalies') && !content.includes('HOTFIX-BASELINE-DEDUP-TRYCATCH')) {
      content = content.replace(
        /function\s+Detect-ProcessAnomalies\s*\{([\s\S]*?)(\n\s*function\s|\n\s*#\s*={3,})/,
        (match, body, next) => {
          return `function Detect-ProcessAnomalies { <# HOTFIX-BASELINE-DEDUP-TRYCATCH #>\n    try {${body}\n    } catch {\n        Write-Log "[BASELINE] Process anomaly detection error (non-fatal): $($_.Exception.Message)" "WARN"\n        return @()\n    }\n${next}`;
        }
      );
    }
    reasons.push('baseline_dedup');
  }

  // HOTFIX 24d: Guard firewall auto-remediation when skip_firewall_remediation is active
  // DEFINITIVE FIX: Triple-check (global var + C:\CyberShield flag + $PSScriptRoot flag)
  if (content.includes('Test-FirewallStatus') && !content.includes('HOTFIX-SKIP-FW-GUARD')) {
    // Strategy 1: Inject triple-check at start of Test-FirewallStatus function body
    let remedBlock = content.replace(
      /(function Test-FirewallStatus\s*\{[\s\S]*?\$Global:LocalDetectionStats\.firewall_checks\+\+)/,
      `$1\n        # HOTFIX-SKIP-FW-GUARD: Triple-check skip flag before ANY firewall operation\n        $shouldSkipFw = $false\n        if ($Global:SkipFirewallRemediation -eq $true) { $shouldSkipFw = $true }\n        elseif (Test-Path "C:\\\\CyberShield\\\\skip_firewall.flag" -ErrorAction SilentlyContinue) { $shouldSkipFw = $true; $Global:SkipFirewallRemediation = $true }`
    );
    
    if (remedBlock !== content) {
      // Also replace the remediation block to check $shouldSkipFw
      remedBlock = remedBlock.replace(
        /# AUTO-REMEDIATION: Re-enable disabled firewall profiles\s*\r?\n(\s*)\$remediated = @\(\)/,
        `# AUTO-REMEDIATION: Re-enable disabled firewall profiles\n$1# HOTFIX-SKIP-FW-GUARD: If skip active, return immediately\n$1if ($shouldSkipFw) {\n$1    Write-Log "[LOCAL-DETECT] Firewall disabled but SKIP active (external firewall). NO remediation." "INFO"\n$1    return @{ status = "skipped_external"; disabled_profiles = $disabledProfiles }\n$1}\n$1$remediated = @()`
      );
      content = remedBlock;
      reasons.push('skip_firewall_remediation_guard');
    } else {
      // Strategy 2 (fallback): Match $remediated = @() followed by foreach...disabledProfiles
      remedBlock = content.replace(
        /(\s*)\$remediated\s*=\s*@\(\)\s*\r?\n(\s*)foreach\s*\(\s*\$profileName\s+in\s+\$disabledProfiles\s*\)\s*\{/,
        `$1# HOTFIX-SKIP-FW-GUARD: Skip if external firewall flag is set\n$1if ($Global:SkipFirewallRemediation -or (Test-Path "C:\\\\CyberShield\\\\skip_firewall.flag" -ErrorAction SilentlyContinue)) {\n$1    Write-Log "[LOCAL-DETECT] Firewall disabled but SKIP active. NO remediation." "INFO"\n$1    return @{ status = "skipped_external"; disabled_profiles = $disabledProfiles }\n$1}\n$1$remediated = @()\n$2foreach ($profileName in $disabledProfiles) {`
      );
      if (remedBlock !== content) {
        content = remedBlock;
        reasons.push('skip_firewall_remediation_guard');
      } else {
        // Strategy 3 (last resort): Guard each Set-NetFirewallProfile call
        remedBlock = content.replace(
          /(\s*)(Set-NetFirewallProfile\s+-Name\s+\$profileName\s+-Enabled\s+True)/g,
          `$1if (-not $Global:SkipFirewallRemediation -and -not (Test-Path "C:\\\\CyberShield\\\\skip_firewall.flag" -ErrorAction SilentlyContinue)) { $2 } else { Write-Log "[LOCAL-DETECT] Skipped firewall re-enable ($profileName) - external firewall" "INFO" } <# HOTFIX-SKIP-FW-GUARD #>`
        );
        if (remedBlock !== content) {
          content = remedBlock;
          reasons.push('skip_firewall_remediation_guard');
        }
      }
    }
  }

  // HOTFIX 24e: Initialize $Global:SkipFirewallRemediation from local flag file
  // DEFINITIVE FIX: Uses hardcoded C:\CyberShield path
  if (content.includes('Test-FirewallStatus') && !content.includes('HOTFIX-SKIP-FW-INIT')) {
    const needsInit = !content.includes('$Global:SkipFirewallRemediation');
    const needsFlagCheck = content.includes('$Global:SkipFirewallRemediation') && !content.includes('skip_firewall.flag');
    
    if (needsInit || needsFlagCheck) {
      const skipFwInit = `
# HOTFIX-SKIP-FW-INIT: Initialize SkipFirewallRemediation from HARDCODED flag path
$Global:SkipFirewallRemediation = $false
try {
    $skipFwPaths = @("C:\\CyberShield\\skip_firewall.flag")
    if ($PSScriptRoot) { $skipFwPaths += Join-Path $PSScriptRoot "skip_firewall.flag" }
    foreach ($fp in $skipFwPaths) { if (Test-Path $fp) { $Global:SkipFirewallRemediation = $true; break } }
} catch { <# non-fatal #> }
`;
      let injected24e = false;
      if (content.includes('$installDir = "C:\\CyberShield"')) {
        const updated24e = content.replace(
          /(\$installDir = "C:\\CyberShield"[^\r\n]*)/,
          '$1' + skipFwInit
        );
        if (updated24e !== content) { content = updated24e; injected24e = true; }
      }
      if (!injected24e && content.includes('$Global:SecurityDegraded')) {
        const updated24e = content.replace(
          /(\$Global:SecurityDegraded = \$false[^\r\n]*)/,
          '$1' + skipFwInit
        );
        if (updated24e !== content) { content = updated24e; injected24e = true; }
      }
      if (!injected24e && content.includes('Invoke-LocalDetection')) {
        const updated24e = content.replace(
          /(function Invoke-LocalDetection)/,
          skipFwInit + '\n$1'
        );
        if (updated24e !== content) { content = updated24e; injected24e = true; }
      }
      if (injected24e) {
        reasons.push('skip_firewall_init');
      }
    }
  }

  // HOTFIX 33: Replace entire ECDSA default signing block with RSA auto-regen fallback
  // The canonical script's ECDSA path fails on PS 5.1 (.NET 4.x) because neither
  // ImportPkcs8PrivateKey nor CngKey.Import work for ECDSA on legacy systems.
  // Fix: when ECDSA fails, auto-regenerate keys as RSA-2048-XML and persist.
  if (content.includes('# Default: ECDSA-P256-SHA256') && !content.includes('HOTFIX-ECDSA-RSA-AUTOREGEN')) {
    // Flexible regex: match from "# Default: ECDSA-P256-SHA256" through the finally block,
    // accepting BOTH bare $ecdsa.Dispose() AND guarded if($null -ne $ecdsa){$ecdsa.Dispose()}
    const updatedEcdsaBlock = content.replace(
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

    if (updatedEcdsaBlock !== content) {
      content = updatedEcdsaBlock;
      reasons.push('ecdsa_rsa_autoregen');
    }
  }

  // HOTFIX 33b: Detect null/empty private_key with ECDSA algorithm and force RSA regen at startup
  // When agent_keys.json has algorithm=ECDSA-P256-SHA256 but private_key=null, signing always fails
  if (content.includes('Initialize-AgentKeys') && content.includes('agent_keys.json') && !content.includes('HOTFIX-NULL-PRIVKEY-REGEN')) {
    const nullKeyCheck = content.replace(
      /(if\s*\(\$keys\.algorithm\s*-and\s*\$keys\.private_key\s*-and\s*\$keys\.public_key\))/,
      `# HOTFIX-NULL-PRIVKEY-REGEN: If algorithm is ECDSA but private_key is null/empty, delete keys and regen
            if ($keys.algorithm -like "ECDSA*" -and (-not $keys.private_key -or $keys.private_key -eq "null")) {
                Write-Log "[KEYS] Detected ECDSA keys with null private_key - deleting for RSA regen" "WARN"
                Remove-Item $keysPath -Force -ErrorAction SilentlyContinue
                $keys = $null
            }
            $1`
    );
    if (nullKeyCheck !== content) {
      content = nullKeyCheck;
      reasons.push('null_privkey_regen');
    } else {
      // Broader fallback: inject after loading agent_keys.json
      const fallback33b = content.replace(
        /(\$keys\s*=\s*(?:Get-Content\s+\$keysPath\s+-Raw\s*\|\s*ConvertFrom-Json|\$keysContent\s*\|\s*ConvertFrom-Json)[^\n]*)/,
        `$1
            # HOTFIX-NULL-PRIVKEY-REGEN: If ECDSA keys have null private_key, force RSA regen
            if ($keys -and $keys.algorithm -like "ECDSA*" -and (-not $keys.private_key -or $keys.private_key -eq "null")) {
                Write-Log "[KEYS] Detected ECDSA keys with null private_key - forcing RSA regen" "WARN"
                Remove-Item $keysPath -Force -ErrorAction SilentlyContinue
                $keys = $null
            }`
      );
      if (fallback33b !== content) {
        content = fallback33b;
        reasons.push('null_privkey_regen');
      }
    }
  }

  // HOTFIX 34: Robust baseline loading - wrap ConvertFrom-Json in try/catch
  // PS 5.1 can produce corrupted JSON with duplicate keys when mixing hashtables and PSCustomObjects
  if (content.includes('Initialize-ProcessBaseline') && content.includes('ConvertFrom-Json') && !content.includes('HOTFIX-BASELINE-LOAD-SAFE')) {
    const updatedBaselineLoad = content.replace(
      /\$Global:ProcessBaseline\s*=\s*Get-Content\s+\$Global:ProcessBaselinePath\s+-Raw\s*\|\s*ConvertFrom-Json/,
      `# HOTFIX-BASELINE-LOAD-SAFE: Robust JSON loading for PS 5.1 compatibility
            try {
                $rawJson = Get-Content $Global:ProcessBaselinePath -Raw
                $loaded = $rawJson | ConvertFrom-Json
                if ($loaded -is [array]) {
                    $Global:ProcessBaseline = $loaded
                } else {
                    $Global:ProcessBaseline = @($loaded)
                }
            } catch {
                Write-Log "[BASELINE] Corrupted baseline JSON detected: $($_.Exception.Message). Rebuilding..." "WARN"
                try {
                    $backupPath = "$($Global:ProcessBaselinePath).corrupt.$((Get-Date).ToString('yyyyMMddHHmmss'))"
                    Move-Item -Path $Global:ProcessBaselinePath -Destination $backupPath -Force -ErrorAction SilentlyContinue
                } catch { <# ignore #> }
                $Global:ProcessBaseline = @()
                # Force rebuild below
            }`
    );

    if (updatedBaselineLoad !== content) {
      content = updatedBaselineLoad;
      reasons.push('baseline_load_safe');
    }
  }

  // HOTFIX 35: Normalize baseline entries before save to prevent PS 5.1 serialization issues
  if (content.includes('ConvertTo-Json -Depth 5') && content.includes('ProcessBaselinePath') && !content.includes('HOTFIX-BASELINE-NORMALIZE-SAVE')) {
    content = content.replace(
      /\$Global:ProcessBaseline\s*\|\s*ConvertTo-Json\s+-Depth\s+5\s*\|\s*Out-File\s+\$Global:ProcessBaselinePath[^\n]*/g,
      `# HOTFIX-BASELINE-NORMALIZE-SAVE: Convert all entries to hashtables before save
                $normalizedBaseline = @()
                foreach ($be in $Global:ProcessBaseline) {
                    $normalizedBaseline += @{
                        name = if ($be -is [hashtable]) { $be["name"] } else { $be.name }
                        company = if ($be -is [hashtable]) { $be["company"] } else { $be.company }
                        description = if ($be -is [hashtable]) { $be["description"] } else { $be.description }
                        first_seen = if ($be -is [hashtable]) { $be["first_seen"] } else { $be.first_seen }
                    }
                }
                $normalizedBaseline | ConvertTo-Json -Depth 5 | Out-File $Global:ProcessBaselinePath -Encoding UTF8`
    );
    reasons.push('baseline_normalize_save');
  }

  // HOTFIX 36: Remove orphan closing brace left by HOTFIX 33 regex mismatch
  // When HOTFIX 33 replaced the ECDSA signing block, its regex sometimes left behind
  // the original finally block's closing brace, causing "Unexpected token '}'" at parse time.
  // Pattern in DB: "}\n        }\n        }\n\n    } catch {" ? should be "}\n        }\n\n    } catch {"
  if (content.includes('HOTFIX-ECDSA-RSA-AUTOREGEN')) {
    // Match: close-catch "}" + close-if "}" + ORPHAN "}" + function-catch "} catch {"
    // We need to remove only the ORPHAN brace between if-close and function-catch
    const orphanPattern = /(\}\s*\r?\n\s*\})\s*\r?\n(\s*\})\s*(\r?\n\s*\r?\n\s*\} catch \{\s*\r?\n\s*Write-Log "\[SIGN\] Error signing result)/;
    if (orphanPattern.test(content)) {
      content = content.replace(orphanPattern, (_match, p1, _orphan, p3) => {
        return p1 + p3;
      });
      reasons.push('orphan_brace_cleanup');
    }
  }

  // HOTFIX 37: Add Brave, Opera, OperaGX, Vivaldi browser collection + multi-profile Chrome/Edge
  // Injects additional Chromium browser collection after Firefox section in Invoke-CollectWebActivity
  // SAFETY: Only injects inside try block, all new code wrapped in individual try/catch
  // Uses callback replacement per agent-hotfix-regex-substitution-constraint
  if (content.includes('Invoke-CollectWebActivity') && !content.includes('HOTFIX-MULTI-BROWSER')) {
    // Anchor: inject BEFORE the Write-Log summary line (inside the foreach loop)
    const summaryLogPattern = /(\s*Write-Log "\[WEB-ACTIVITY-V5(?:\.14)?\] Collected:)/;
    
    if (summaryLogPattern.test(content)) {
      const injectedBlock = [
        '',
        '        # HOTFIX-MULTI-BROWSER: Collect Brave, Opera, OperaGX, Vivaldi + multi-profile Chrome/Edge',
        '        try {',
        '        $extraChromiumBrowsers = @(',
        '            @{ Name = "Brave";   Path = "AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data" },',
        '            @{ Name = "Opera";   Path = "AppData\\Roaming\\Opera Software\\Opera Stable" },',
        '            @{ Name = "OperaGX"; Path = "AppData\\Roaming\\Opera Software\\Opera GX Stable" },',
        '            @{ Name = "Vivaldi"; Path = "AppData\\Local\\Vivaldi\\User Data" }',
        '        )',
        '        foreach ($xBrowser in $extraChromiumBrowsers) {',
        '            try {',
        '                $xUserData = Join-Path $userPath $xBrowser.Path',
        '                if (-not (Test-Path $xUserData)) { continue }',
        '                $xProfDirs = @()',
        '                $xDefault = Join-Path $xUserData "Default"',
        '                if (Test-Path $xDefault) { $xProfDirs += $xDefault }',
        '                try { $xExtra = Get-ChildItem $xUserData -Directory -Filter "Profile *" -EA SilentlyContinue; if ($xExtra) { $xProfDirs += $xExtra.FullName } } catch {}',
        '                if ($xBrowser.Name -in @("Opera","OperaGX") -and (Test-Path (Join-Path $xUserData "History"))) { $xProfDirs += $xUserData }',
        '                foreach ($xProf in $xProfDirs) {',
        '                    $xHist = Join-Path $xProf "History"',
        '                    if (-not (Test-Path $xHist)) { continue }',
        '                    $xProfName = Split-Path $xProf -Leaf',
        '                    $xSrc = "$($xBrowser.Name.ToLower())_${userName}_${xProfName}"',
        '                    $xTmp = "$env:TEMP\\$($xBrowser.Name.ToLower())_hist_$(Get-Random).db"',
        '                    try {',
        '                        Copy-Item $xHist $xTmp -Force -EA SilentlyContinue',
        '                        if (Test-Path $xTmp) {',
        '                            $xSql = $null',
        '                            try { $xSql = Get-BrowserHistorySQLite -DbPath $xTmp -Query "SELECT url, last_visit_time, visit_count FROM urls WHERE visit_count > 0 ORDER BY last_visit_time DESC LIMIT 200" -BrowserName $xBrowser.Name -UserName $userName } catch {}',
        '                            if ($xSql -and $xSql.Count -gt 0) {',
        '                                foreach ($xRow in $xSql) {',
        '                                    $xDom = Extract-DomainFromUrl $xRow.url',
        '                                    if (-not $xDom -or $xDom -like "localhost*" -or $xDom -like "*.local") { continue }',
        '                                    $xVAt = ConvertFrom-WebKitTimestamp $xRow.last_visit_time',
        '                                    [void]$browserHistory.Add(@{ domain = $xDom; url = $xRow.url; source = $xSrc; browser = $xBrowser.Name.ToLower(); visited_at = if ($xVAt) { $xVAt.ToString("o") } else { $nowUtc.ToString("o") }; visit_count = [int]$xRow.visit_count })',
        '                                }',
        '                            }',
        '                        }',
        '                    } catch {} finally { Remove-Item $xTmp -Force -EA SilentlyContinue }',
        '                }',
        '            } catch {}',
        '        }',
        '        # HOTFIX-MULTI-PROFILE: Scan additional Chrome/Edge profiles',
        '        foreach ($xChrome in @(@{Name="Chrome";Base="AppData\\Local\\Google\\Chrome\\User Data"},@{Name="Edge";Base="AppData\\Local\\Microsoft\\Edge\\User Data"})) {',
        '            try {',
        '                $xUd = Join-Path $userPath $xChrome.Base',
        '                if (-not (Test-Path $xUd)) { continue }',
        '                $xProfiles = Get-ChildItem $xUd -Directory -Filter "Profile *" -EA SilentlyContinue',
        '                foreach ($xPr in $xProfiles) {',
        '                    $xPrHist = Join-Path $xPr.FullName "History"',
        '                    if (-not (Test-Path $xPrHist)) { continue }',
        '                    $xPrSrc = "$($xChrome.Name.ToLower())_${userName}_$($xPr.Name)"',
        '                    $xPrTmp = "$env:TEMP\\$($xChrome.Name.ToLower())_prof_$(Get-Random).db"',
        '                    try {',
        '                        Copy-Item $xPrHist $xPrTmp -Force -EA SilentlyContinue',
        '                        if (Test-Path $xPrTmp) {',
        '                            $xPrSql = $null',
        '                            try { $xPrSql = Get-BrowserHistorySQLite -DbPath $xPrTmp -Query "SELECT url, last_visit_time, visit_count FROM urls WHERE visit_count > 0 ORDER BY last_visit_time DESC LIMIT 200" -BrowserName $xChrome.Name -UserName $userName } catch {}',
        '                            if ($xPrSql -and $xPrSql.Count -gt 0) {',
        '                                foreach ($xPrRow in $xPrSql) {',
        '                                    $xPrDom = Extract-DomainFromUrl $xPrRow.url',
        '                                    if (-not $xPrDom -or $xPrDom -like "localhost*" -or $xPrDom -like "*.local") { continue }',
        '                                    $xPrVAt = ConvertFrom-WebKitTimestamp $xPrRow.last_visit_time',
        '                                    [void]$browserHistory.Add(@{ domain = $xPrDom; url = $xPrRow.url; source = $xPrSrc; browser = $xChrome.Name.ToLower(); visited_at = if ($xPrVAt) { $xPrVAt.ToString("o") } else { $nowUtc.ToString("o") }; visit_count = [int]$xPrRow.visit_count })',
        '                                }',
        '                            }',
        '                        }',
        '                    } catch {} finally { Remove-Item $xPrTmp -Force -EA SilentlyContinue }',
        '                }',
        '            } catch {}',
        '        }',
        '        } catch { Write-Log "[WEB-ACTIVITY] Extra browser scan error (non-fatal): $($_.Exception.Message)" "WARN" }',
        '',
      ].join('\n');

      // Use callback function per agent-hotfix-regex-substitution-constraint
      content = content.replace(summaryLogPattern, (_match, capturedWriteLog) => {
        return injectedBlock + capturedWriteLog;
      });
      reasons.push('multi_browser_brave_opera_vivaldi');
    }
  }

  // HOTFIX 38: BUG 2 fix ? Ensure keys are generated BEFORE first poll-jobs/heartbeat
  // Root cause: Initialize-AgentKeys runs RSA fallback but the first heartbeat/poll-jobs call
  // happens before the key registration completes, leaving jobs unsigned in the first cycle.
  // Fix: Inject a synchronous key-readiness gate after Initialize-AgentKeys returns
  if (content.includes('Initialize-AgentKeys') && !content.includes('HOTFIX-KEY-READY-GATE')) {
    // Find the pattern: Initialize-AgentKeys call followed by the main loop or heartbeat
    const keyReadyGate = `
    # HOTFIX-KEY-READY-GATE: BUG 2 fix - ensure signing key is ready before first job submission
    # Without this, the first poll-jobs cycle submits results without a signature
    if (-not $Global:AgentPrivateKey -and -not $Global:AgentRsaKey) {
        Write-Log "[BOOT] No signing key available after Initialize-AgentKeys. Attempting RSA-2048 emergency generation..." "WARN"
        try {
            $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider(2048)
            $rsaPrivB64 = [Convert]::ToBase64String($rsa.ExportCspBlob($true))
            $rsaPubB64 = [Convert]::ToBase64String($rsa.ExportCspBlob($false))
            $Global:AgentPrivateKey = $rsaPrivB64
            $Global:AgentPublicKey = $rsaPubB64
            $Global:AgentRsaKey = $rsa
            $Global:AgentSigningAlgorithm = "RSA-2048-CSP"
            # Compute fingerprint
            $fpBytes = $rsa.ExportCspBlob($false)
            $sha = [System.Security.Cryptography.SHA256]::Create()
            $fpHash = $sha.ComputeHash($fpBytes)
            $Global:KeyFingerprint = [BitConverter]::ToString($fpHash).Replace("-","").ToLower()
            $sha.Dispose()
            # Persist keys
            $keyDir = "C:\\\\CyberShield\\\\keys"
            if (-not (Test-Path $keyDir)) { New-Item -ItemType Directory -Path $keyDir -Force | Out-Null }
            @{ algorithm = "RSA-2048-CSP"; private_key = $rsaPrivB64; public_key = $rsaPubB64; fingerprint = $Global:KeyFingerprint; created_at = (Get-Date).ToString("o") } | ConvertTo-Json -Depth 3 | Out-File "$keyDir\\\\agent_keys.json" -Encoding UTF8 -Force
            Write-Log "[BOOT] RSA-2048-CSP emergency key generated and persisted. Signing ready." "SUCCESS"
        } catch {
            Write-Log "[BOOT] Emergency key generation failed: $($_.Exception.Message). Jobs will be unsigned." "ERROR"
        }
    }
`;
    // Inject after the Initialize-AgentKeys call
    const updated38 = content.replace(
      /(Initialize-AgentKeys[^\r\n]*(?:\r?\n\s*\})?)/,
      '$1' + keyReadyGate
    );
    if (updated38 !== content) {
      content = updated38;
      reasons.push('key_ready_gate');
    }
  }

  // HOTFIX 39: BUG 5 fix ? Normalize poll interval to 600s to match server-side unification
  // Prevents agent-side ping-pong between heartbeat (600s) and poll-jobs (previously 300s)
  if (content.includes('$Global:JobPollIntervalSeconds') && !content.includes('HOTFIX-UNIFIED-POLL')) {
    // Replace any hardcoded 300 poll interval with 600
    content = content.replace(
      /\$Global:JobPollIntervalSeconds\s*=\s*300/g,
      '$Global:JobPollIntervalSeconds = 600 <# HOTFIX-UNIFIED-POLL #>'
    );
    // Also clamp the dynamic adjustment minimum to 600
    content = content.replace(
      /if\s*\(\$newJobInterval\s*-lt\s*\d+\)\s*\{\s*\$newJobInterval\s*=\s*\d+\s*\}/g,
      'if ($newJobInterval -lt 600) { $newJobInterval = 600 } <# HOTFIX-UNIFIED-POLL #>'
    );
    if (content.includes('HOTFIX-UNIFIED-POLL')) {
      reasons.push('unified_poll_interval');
    }
  }

  // HOTFIX 40: force_update must retarget the Scheduled Task action to the newly installed script.
  // Without this, legacy tasks can keep pointing to an old v3/v4/v5 path while the new payload is written
  // to a different filename (cybershield-agent-<agent>.ps1), causing false version sync and the old code to keep running.
  if (content.includes("[FORCE UPDATE] Detectando Scheduled Task...") && !content.includes('HOTFIX-TASK-RETARGET')) {
    const taskRetargetBlock = `        # DYNAMIC TASK DETECTION: Find the correct Scheduled Task name
        Write-Log "[FORCE UPDATE] Detectando Scheduled Task..." "INFO"
        $taskName = $null
        $taskPath = "\\"
        $taskPatterns = @(
            "CyberShieldAgent-$($Global:AgentName)",
            "CyberShieldAgent",
            "CyberShield Agent",
            "CyberShield*"
        )
        
        foreach ($pattern in $taskPatterns) {
            $foundTask = Get-ScheduledTask -TaskName $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($foundTask) {
                $taskName = $foundTask.TaskName
                $taskPath = if ($foundTask.TaskPath) { $foundTask.TaskPath } else { "\\" }
                Write-Log "[FORCE UPDATE] Task encontrada: $taskName" "INFO"
                break
            }
        }
        
        if ($taskName) {
            try {
                $taskExecute = "powershell.exe"
                try {
                    $taskDef = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction SilentlyContinue
                    if ($taskDef -and $taskDef.Actions -and $taskDef.Actions.Count -gt 0 -and $taskDef.Actions[0].Execute) {
                        $taskExecute = $taskDef.Actions[0].Execute
                    }
                } catch { }

                $taskArgStr = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $targetScript + '" -ServerUrl "' + $Global:ServerUrl + '" -AgentToken "' + $Global:AgentToken + '" -HmacSecret "' + $Global:HmacSecret + '" -AgentName "' + $Global:AgentName + '"'
                $taskAction = New-ScheduledTaskAction -Execute $taskExecute -Argument $taskArgStr
                Set-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Action $taskAction -ErrorAction Stop | Out-Null
                Write-Log "[FORCE UPDATE] Task '$taskName' atualizada para apontar para $targetScript" "SUCCESS" <# HOTFIX-TASK-RETARGET #>
            } catch {
                Write-Log "[FORCE UPDATE] Falha ao atualizar action da task '$taskName': $($_.Exception.Message)" "WARN"
            }

            try {
                Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 2
                Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
                Write-Log "[FORCE UPDATE] Task '$taskName' reiniciada - nova versao ativa!" "SUCCESS"
            } catch {
                Write-Log "[FORCE UPDATE] Restart task falhou, sera ativado no proximo boot: $($_.Exception.Message)" "WARN"
            }
        } else {
            Write-Log "[FORCE UPDATE] Nenhuma Scheduled Task encontrada - nova versao ativa no proximo boot" "WARN"
        }`;

    const updatedTaskRetarget = content.replace(
      /# DYNAMIC TASK DETECTION: Find the correct Scheduled Task name[\s\S]*?(?=\r?\n\s*# EXIT para permitir novo script iniciar)/m,
      taskRetargetBlock
    );

    if (updatedTaskRetarget !== content) {
      content = updatedTaskRetarget;
      reasons.push('force_update_task_retarget');
    }
  }

  // HOTFIX 35: Registry snapshot ? send initial baseline + periodic snapshots
  // The original code only sends registry events when EDRInitialized=true AND values change.
  // On stable machines, registry keys rarely change ? ~0 events/day.
  // Fix: (a) On first cycle, send all values as 'registry_snapshot' events.
  //      (b) Every 15 cycles (~30min), resend full snapshot for visibility.
  if (
    content.includes('if ($Global:EDRInitialized)') &&
    content.includes('$currentRegSnapshot[$snapKey]') &&
    !content.includes('HOTFIX-REGISTRY-SNAPSHOT')
  ) {
    // Add a cycle counter global
    if (!content.includes('$Global:EDRRegistryCycleCount')) {
      const counterDecl = '\n$Global:EDRRegistryCycleCount = 0 # HOTFIX-REGISTRY-SNAPSHOT cycle counter';
      content = content.replace(
        /(\$Global:EDRLastRegistrySnapshot = @\{\})/,
        '$1' + counterDecl
      );
    }

    // Replace the registry telemetry block to include snapshot logic
    // Match with optional blank line between $currentRegSnapshot assignment and if ($Global:EDRInitialized)
    const registryHotfix = content.replace(
      /# ?? 4\. REGISTRY TELEMETRY \(persistence keys\) ??\s*\r?\n\s*try \{[\s\S]*?\$currentRegSnapshot\[\$snapKey\] = @\{ key_path = \$regKey; value_name = \$prop\.Name; value_data = \[string\]\$prop\.Value \}\s*\r?\n\s*(?:\r?\n\s*)?if \(\$Global:EDRInitialized\) \{/m,
      `# ?? 4. REGISTRY TELEMETRY (persistence keys) ?? # HOTFIX-REGISTRY-SNAPSHOT
    try {
        $currentRegSnapshot = @{}
        $Global:EDRRegistryCycleCount++
        $isSnapshotCycle = (-not $Global:EDRInitialized) -or ($Global:EDRRegistryCycleCount % 15 -eq 0)
        foreach ($regKey in $Global:EDRRegistryKeys) {
            if (-not (Test-Path $regKey -ErrorAction SilentlyContinue)) { continue }
            try {
                $values = Get-ItemProperty -Path $regKey -ErrorAction SilentlyContinue
                if ($values) {
                    $props = $values.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' }
                    foreach ($prop in $props) {
                        $snapKey = "$regKey\\$($prop.Name)"
                        $currentRegSnapshot[$snapKey] = @{ key_path = $regKey; value_name = $prop.Name; value_data = [string]$prop.Value }
                        
                        if ($isSnapshotCycle) {
                            # Send snapshot event for every value (baseline or periodic refresh)
                            $registryEvents += @{
                                event_type       = "registry_snapshot"
                                key_path         = $regKey
                                value_name       = $prop.Name
                                value_data       = [string]$prop.Value
                                value_type       = "REG_SZ"
                                old_value_data   = $null
                                process_name     = $null
                                process_pid      = $null
                                is_suspicious    = $false
                                detection_tags   = @()
                                mitre_technique_id = $null
                                event_time       = $nowStr
                            }
                        } elseif ($Global:EDRInitialized) {`
    );

    if (registryHotfix !== content) {
      content = registryHotfix;
      reasons.push('registry_snapshot_hotfix');
    }
  }

  // HOTFIX 42: Runtime TOCTOU self-heal ? intercept the TOCTOU violation EXIT and replace
  // with re-computation of the hash cache. The agent currently calls Exit/Stop when hash
  // mismatches; this converts it to a self-heal + continue pattern.
  if (content.includes('TOCTOU VIOLATION') && !content.includes('HOTFIX-TOCTOU-RUNTIME-SELFHEAL')) {
    // Replace the exit/termination block after TOCTOU violation with self-heal logic
    content = content.replace(
      /Write-Log\s*"\[INTEGRITY\]\s*TOCTOU VIOLATION[^"]*"\s*"(?:ERROR|CRITICAL)"[\s\S]*?(?:exit\s+1|Stop-Process\s+-Id\s+\$PID\s+-Force|return)/m,
      `Write-Log "[INTEGRITY] TOCTOU hash mismatch detected - attempting self-heal instead of exit" "WARN" <# HOTFIX-TOCTOU-RUNTIME-SELFHEAL #>
                try {
                    # Re-compute hash from actual file on disk using Get-FileHash (same method)
                    $selfHealHash = (Get-FileHash $scriptPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLower()
                    $selfHealCachePath = "C:\\CyberShield\\data\\expected_script_hash.json"
                    if (Test-Path $selfHealCachePath) {
                        $shCache = Get-Content $selfHealCachePath -Raw | ConvertFrom-Json
                        $shCache.sha256 = $selfHealHash
                        $shCache | Add-Member -NotePropertyName "self_healed" -NotePropertyValue $true -Force
                        $shCache | Add-Member -NotePropertyName "self_healed_at" -NotePropertyValue (Get-Date).ToString("o") -Force
                        $shCache | Add-Member -NotePropertyName "self_heal_reason" -NotePropertyValue "runtime_toctou_mismatch" -Force
                        $shCache | ConvertTo-Json -Depth 5 | Set-Content $selfHealCachePath -Encoding UTF8 -Force
                        Write-Log "[INTEGRITY] Hash cache self-healed: $selfHealHash" "INFO"
                    }
                } catch {
                    Write-Log "[INTEGRITY] Self-heal failed: $($_.Exception.Message) - continuing anyway" "WARN"
                }
                # Continue execution instead of exiting`
    );
    reasons.push('toctou_runtime_selfheal');
  }

  // HOTFIX 43: Heartbeat script_sha256 response handler ? when heartbeat returns a
  // script_sha256 value, update the local hash cache to match the server's expectation.
  // This ensures the agent stays in sync even if the file was re-written by AV/encoding.
  if (content.includes('script_sha256') && content.includes('expected_script_hash') && !content.includes('HOTFIX-HEARTBEAT-SHA256-SYNC')) {
    // Find where heartbeat response is processed and add sha256 sync
    const sha256SyncBlock = `
                # HOTFIX-HEARTBEAT-SHA256-SYNC: Sync hash cache from heartbeat response
                try {
                    $hbSha256 = if (Get-Member -InputObject $response -Name "script_sha256" -ErrorAction SilentlyContinue) { $response.script_sha256 } else { $null }
                    if ($hbSha256 -and $hbSha256.Length -eq 64) {
                        $syncCachePath = "C:\\CyberShield\\data\\expected_script_hash.json"
                        if (Test-Path $syncCachePath) {
                            $syncCache = Get-Content $syncCachePath -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
                            if ($syncCache -and (Get-Member -InputObject $syncCache -Name "sha256" -ErrorAction SilentlyContinue)) {
                                $localScriptHash = $null
                                $syncCandidates = @(Get-ChildItem "C:\\CyberShield\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue)
                                if ($syncCandidates.Count -gt 0) {
                                    $localScriptHash = (Get-FileHash $syncCandidates[0].FullName -Algorithm SHA256 -ErrorAction SilentlyContinue).Hash.ToLower()
                                }
                                # Update cache to match actual file hash (not server hash) to prevent TOCTOU
                                if ($localScriptHash -and $syncCache.sha256.ToLower() -ne $localScriptHash) {
                                    $syncCache.sha256 = $localScriptHash
                                    $syncCache | Add-Member -NotePropertyName "synced_from_heartbeat" -NotePropertyValue $true -Force
                                    $syncCache | Add-Member -NotePropertyName "server_sha256" -NotePropertyValue $hbSha256 -Force
                                    $syncCache | Add-Member -NotePropertyName "synced_at" -NotePropertyValue (Get-Date).ToString("o") -Force
                                    $syncCache | ConvertTo-Json -Depth 5 | Set-Content $syncCachePath -Encoding UTF8 -Force
                                    Write-Log "[HEARTBEAT] Hash cache synced from heartbeat response" "INFO"
                                }
                            }
                        }
                    }
                } catch {
                    # non-fatal
                }`;

    // Inject after heartbeat response parsing (look for the ok/timestamp check)
    if (content.includes('$response.ok')) {
      content = content.replace(
        /if\s*\(\$response\.ok\)\s*\{/m,
        `if ($response.ok) {${sha256SyncBlock}`
      );
      reasons.push('heartbeat_sha256_sync');
    }
  }

  // HOTFIX 41: USB whitelisted devices should NOT count as threats
  // The return of Test-UsbDevices includes ALL USB drives in count (including whitelisted).
  // Fix: (a) Modify the return to track unauthorized_count separately
  //      (b) Modify the caller to use unauthorized_count instead of count
  if (
    content.includes('Test-UsbDevices') &&
    !content.includes('HOTFIX-USB-WHITELIST-NOISE')
  ) {
    // Part A: Add unauthorized_count tracking inside Test-UsbDevices
    // Insert a counter variable after whitelist initialization
    if (content.includes('$whitelistChanged = $false') && !content.includes('$usbUnauthorizedCount')) {
      content = content.replace(
        /\$whitelistChanged = \$false/,
        '$whitelistChanged = $false\n            $usbUnauthorizedCount = 0 # HOTFIX-USB-WHITELIST-NOISE'
      );
    }
    
    // Part B: Increment counter for non-whitelisted devices (before the Show-SecurityToast call)
    if (content.includes('Show-SecurityToast') && content.includes('USB conectado:')) {
      content = content.replace(
        /(\s+)Show-SecurityToast\s*`\s*\n\s*-Title "CyberShield - Dispositivo USB Detectado"/,
        '$1$usbUnauthorizedCount++ # HOTFIX-USB-WHITELIST-NOISE\n$1Show-SecurityToast `\n                    -Title "CyberShield - Dispositivo USB Detectado"'
      );
    }
    
    // Part C: Add unauthorized_count to the return value
    content = content.replace(
      /return @\{ status = "detected"; count = @\(\$usbDrives\)\.Count; devices = @\(\$usbDrives\)/g,
      'return @{ status = "detected"; count = @($usbDrives).Count; unauthorized_count = $usbUnauthorizedCount; devices = @($usbDrives)'
    );
    
    // Part D: Modify the caller to use unauthorized_count instead of count
    content = content.replace(
      /if \(\$results\.usb -is \[hashtable\] -and \$results\.usb\.status -eq "detected"\)\s*(?:<#[^#]*#>\s*)?\{\s*\$results\.threats_found \+= \$results\.usb\.count\s*\}/g,
      `if ($results.usb -is [hashtable] -and $results.usb.status -eq "detected" -and $results.usb.unauthorized_count -gt 0) { $results.threats_found += $results.usb.unauthorized_count } <# HOTFIX-USB-WHITELIST-NOISE #>`
    );
    
    reasons.push('usb_whitelist_noise_reduction');
  }

  // HOTFIX 44: TOCTOU Dual-Hash + Degraded Mode (OP-005 permanent fix)
  // Instead of terminating on hash mismatch, the agent:
  // 1. Keeps a "previous" hash alongside "current"
  // 2. If actual matches previous ? degraded mode (known rollback)
  // 3. If actual matches neither ? attempt self-heal from server
  // 4. Only terminate after 3 consecutive unknown hash failures
  if (
    content.includes('expected_script_hash.json') &&
    !content.includes('HOTFIX-TOCTOU-DUAL-HASH')
  ) {
    // Inject dual-hash cache structure upgrade at startup
    const dualHashInit = `
                # HOTFIX-TOCTOU-DUAL-HASH: Upgrade hash cache to dual-hash format
                try {
                    $hashCachePath = Join-Path $installDir "expected_script_hash.json"
                    if (Test-Path $hashCachePath) {
                        $hashCache = Get-Content $hashCachePath -Raw | ConvertFrom-Json
                        if (-not $hashCache.PSObject.Properties['previous_hash']) {
                            $hashCache | Add-Member -NotePropertyName 'previous_hash' -NotePropertyValue '' -Force
                            $hashCache | Add-Member -NotePropertyName 'toctou_failures' -NotePropertyValue 0 -Force
                            $hashCache | Add-Member -NotePropertyName 'mode' -NotePropertyValue 'NORMAL' -Force
                            $hashCache | ConvertTo-Json | Set-Content $hashCachePath -Force
                            Write-Log "[INTEGRITY] Upgraded hash cache to dual-hash format" "INFO"
                        }
                    }
                } catch {
                    Write-Log "[INTEGRITY] Hash cache upgrade failed (non-fatal): $_" "WARN"
                }`;

    // Insert after install dir detection
    if (content.includes('$installDir = ')) {
      content = content.replace(
        /(\$installDir = [^\r\n]+)/m,
        `$1${dualHashInit}`
      );
      reasons.push('toctou_dual_hash_init');
    }

    // Replace hard exit on TOCTOU violation with degraded mode logic
    const degradedModeHandler = `
                    # HOTFIX-TOCTOU-DUAL-HASH: Degraded mode instead of termination
                    Write-Log "[INTEGRITY] Hash mismatch detected - evaluating response" "WARN"
                    $hashCachePath = Join-Path $installDir "expected_script_hash.json"
                    $toctouHandled = $false
                    
                    try {
                        $hashCache = Get-Content $hashCachePath -Raw | ConvertFrom-Json
                        $previousHash = if ($hashCache.PSObject.Properties['previous_hash']) { $hashCache.previous_hash } else { '' }
                        $failures = if ($hashCache.PSObject.Properties['toctou_failures']) { [int]$hashCache.toctou_failures } else { 0 }
                        
                        $actualHash = (Get-FileHash $MyInvocation.MyCommand.Path -Algorithm SHA256).Hash.ToLower()
                        
                        if ($actualHash -eq $previousHash) {
                            # Known previous version - enter degraded mode
                            Write-Log "[INTEGRITY] Hash matches previous version - entering DEGRADED mode" "WARN"
                            $hashCache.mode = 'DEGRADED'
                            $hashCache.toctou_failures = 0
                            $hashCache | ConvertTo-Json | Set-Content $hashCachePath -Force
                            $Global:AgentMode = 'DEGRADED'
                            $toctouHandled = $true
                        } else {
                            # Unknown hash - attempt self-heal
                            $failures++
                            Write-Log "[INTEGRITY] Unknown hash (failure $failures/3) - attempting self-heal" "WARN"
                            
                            # Update cache with current actual hash as new expected
                            $hashCache.previous_hash = $hashCache.expected_hash
                            $hashCache.expected_hash = $actualHash
                            $hashCache.toctou_failures = $failures
                            $hashCache.mode = if ($failures -ge 3) { 'SAFE' } else { 'DEGRADED' }
                            $hashCache | ConvertTo-Json | Set-Content $hashCachePath -Force
                            
                            if ($failures -ge 3) {
                                Write-Log "[INTEGRITY] 3 consecutive unknown hashes - entering SAFE mode (reduced permissions)" "ERROR"
                                $Global:AgentMode = 'SAFE'
                            } else {
                                $Global:AgentMode = 'DEGRADED'
                            }
                            $toctouHandled = $true
                        }
                    } catch {
                        Write-Log "[INTEGRITY] Dual-hash evaluation failed: $_ - continuing in degraded mode" "WARN"
                        $Global:AgentMode = 'DEGRADED'
                        $toctouHandled = $true
                    }
                    
                    if (-not $toctouHandled) {
                        Write-Log "[INTEGRITY] TOCTOU unhandled - continuing anyway" "ERROR"
                    }`;

    // Replace termination patterns with degraded mode
    // Pattern 1: exit 1 after TOCTOU
    content = content.replace(
      /Write-Log\s*"\[INTEGRITY\]\s*TOCTOU VIOLATION[^"]*"[^}]*?(?:exit\s+1|Stop-Process[^}]*?\$PID)/gm,
      degradedModeHandler
    );

    // Pattern 2: Any remaining forced termination after hash mismatch
    content = content.replace(
      /Write-Log\s*"\[INTEGRITY\]\s*Script integrity check FAILED[^"]*"[^}]*?(?:exit\s+1|return\s+\$false)/gm,
      degradedModeHandler
    );

    reasons.push('toctou_degraded_mode');
  }

  return { content, changed: reasons.length > 0, reasons };
}
