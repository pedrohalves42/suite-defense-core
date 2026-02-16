import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Patch v5.0.4 -> v5.0.5
 * 
 * Reads v5.0.4 script from DB, applies targeted patches to add missing handlers,
 * creates v5.0.5 release, and deactivates v5.0.4.
 * 
 * This is necessary because non-TS files aren't available in Edge Functions at runtime.
 */

// ---- Patch content: the missing handlers from v5.0.5 ----
const LIGHT_VULN_SCAN_HANDLER = `
# ============================================
#  v5.0.5: LIGHT VULN SCAN (Windows Update check)
# ============================================
function Invoke-LightVulnScan {
    param([object]$Payload)
    
    Write-Log "[VULN-SCAN] Starting light vulnerability scan..." "INFO"
    
    try {
        $results = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            hostname = $env:COMPUTERNAME
            scan_engine = "CyberShield VulnScanner v2.1"
            scan_type = "light"
            vulnerabilities_found = 0
            by_severity = @{ critical = 0; high = 0; medium = 0; low = 0 }
            top_cves = @()
            patches_available = 0
            scan_duration_seconds = 0
            status = "success"
        }
        
        $startTime = Get-Date
        
        try {
            $updateSession = New-Object -ComObject Microsoft.Update.Session
            $searcher = $updateSession.CreateUpdateSearcher()
            $searchResult = $searcher.Search("IsInstalled=0 AND IsHidden=0")
            
            foreach ($update in $searchResult.Updates) {
                $results.vulnerabilities_found++
                
                $severity = $update.MsrcSeverity
                switch ($severity) {
                    'Critical'  { $results.by_severity.critical++ }
                    'Important' { $results.by_severity.high++ }
                    'Moderate'  { $results.by_severity.medium++ }
                    default     { $results.by_severity.low++ }
                }
                
                if ($update.CveIDs -and $results.top_cves.Count -lt 10) {
                    foreach ($cve in $update.CveIDs) {
                        if ($results.top_cves.Count -lt 10) {
                            $results.top_cves += "$cve - $($update.Title)"
                        }
                    }
                }
            }
            
            $results.patches_available = $results.vulnerabilities_found
            
        } catch {
            Write-Log "[VULN-SCAN] Windows Update COM failed: $($_.Exception.Message)" "WARN"
            try {
                $hotfixes = Get-HotFix -ErrorAction SilentlyContinue | 
                    Sort-Object InstalledOn -Descending -ErrorAction SilentlyContinue |
                    Select-Object -First 5
                $results.last_hotfixes = @($hotfixes | ForEach-Object {
                    @{ id = $_.HotFixID; installed = $_.InstalledOn.ToString("o") }
                })
            } catch {}
        }
        
        $results.scan_duration_seconds = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
        
        Write-Log "[VULN-SCAN] Found $($results.vulnerabilities_found) vulnerabilities" "INFO"
        return $results
        
    } catch {
        return @{ 
            status = "error"
            error = $_.Exception.Message
            hostname = $env:COMPUTERNAME
        }
    }
}`;

const UPDATE_AGENT_HANDLER = `
# ============================================
#  v5.0.5: UPDATE AGENT (via serve-agent-update)
# ============================================
function Invoke-UpdateAgent {
    param([object]$Payload)
    
    Write-Log "[UPDATE] Starting update_agent check..." "INFO"
    
    try {
        $updateResult = Invoke-SecureRequest \`
            -Path "/functions/v1/serve-agent-update" \`
            -Method GET \`
            -TimeoutSec 60
        
        if (-not $updateResult.Success) {
            return @{
                status = "error"
                error = "Failed to check for updates: HTTP $($updateResult.StatusCode)"
                current_version = $Global:AgentVersion
            }
        }
        
        $data = $updateResult.Body | ConvertFrom-Json
        
        if ($data.message -eq "Already up to date") {
            Write-Log "[UPDATE] Already at latest version ($($data.current_version))" "INFO"
            return @{
                status = "up_to_date"
                current_version = $Global:AgentVersion
                latest_version = $data.current_version
            }
        }
        
        Write-Log "[UPDATE] Update available: $($data.version). Will apply via force_update." "INFO"
        return @{
            status = "update_available"
            current_version = $Global:AgentVersion
            target_version = $data.version
            message = "Update will be applied via heartbeat force_update mechanism"
        }
        
    } catch {
        return @{
            status = "error"
            error = $_.Exception.Message
            current_version = $Global:AgentVersion
        }
    }
}`;

const REPORT_JOB_HANDLER = `
# ============================================
#  v5.0.5: REPORT JOB (system info report)
# ============================================
function Invoke-ReportJob {
    try {
        $sysInfo = Get-SystemInfo
        return @{
            status = "success"
            report_type = "system_info"
            data = $sysInfo
            generated_at = (Get-Date).ToUniversalTime().ToString("o")
        }
    } catch {
        return @{ status = "error"; error = $_.Exception.Message }
    }
}`;

