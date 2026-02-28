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

  return { content, changed: reasons.length > 0, reasons };
}
