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
  if (
    content.includes('$Global:SecurityDegraded = $false') &&
    !content.includes('$Global:AgentPrivateKey = $null')
  ) {
    const withDeclaredGlobals = content.replace(
      /# v5\.0\.13-fix: SecurityDegraded flag \(BUG 7 - declare early for robustness\)\s*\r?\n\$Global:SecurityDegraded = \$false/,
      '# v5.0.13-fix: SecurityDegraded flag (BUG 7 - declare early for robustness)\n$Global:SecurityDegraded = $false\n\n# v5.0.14-hotfix: Declare ALL globals early (StrictMode-safe)\n$Global:AgentPrivateKey = $null\n$Global:AgentPublicKey = $null\n$Global:KeyFingerprint = $null\n$Global:KeyVersion = 0\n$Global:ProtectedProcessSet = $null\n$Global:ProcessBaseline = @{}\n$Global:LastBaselineUpdate = [datetime]::MinValue\n$Global:LastAnomalyCheck = [datetime]::MinValue\n$Global:AnomalyHistory = @()\n$Global:LogBuffer = [System.Collections.Generic.List[string]]::new()\n$Global:LastLogFlush = [datetime]::UtcNow\n$Global:CachedTimestamp = $null\n$Global:LastTimestampUpdate = [datetime]::MinValue'
    );

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
                [System.Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
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
  if (content.includes('$Global:ProcessBaseline') && !content.includes('HOTFIX-BASELINE-GLOBALS') && !content.includes('$Global:ProtectedProcessSet = $null')) {
    const baselineGlobals = `\n# HOTFIX-BASELINE-GLOBALS: Declare monitoring globals early for StrictMode\n` +
      `$Global:ProcessBaseline = @{}\n` +
      `$Global:LastBaselineUpdate = [datetime]::MinValue\n` +
      `$Global:LastAnomalyCheck = [datetime]::MinValue\n` +
      `$Global:AnomalyHistory = @()\n` +
      `$Global:ProtectedProcessSet = $null\n`;

    if (content.includes('$Global:SecurityDegraded = $false')) {
      content = content.replace(
        /\$Global:SecurityDegraded = \$false/,
        '$Global:SecurityDegraded = $false' + baselineGlobals
      );
      reasons.push('baseline_globals');
    }
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

  // HOTFIX 14: Fail-open signature verification in Apply-ForcedUpdate when Ed25519 is unavailable
  // On PowerShell 5.1, Ed25519 is NOT available. Test-Ed25519HashSignature returns $false.
  // The update is then REJECTED even though SHA256 was already validated successfully.
  // Fix: When signature verification returns $false AND Ed25519 is not available, allow the update
  // (SHA256 integrity is already confirmed at this point).
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

  return { content, changed: reasons.length > 0, reasons };
}
