import type { HotfixContext } from './types.ts';

/** HOTFIX 4: $anomalies.anomalies crashes when $anomalies is not a hashtable */
export function hotfixSafeAnomaliesAccess(ctx: HotfixContext): void {
  if (ctx.content.includes('.anomalies') && !ctx.content.includes('HOTFIX-ANOMALIES')) {
    ctx.content = ctx.content.replace(
      /\$anomalies\.anomalies/g,
      '$(if ($anomalies -is [hashtable] -and $anomalies.ContainsKey("anomalies")) { $anomalies["anomalies"] } elseif ($anomalies -and (Get-Member -InputObject $anomalies -Name "anomalies" -ErrorAction SilentlyContinue)) { $anomalies.anomalies } else { @() }) <# HOTFIX-ANOMALIES #>'
    );
    ctx.reasons.push('safe_anomalies_access');
  }
}

/** HOTFIX 6: Heartbeat response may not have 'force_update' property */
export function hotfixSafeForceUpdate(ctx: HotfixContext): void {
  if (ctx.content.includes('.force_update') && !ctx.content.includes('HOTFIX-FORCE-UPDATE')) {
    ctx.content = ctx.content.replace(
      /\$(?:response|result|heartbeatResponse)\.force_update/g,
      (match) => {
        const varName = match.split('.')[0];
        return `$(if (${varName} -and (Get-Member -InputObject ${varName} -Name "force_update" -ErrorAction SilentlyContinue)) { ${varName}.force_update } else { $false }) <# HOTFIX-FORCE-UPDATE #>`;
      }
    );
    ctx.reasons.push('safe_force_update');
  }
}

/** HOTFIX 7: Safe access to .repaired and .script_sha256 properties */
export function hotfixSafeRepairedAndSha256(ctx: HotfixContext): void {
  if (ctx.content.includes('.repaired') && !ctx.content.includes('HOTFIX-SAFE-REPAIRED')) {
    ctx.content = ctx.content.replace(
      /\$taskHealth\.repaired/g,
      '$(if ($taskHealth -is [hashtable] -and $taskHealth.ContainsKey("repaired")) { $taskHealth["repaired"] } elseif ($taskHealth -and (Get-Member -InputObject $taskHealth -Name "repaired" -ErrorAction SilentlyContinue)) { $taskHealth.repaired } else { $false }) <# HOTFIX-SAFE-REPAIRED #>'
    );
    ctx.reasons.push('safe_repaired_access');
  }

  if (ctx.content.includes('.script_sha256') && !ctx.content.includes('HOTFIX-SAFE-SHA256')) {
    ctx.content = ctx.content.replace(
      /\$(?:response|result)\.script_sha256/g,
      (match) => {
        const varName = match.split('.')[0];
        return `$(if (${varName} -is [hashtable] -and ${varName}.ContainsKey("script_sha256")) { ${varName}["script_sha256"] } elseif (${varName} -and (Get-Member -InputObject ${varName} -Name "script_sha256" -ErrorAction SilentlyContinue)) { ${varName}.script_sha256 } elseif (${varName} -and (Get-Member -InputObject ${varName} -Name "sha256" -ErrorAction SilentlyContinue)) { ${varName}.sha256 } else { $null }) <# HOTFIX-SAFE-SHA256 #>`;
      }
    );
    ctx.reasons.push('safe_sha256_access');
  }
}

/** HOTFIX 12: Key registration - handle response without 'registered_at' property */
export function hotfixSafeRegisteredAt(ctx: HotfixContext): void {
  if (ctx.content.includes('.registered_at') && !ctx.content.includes('HOTFIX-SAFE-REGISTERED-AT')) {
    ctx.content = ctx.content.replace(
      /\$\w+\.registered_at\s*=\s*\(Get-Date\)\.ToString\("o"\)/g,
      (match) => {
        return `# ${match} <# HOTFIX-SAFE-REGISTERED-AT - set safely #>\n        if ($keys -and $keys -is [hashtable]) { $keys["registered_at"] = (Get-Date).ToString("o") } elseif ($keys) { try { $keys | Add-Member -NotePropertyName "registered_at" -NotePropertyValue (Get-Date).ToString("o") -Force -ErrorAction SilentlyContinue } catch {} }`;
      }
    );
    ctx.reasons.push('safe_registered_at');
  }
}

/** HOTFIX 13: Safe access to $Response.ecdsa_signature and $Response.signature_base64 */
export function hotfixSafeEcdsaSig(ctx: HotfixContext): void {
  if (ctx.content.includes('$Response.ecdsa_signature') && !ctx.content.includes('HOTFIX-SAFE-ECDSA-SIG')) {
    ctx.content = ctx.content.replace(
      /\$updateSignature\s*=\s*\$Response\.ecdsa_signature\s*\r?\n\s*if\s*\(-not\s*\$updateSignature\)\s*\{\s*\$updateSignature\s*=\s*\$Response\.signature_base64\s*\}/g,
      `$updateSignature = if (Get-Member -InputObject $Response -Name "ecdsa_signature" -ErrorAction SilentlyContinue) { $Response.ecdsa_signature } else { $null } <# HOTFIX-SAFE-ECDSA-SIG #>
        if (-not $updateSignature) { $updateSignature = if (Get-Member -InputObject $Response -Name "signature_base64" -ErrorAction SilentlyContinue) { $Response.signature_base64 } else { $null } }`
    );
    ctx.reasons.push('safe_ecdsa_signature_access');
  }
}

/** HOTFIX 15: Safe access to cached hash signature properties */
export function hotfixSafeCacheSig(ctx: HotfixContext): void {
  if (ctx.content.includes('$cacheJson.signature') && !ctx.content.includes('HOTFIX-SAFE-CACHE-SIG')) {
    ctx.content = ctx.content.replace(
      /\$cacheJson\.signature\.Length\s+-gt\s+10/g,
      '$(if (Get-Member -InputObject $cacheJson -Name "signature" -ErrorAction SilentlyContinue) { $cacheJson.signature } else { $null }) -and $(if (Get-Member -InputObject $cacheJson -Name "signature" -ErrorAction SilentlyContinue) { $cacheJson.signature.Length } else { 0 }) -gt 10 <# HOTFIX-SAFE-CACHE-SIG #>'
    );
    ctx.reasons.push('safe_cache_signature_access');
  }
}
