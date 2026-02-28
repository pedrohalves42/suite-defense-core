import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Get Latest Agent Script (Public Endpoint)
 * 
 * Returns the latest active agent script from agent_releases.
 * This is a PUBLIC endpoint (no auth required) used for:
 * - Reinstallation scripts that need to download the latest version
 * - Recovery scenarios when HMAC authentication fails
 * 
 * Security: Only returns the script content, no sensitive data.
 * The script itself requires valid credentials embedded to function.
 * 
 * Usage:
 *   GET /functions/v1/get-latest-agent-script?platform=windows
 *   
 * Response:
 *   { 
 *     version: "v5.0.2",
 *     script_content: "...",
 *     script_content_base64: "...",
 *     sha256: "...",
 *     platform: "windows"
 *   }
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function normalizeVersion(v: string | null | undefined): string {
  return v?.replace(/^v/i, '').trim() || '';
}

function extractScriptVersion(content: string): string | null {
  const headerMatch = content.match(/CyberShield\s+Agent\s*-\s*Windows\s+v?([\d]+\.[\d]+\.[\d]+)/i);
  if (headerMatch?.[1]) return headerMatch[1];

  const paramMatch = content.match(/\$AgentVersion\s*=\s*"v?([\d]+\.[\d]+\.[\d]+)"/i);
  if (paramMatch?.[1]) return paramMatch[1];

  return null;
}

function applyWindowsEcdsaHotfix(script: string): { content: string; changed: boolean; reasons: string[] } {
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
  // Replace with try/catch that falls back to keeping the $ecdsa object in memory
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
    // Replace all variations: $anomalies.anomalies, $result.anomalies etc.
    content = content.replace(
      /\$anomalies\.anomalies/g,
      '$(if ($anomalies -is [hashtable] -and $anomalies.ContainsKey("anomalies")) { $anomalies["anomalies"] } elseif ($anomalies -and (Get-Member -InputObject $anomalies -Name "anomalies" -ErrorAction SilentlyContinue)) { $anomalies.anomalies } else { @() }) <# HOTFIX-ANOMALIES #>'
    );
    reasons.push('safe_anomalies_access');
  }

  // HOTFIX 5: $Global:ProcessBaseline not declared - StrictMode crash
  // NOTE: Now covered by HOTFIX 1 expanded globals. Keep as safety net for scripts
  // that already had HOTFIX 1 applied without the monitoring globals.
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

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', requestId }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform') || 'windows';
    const format = (url.searchParams.get('format') || 'json').toLowerCase();
    const includePlainParam = (url.searchParams.get('include_plain') || '').toLowerCase();
    const includeScriptContent = includePlainParam === '1' || includePlainParam === 'true' || includePlainParam === 'yes';
    
    // Validate platform
    if (!['windows', 'linux', 'macos'].includes(platform)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid platform',
          message: 'Platform must be one of: windows, linux, macos',
          requestId
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] Fetching latest ${platform} agent script`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch latest active release
    const { data: release, error: releaseError } = await supabase
      .from('agent_releases')
      .select('id, version, script_content, sha256, release_notes, created_at')
      .eq('platform', platform)
      .eq('is_active', true)
      .eq('channel', 'stable')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (releaseError || !release) {
      console.error(`[${requestId}] No active release found:`, releaseError);
      return new Response(
        JSON.stringify({
          error: 'No active release found',
          message: `No active ${platform} agent release available`,
          requestId
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Apply runtime hotfix for legacy Windows crypto environments (non-breaking, self-healing)
    let releaseScriptContent = release.script_content;
    if (platform === 'windows' && releaseScriptContent) {
      const hotfix = applyWindowsEcdsaHotfix(releaseScriptContent);
      if (hotfix.changed) {
        releaseScriptContent = hotfix.content;
        console.warn(`[${requestId}] Applied Windows ECDSA hotfix at serve-time`, {
          releaseVersion: release.version,
          reasons: hotfix.reasons,
        });

        // Best-effort persistence so all endpoints (including serve-agent-update) benefit immediately
        try {
          const { error: persistError } = await supabase
            .from('agent_releases')
            .update({ script_content: releaseScriptContent })
            .eq('id', release.id);

          if (persistError) {
            console.warn(`[${requestId}] Could not persist hotfixed script_content`, {
              error: persistError.message,
              releaseId: release.id,
            });
          }
        } catch (persistErr) {
          const err = persistErr as Error;
          console.warn(`[${requestId}] Exception persisting hotfix: ${err.message}`);
        }
      }
    }

    // Validate script content
    if (!releaseScriptContent || releaseScriptContent.length < 5000) {
      console.error(`[${requestId}] Script content too short: ${releaseScriptContent?.length || 0} bytes`);
      return new Response(
        JSON.stringify({
          error: 'Invalid script content',
          message: 'Script content is missing or corrupted',
          requestId
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Integrity guard: log mismatch but don't block (allow serving latest DB content)
    const declaredVersion = normalizeVersion(release.version);
    const embeddedVersion = extractScriptVersion(releaseScriptContent);
    if (embeddedVersion && normalizeVersion(embeddedVersion) !== declaredVersion) {
      console.warn(`[${requestId}] Release/script version mismatch (non-blocking)`, {
        releaseVersion: release.version,
        embeddedVersion,
        platform,
      });
      // Continue serving - the script_content from DB is authoritative
    }

    // Normalize for Windows (CRLF)
    let normalizedScript = releaseScriptContent;
    if (platform === 'windows') {
      normalizedScript = releaseScriptContent
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n/g, '\r\n');
    }

    // Calculate SHA256
    const encoder = new TextEncoder();
    const scriptBytes = encoder.encode(normalizedScript);
    const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Option: serve as plain text (avoids huge JSON parsing issues in older PowerShell)
    if (format === 'plain' || format === 'ps1' || format === 'text') {
      console.log(`[${requestId}] Serving ${platform} script v${release.version} as text/plain (${scriptBytes.length} bytes)`);

      return new Response(normalizedScript, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Agent-Version': release.version,
          'X-Agent-Sha256': sha256,
          'X-Request-ID': requestId,
        },
      });
    }

    // Base64 encode (JSON mode)
    const base64Chunks: string[] = [];
    const chunkSize = 0x8000;
    for (let i = 0; i < scriptBytes.length; i += chunkSize) {
      const chunk = scriptBytes.subarray(i, i + chunkSize);
      base64Chunks.push(String.fromCharCode(...chunk));
    }
    const base64Script = btoa(base64Chunks.join(''));

    console.log(`[${requestId}] Serving ${platform} script v${release.version} (${scriptBytes.length} bytes)`);

    const responsePayload: Record<string, unknown> = {
      version: release.version,
      script_content_base64: base64Script,
      sha256,
      platform,
      release_notes: release.release_notes,
      requestId,
    };

    if (includeScriptContent) {
      responsePayload.script_content = normalizedScript;
    }

    return new Response(
      JSON.stringify(responsePayload),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Request-ID': requestId
        }
      }
    );

  } catch (error) {
    const err = error as Error;
    console.error(`[${requestId}] Error:`, err.message);
    
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: err.message,
        requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