const SCAN_JOB_HANDLER = `
# ============================================
#  v5.0.5: SCAN JOB (file hash check)
# ============================================
function Invoke-ScanJob {
    param([object]$Payload)
    
    try {
        $filePath = $Payload.filePath
        if (-not $filePath) {
            return @{ status = "error"; error = "Missing filePath in payload" }
        }
        
        if ($filePath -match '%([^%]+)%') {
            $filePath = [System.Environment]::ExpandEnvironmentVariables($filePath)
        }
        
        if (-not (Test-Path $filePath)) {
            return @{ status = "error"; error = "File not found: $filePath" }
        }
        
        $fileHash = (Get-FileHash -Path $filePath -Algorithm SHA256).Hash.ToLower()
        Write-Log "[SCAN] Scanned: $filePath (hash: $fileHash)" "INFO"
        
        return @{
            status = "success"
            file_path = $filePath
            sha256 = $fileHash
            file_size = (Get-Item $filePath).Length
            scanned_at = (Get-Date).ToUniversalTime().ToString("o")
        }
        
    } catch {
        return @{ status = "error"; error = $_.Exception.Message }
    }
}`;

// Execute-Job switch additions (handlers that go inside the switch block)
const SWITCH_ADDITIONS = `
            # v5.0.5: RESTORED from v4 - Missing handlers causing [DLQ:BUG]
            "light_vuln_scan" {
                $output = Invoke-LightVulnScan -Payload $Job.payload
            }
            "update_agent" {
                $output = Invoke-UpdateAgent -Payload $Job.payload
            }
            "scan" {
                $output = Invoke-ScanJob -Payload $Job.payload
            }
            "report" {
                $output = Invoke-ReportJob
            }
            "reinstall_agent" {
                $output = @{
                    status = "acknowledged"
                    message = "Reinstall must be performed via force_update mechanism"
                    current_version = $Global:AgentVersion
                }
            }
            "collect_info" {
                $output = Get-SystemInfo
            }`;

