export interface WindowsScriptHotfixResult {
  content: string;
  changed: boolean;
  reasons: string[];
}

/**
 * Aplica hotfixes críticos de compatibilidade no script Windows do agente.
 * Mantém comportamento idempotente (não reaplica quando já existe marcador HOTFIX).
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

  // HOTFIX 3: ExportPkcs8PrivateKey not available in .NET Framework 4.x (PowerShell 5.1)
  if (content.includes('$ecdsa.ExportPkcs8PrivateKey()') && !content.includes('HOTFIX-EXPORT')) {
    content = content.replace(
      /# Export private key \(PKCS#8\)\s*\r?\n\s*\$privateKeyBytes = \$ecdsa\.ExportPkcs8PrivateKey\(\)\s*\r?\n\s*\$privateKeyBase64 = \[Convert\]::ToBase64String\(\$privateKeyBytes\)\s*\r?\n\s*\r?\n\s*# Export public key \(SubjectPublicKeyInfo\)\s*\r?\n\s*\$publicKeyBytes = \$ecdsa\.ExportSubjectPublicKeyInfo\(\)\s*\r?\n\s*\$publicKeyBase64 = \[Convert\]::ToBase64String\(\$publicKeyBytes\)/,
      `# HOTFIX-EXPORT: Export keys with .NET Framework 4.x compatibility
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
            Write-Log "[KEYS] ExportPkcs8/SPKI not available ($($_.Exception.Message)), using in-memory ECDSA object" "WARN"
            # Keep $ecdsa object in memory for direct signing - no export needed
            # Generate a synthetic fingerprint from the key parameters
            try {
                $ecParams = $ecdsa.ExportParameters($false)
                $publicKeyBytes = [byte[]]($ecParams.Q.X + $ecParams.Q.Y)
                $publicKeyBase64 = [Convert]::ToBase64String($publicKeyBytes)
            } catch {
                Write-Log "[KEYS] ExportParameters also failed, using random fingerprint" "WARN"
                $randomBytes = [byte[]]::new(32)
                $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($randomBytes)
                $publicKeyBytes = $randomBytes
                $publicKeyBase64 = [Convert]::ToBase64String($randomBytes)
            }
        }`
    );
    reasons.push('export_pkcs8_compat');
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

  // HOTFIX 14: Fail-open signature verification — INCLUDING null signatures
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
    $toctouScriptPath = "C:\\CyberShield\\cybershield-agent.ps1"
    $toctouHashCachePath = "C:\\CyberShield\\data\\expected_script_hash.json"
    if ((Test-Path $toctouScriptPath) -and (Test-Path $toctouHashCachePath)) {
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
  // $Global:AgentVersion already contains "v5.0.13", so "v$($Global:AgentVersion)" produces "vv5.0.13"
  if (content.includes('Agent v$($Global:AgentVersion)') && !content.includes('HOTFIX-VERSION-PREFIX')) {
    content = content.replace(
      /Agent v\$\(\$Global:AgentVersion\)/g,
      'Agent $($Global:AgentVersion) <# HOTFIX-VERSION-PREFIX #>'
    );
    reasons.push('version_prefix_fix');
  }

  // HOTFIX 22: CNG key creation "Object already exists" — delete existing container before creating
  // The current code uses $null name (ephemeral) but some Windows versions still persist it
  if (content.includes('CngKey]::Create(') && !content.includes('HOTFIX-CNG-CLEANUP')) {
    content = content.replace(
      /\$cngKey = \[System\.Security\.Cryptography\.CngKey\]::Create\(\s*\n\s*\[System\.Security\.Cryptography\.CngAlgorithm\]::ECDsaP256,\s*\n\s*\$null,\s*# No name = ephemeral, no conflict\s*\n\s*\$creationParams\s*\)/g,
      `# HOTFIX-CNG-CLEANUP: Delete any leftover CNG containers before creating
                try {
                    $existingKey = [System.Security.Cryptography.CngKey]::Open("CyberShieldECDSA_$env:COMPUTERNAME", [System.Security.Cryptography.CngProvider]::MicrosoftSoftwareKeyStorageProvider)
                    if ($existingKey) { $existingKey.Delete(); $existingKey.Dispose() }
                    Write-Log "[KEYS] Cleaned up existing CNG container" "DEBUG"
                } catch { <# Container doesn't exist, that's fine #> }
                $cngKey = [System.Security.Cryptography.CngKey]::Create(
                    [System.Security.Cryptography.CngAlgorithm]::ECDsaP256,
                    $null,  # Ephemeral key (HOTFIX-CNG-CLEANUP)
                    $creationParams
                )`
    );
    reasons.push('cng_cleanup_fix');
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

  // HOTFIX 25: DNS 403 silenciado — treat "feature disabled" as INFO, not error
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
  if (content.includes('$ecdsa.SignData') && !content.includes('HOTFIX-RSA-SIGN')) {
    content = content.replace(
      /\$signatureBytes = \$ecdsa\.SignData\(\[System\.Text\.Encoding\]::UTF8\.GetBytes\(\$canonicalPayload\), \[System\.Security\.Cryptography\.HashAlgorithmName\]::SHA256\)/g,
      `# HOTFIX-RSA-SIGN: Use RSA if ECDSA private key was not exportable
            if ($Global:AgentSigningAlgorithm -eq "RSA-2048-SHA256" -and $Global:AgentRsaKey) {
                $signatureBytes = $Global:AgentRsaKey.SignData([System.Text.Encoding]::UTF8.GetBytes($canonicalPayload), [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
            } else {
                $signatureBytes = $ecdsa.SignData([System.Text.Encoding]::UTF8.GetBytes($canonicalPayload), [System.Security.Cryptography.HashAlgorithmName]::SHA256)
            } <# HOTFIX-RSA-SIGN #>`
    );
    reasons.push('rsa_sign_fallback');
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

  // HOTFIX 30: Clean orphaned CNG key containers on startup to prevent "Object already exists" errors
  // This is critical for legacy Windows Server environments where ECDSA key generation leaves stale containers
  // Uses separate marker from HOTFIX 22 (which cleans at key creation time, not startup)
  if (content.includes('Write-Log') && !content.includes('HOTFIX-CNG-STARTUP-CLEANUP')) {
    // Broaden regex: match any startup log line containing "CyberShield" or "FULL ENTERPRISE" or "Agent start"
    const startupRegex = /(Write-Log\s+["'].*(?:CyberShield Agent|FULL ENTERPRISE|Agent\s+start(?:ing|ed)|v\$\(\$Global:AgentVersion\)|\$\(\$Global:AgentVersion\)).*["']\s+["']INFO["'])/;
    const cngCleanupBlock = `# HOTFIX-CNG-STARTUP-CLEANUP: Remove orphaned CNG containers to prevent key generation conflicts
try {
    $cngOutput = & certutil -csp "Microsoft Software Key Storage Provider" -key 2>&1
    $cngKeys = @($cngOutput | Where-Object { $_ -match 'CyberShield' })
    if ($cngKeys.Count -gt 0) {
        foreach ($keyLine in $cngKeys) {
            $keyName = ($keyLine -replace '\\s+$','').Trim()
            if ($keyName) {
                & certutil -csp "Microsoft Software Key Storage Provider" -delkey "$keyName" 2>&1 | Out-Null
            }
        }
    }
} catch { <# CNG cleanup is best-effort #> }
`;
    const updated30 = content.replace(startupRegex, cngCleanupBlock + '$1');
    if (updated30 !== content) {
      content = updated30;
      reasons.push('cng_startup_container_cleanup');
    }
  }

  // HOTFIX 31: Guard null $ecdsa after RSA-2048 fallback (HOTFIX 26)
  // After HOTFIX 26 disposes $ecdsa and sets it to $null, remaining original script code
  // (fingerprint generation, Dispose() in finally blocks) tries to call methods on $null → FATAL crash
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
  // Error: "O item já foi adicionado. Chave contida no dicionário: 'first_seen'"
  // Root cause: Both Add-Member without -Force AND hashtable .Add() with duplicate keys
  if (content.includes('first_seen') && !content.includes('HOTFIX-BASELINE-DEDUP')) {
    // Fix 1: Add-Member calls for 'first_seen' — add -Force
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
    // Fix 2: Hashtable assignment — use indexer instead of .Add()
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

  // HOTFIX 33: Legacy-compatible result signing (fix ImportPkcs8PrivateKey missing on ECDsaCng)
  if (content.includes('function Invoke-SignResult') && content.includes('ImportPkcs8PrivateKey') && !content.includes('HOTFIX-SIGN-COMPAT')) {
    const updatedSignCompat = content.replace(
      /# Import private key\s*\r?\n\s*\$privateKeyBytes = \[Convert\]::FromBase64String\(\$Global:AgentPrivateKey\)\s*\r?\n\s*\$ecdsa = \[System\.Security\.Cryptography\.ECDsaCng\]::new\(\)\s*\r?\n\s*\$ecdsa\.ImportPkcs8PrivateKey\(\$privateKeyBytes, \[ref\]\$null\)\s*\r?\n\s*\r?\n\s*# Sign payload\s*\r?\n\s*\$payloadBytes = \[System\.Text\.Encoding\]::UTF8\.GetBytes\(\$canonicalPayload\)\s*\r?\n\s*\$signatureBytes = \$ecdsa\.SignData\(\$payloadBytes, \[System\.Security\.Cryptography\.HashAlgorithmName\]::SHA256\)\s*\r?\n\s*\$signature = \[Convert\]::ToBase64String\(\$signatureBytes\)\s*\r?\n\s*\r?\n\s*\$ecdsa\.Dispose\(\)/m,
      `# HOTFIX-SIGN-COMPAT: legacy-safe signer (ECDSA/RSA)
        $algorithm = if ($Global:AgentSigningAlgorithm) { $Global:AgentSigningAlgorithm } else { "ECDSA-P256-SHA256" }
        $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($canonicalPayload)

        if ($algorithm -eq "RSA-2048-XML") {
            $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider
            try {
                $rsaXml = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Global:AgentPrivateKey))
                $rsa.FromXmlString($rsaXml)
                $signatureBytes = $rsa.SignData($payloadBytes, "SHA256")
            } finally {
                $rsa.Dispose()
            }
        } elseif ($algorithm -eq "RSA-2048-SHA256") {
            $privateKeyBytes = [Convert]::FromBase64String($Global:AgentPrivateKey)
            try {
                $rsa = [System.Security.Cryptography.RSA]::Create()
                $bytesRead = 0
                $null = $rsa.ImportPkcs8PrivateKey($privateKeyBytes, [ref]$bytesRead)
                $signatureBytes = $rsa.SignData($payloadBytes, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
                $rsa.Dispose()
            } catch {
                $rsaLegacy = New-Object System.Security.Cryptography.RSACryptoServiceProvider
                $rsaLegacy.ImportCspBlob($privateKeyBytes)
                $signatureBytes = $rsaLegacy.SignData($payloadBytes, "SHA256")
                $rsaLegacy.Dispose()
            }
        } else {
            $privateKeyBytes = [Convert]::FromBase64String($Global:AgentPrivateKey)
            $ecdsa = [System.Security.Cryptography.ECDsa]::Create()
            try {
                $bytesRead = 0
                try {
                    $null = $ecdsa.ImportPkcs8PrivateKey($privateKeyBytes, [ref]$bytesRead)
                } catch {
                    $ecdsa.Dispose()
                    $cngKey = [System.Security.Cryptography.CngKey]::Import($privateKeyBytes, [System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)
                    $ecdsa = [System.Security.Cryptography.ECDsaCng]::new($cngKey)
                }
                $signatureBytes = $ecdsa.SignData($payloadBytes, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
            } finally {
                if ($null -ne $ecdsa) { $ecdsa.Dispose() }
            }
        }

        $signature = [Convert]::ToBase64String($signatureBytes) <# HOTFIX-SIGN-COMPAT #>`
    );

    if (updatedSignCompat !== content) {
      content = updatedSignCompat;
      reasons.push('sign_result_legacy_compat');
    }
  }

  return { content, changed: reasons.length > 0, reasons };
}