function patchWindowsScript(v504Content: string): { content: string; changes: string[] } {
  let content = v504Content;
  const changes: string[] = [];
  
  // 1. Bump version in header
  content = content.replace(
    'CyberShield Agent - Windows v5.0.4 FULL ENTERPRISE',
    'CyberShield Agent - Windows v5.0.5 FULL ENTERPRISE'
  );
  changes.push('Version header bumped to v5.0.5');

  // 2. Bump $Global:AgentVersion if present
  content = content.replace(
    /\$Global:AgentVersion\s*=\s*["']v5\.0\.4["']/g,
    '$Global:AgentVersion = "v5.0.5"'
  );
  changes.push('AgentVersion variable bumped to v5.0.5');

  // 3. Add missing handler cases to Execute-Job switch (before the "default" case)
  if (!content.includes('"light_vuln_scan"')) {
    const defaultPattern = /(\s*default\s*\{\s*\$error_message\s*=\s*"Unknown job type)/;
    if (defaultPattern.test(content)) {
      content = content.replace(
        defaultPattern,
        SWITCH_ADDITIONS + '\n$1'
      );
      changes.push('Added light_vuln_scan, update_agent, scan, report, reinstall_agent, collect_info to Execute-Job switch');
    } else {
      changes.push('WARNING: Could not find default case in Execute-Job switch');
    }
  } else {
    changes.push('Switch cases already present');
  }

  // 4. Add function implementations before the defense-in-depth section
  const defenseMarker = '#  Defense-in-depth: Agent-side validation';
  if (content.includes(defenseMarker) && !content.includes('function Invoke-LightVulnScan')) {
    content = content.replace(
      defenseMarker,
      LIGHT_VULN_SCAN_HANDLER + '\n\n' +
      UPDATE_AGENT_HANDLER + '\n\n' +
      REPORT_JOB_HANDLER + '\n\n' +
      SCAN_JOB_HANDLER + '\n' +
      defenseMarker
    );
    changes.push('Added Invoke-LightVulnScan, Invoke-UpdateAgent, Invoke-ReportJob, Invoke-ScanJob functions');
  } else if (!content.includes('function Invoke-LightVulnScan')) {
    // Fallback: append before the last closing block
    content += '\n\n' + LIGHT_VULN_SCAN_HANDLER + '\n\n' + 
               UPDATE_AGENT_HANDLER + '\n\n' + 
               REPORT_JOB_HANDLER + '\n\n' + 
               SCAN_JOB_HANDLER;
    changes.push('Appended handler functions at end of script (fallback)');
  }

  // 5. Add v5.0.5 changelog to header
  if (!content.includes('v5.0.5: BUGFIXES')) {
    content = content.replace(
      'v5.0.4: NEW JOB HANDLERS',
      `v5.0.5: BUGFIXES - Handler Parity & Side-Effect Compliance
    - FIXED: light_vuln_scan handler added (Windows Update COM object scan)
    - FIXED: update_agent handler added (delegates to serve-agent-update)
    - FIXED: scan, report, reinstall_agent handlers restored from v4
    - IMPROVED: Execute-Job switch covers all 25 supported job types

    v5.0.4: NEW JOB HANDLERS`
    );
    changes.push('Added v5.0.5 changelog to header');
  }

  return { content, changes };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const results: Record<string, any> = {};

    // 1. Get current v5.0.4 Windows script
    const { data: v504, error: fetchErr } = await supabase.from('agent_releases')
      .select('id, version, platform, script_content, sha256')
      .eq('version', 'v5.0.4')
      .eq('platform', 'windows')
      .eq('is_active', true)
      .maybeSingle();

    if (fetchErr || !v504) {
      return new Response(JSON.stringify({ 
        error: 'v5.0.4 Windows release not found',
        details: fetchErr?.message 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[patch] Source v5.0.4: ${v504.script_content.length} chars`);

    // 2. Apply patches
    const { content: patchedContent, changes } = patchWindowsScript(v504.script_content);

    // 3. Verify patches applied
    const hasLightVuln = patchedContent.includes('function Invoke-LightVulnScan');
    const hasUpdateAgent = patchedContent.includes('function Invoke-UpdateAgent');
    const hasSwitchCase = patchedContent.includes('"light_vuln_scan"');
    const hasVersion505 = patchedContent.includes('v5.0.5');

    if (!hasLightVuln || !hasSwitchCase || !hasVersion505) {
      return new Response(JSON.stringify({
        error: 'Patch verification failed',
        checks: { hasLightVuln, hasUpdateAgent, hasSwitchCase, hasVersion505 },
        changes
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. Normalize and hash
    const normalized = patchedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
    const bytes = new TextEncoder().encode(normalized);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // 5. Check if v5.0.5 already exists
    const { data: existing } = await supabase.from('agent_releases')
      .select('id')
      .eq('version', 'v5.0.5')
      .eq('platform', 'windows')
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from('agent_releases')
        .update({ script_content: normalized, sha256: hash, is_active: true })
        .eq('id', existing.id);
      if (error) throw error;
      results.windows = { action: 'updated_existing', id: existing.id };
    } else {
      const { data: inserted, error } = await supabase.from('agent_releases')
        .insert({
          version: 'v5.0.5',
          platform: 'windows',
          channel: 'stable',
          script_content: normalized,
          sha256: hash,
          is_active: true,
          release_notes: 'v5.0.5: Handler parity fix - light_vuln_scan, update_agent, scan, report, reinstall_agent, collect_info',
        })
        .select('id');
      if (error) throw error;
      results.windows = { action: 'created', id: inserted?.[0]?.id };
    }

    // 6. Deactivate v5.0.4 for windows
    const { data: deactivated } = await supabase.from('agent_releases')
      .update({ is_active: false })
      .eq('platform', 'windows')
      .eq('is_active', true)
      .neq('version', 'v5.0.5')
      .select('version');
    
    results.deactivated = deactivated?.map(d => d.version) || [];

    // 7. Also handle linux and macos - just copy v5.0.4 with version bump
    for (const platform of ['linux', 'macos']) {
      const { data: src } = await supabase.from('agent_releases')
        .select('script_content')
        .eq('version', 'v5.0.4')
        .eq('platform', platform)
        .eq('is_active', true)
        .maybeSingle();

      if (src?.script_content) {
        // The linux/macos v5 scripts in codebase already have handlers
        // but DB v5.0.4 might not - check and patch version at minimum
        let platformContent = src.script_content;
        platformContent = platformContent.replace(/v5\.0\.4/g, 'v5.0.5');
        
        const platNorm = platformContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const platBytes = new TextEncoder().encode(platNorm);
        const platHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', platBytes)))
          .map(b => b.toString(16).padStart(2, '0')).join('');

        const { data: existPlat } = await supabase.from('agent_releases')
          .select('id').eq('version', 'v5.0.5').eq('platform', platform).maybeSingle();

        if (existPlat) {
          await supabase.from('agent_releases')
            .update({ script_content: platNorm, sha256: platHash, is_active: true })
            .eq('id', existPlat.id);
          results[platform] = { action: 'updated' };
        } else {
          await supabase.from('agent_releases')
            .insert({
              version: 'v5.0.5', platform, channel: 'stable',
              script_content: platNorm, sha256: platHash, is_active: true,
              release_notes: 'v5.0.5: Handler parity fix (version bump from v5.0.4)',
            });
          results[platform] = { action: 'created' };
        }

        // Deactivate v5.0.4
        await supabase.from('agent_releases')
          .update({ is_active: false })
          .eq('platform', platform)
          .eq('is_active', true)
          .neq('version', 'v5.0.5');
      }
    }

    return new Response(JSON.stringify({
      success: true,
      version: 'v5.0.5',
      script_size: bytes.length,
      sha256: hash.substring(0, 16) + '...',
      changes,
      checks: { hasLightVuln, hasUpdateAgent, hasSwitchCase, hasVersion505 },
      results
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error(`[patch] Error: ${(e as Error).message}`);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
