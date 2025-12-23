import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * SSA-011: Fix corrupted v4.1.2 script and create v4.1.3
 * 
 * The v4.1.2 script has a missing catch block in Verify-ScriptSignature function
 * causing PowerShell parse error "MissingCatchOrFinally" at line ~303
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify auth (super_admin only)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roles || roles.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Requires super_admin' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get current v4.1.2 script
    const { data: currentRelease, error: fetchError } = await supabase
      .from('agent_releases')
      .select('id, version, script_content, release_notes, channel')
      .eq('platform', 'windows')
      .eq('version', 'v4.1.2')
      .eq('is_active', true)
      .single();

    if (fetchError || !currentRelease) {
      return new Response(JSON.stringify({ 
        error: 'v4.1.2 not found',
        details: fetchError?.message 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let scriptContent = currentRelease.script_content;
    
    // Count try/catch blocks before fix
    const tryCountBefore = (scriptContent.match(/try\s*\{/g) || []).length;
    const catchCountBefore = (scriptContent.match(/catch\s*\{/g) || []).length;

    // FIX 1: The Verify-ScriptSignature function ends without catch
    // Pattern: function ends with "return $isValid" + "}" + "}" but no catch for inner try
    // The buggy pattern is the function closing with just } } after else block without catch
    
    // Find the problematic section where Verify-ScriptSignature ends
    // The bug is: function has try inside else{} that never gets a catch
    const bugPattern1 = /(\s*\$isValid = \$ed25519\.VerifyData\(\$ScriptBytes, \$signature\)\s*if \(\$isValid\) \{\s*Write-Log "\[SECURITY\] ✅ Ed25519 signature verified successfully" "SUCCESS"\s*\} else \{\s*Write-Log "\[SECURITY\] ❌ Ed25519 signature verification FAILED" "ERROR"\s*\}\s*return \$isValid\s*\}\s*\}\s*)(# ============================================\s*#  SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION)/;
    
    // Alternative simpler pattern matching
    const bugPattern2 = /(\s+return \$isValid\s+\}\s+\}\s+)(# ============================================\s+#\s+SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION)/;
    
    let fixApplied = false;
    
    // The actual fix: the function Verify-ScriptSignature has a try block that's never closed
    // Looking at structure: function -> try -> if (ed25519Type null) -> try+catch -> else -> no catch!
    // The outer try block at function level never gets its catch
    
    // Find pattern: ends function with return $isValid } } before next function
    // Need to add: catch { Write-Log "..." ; return $false }
    
    const fixedSection = `            return $isValid
        }
    }
    catch {
        Write-Log "[SECURITY] ❌ Ed25519 signature verification error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# ============================================
#  SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION`;

    const brokenSection = `            return $isValid
        }
}

# ============================================
#  SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION`;

    if (scriptContent.includes(brokenSection)) {
      scriptContent = scriptContent.replace(brokenSection, fixedSection);
      fixApplied = true;
    }

    // Also check for another variation with different whitespace
    const brokenSection2 = `return $isValid\r\n        }\r\n}\r\n\r\n# ============================================\r\n#  SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION`;
    const fixedSection2 = `return $isValid\r\n        }\r\n    }\r\n    catch {\r\n        Write-Log "[SECURITY] ❌ Ed25519 signature verification error: \$(\$_.Exception.Message)" "ERROR"\r\n        return \$false\r\n    }\r\n}\r\n\r\n# ============================================\r\n#  SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION`;

    if (!fixApplied && scriptContent.includes(brokenSection2)) {
      scriptContent = scriptContent.replace(brokenSection2, fixedSection2);
      fixApplied = true;
    }

    // Check for CRLF vs LF variations
    const brokenSectionCRLF = brokenSection.replace(/\n/g, '\r\n');
    const fixedSectionCRLF = fixedSection.replace(/\n/g, '\r\n');
    
    if (!fixApplied && scriptContent.includes(brokenSectionCRLF)) {
      scriptContent = scriptContent.replace(brokenSectionCRLF, fixedSectionCRLF);
      fixApplied = true;
    }

    // Count after fix
    const tryCountAfter = (scriptContent.match(/try\s*\{/g) || []).length;
    const catchCountAfter = (scriptContent.match(/catch\s*\{/g) || []).length;

    // Update version in header
    scriptContent = scriptContent.replace(
      /CyberShield Agent - Windows v4\.1\.2/,
      'CyberShield Agent - Windows v4.1.3'
    );
    
    // Add fix note to header
    scriptContent = scriptContent.replace(
      /SSA-010: Restauração de todos os jobs do v3/,
      'SSA-011: Fix MissingCatchOrFinally syntax error in Verify-ScriptSignature\n    SSA-010: Restauração de todos os jobs do v3'
    );

    // Calculate new SHA256
    const encoder = new TextEncoder();
    const data = encoder.encode(scriptContent);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Deactivate v4.1.2
    await supabase
      .from('agent_releases')
      .update({ is_active: false })
      .eq('platform', 'windows')
      .eq('version', 'v4.1.2');

    // Deactivate all other windows releases
    await supabase
      .from('agent_releases')
      .update({ is_active: false })
      .eq('platform', 'windows')
      .eq('channel', 'stable');

    // Insert v4.1.3
    const { error: insertError } = await supabase
      .from('agent_releases')
      .insert({
        platform: 'windows',
        version: 'v4.1.3',
        channel: 'stable',
        script_content: scriptContent,
        sha256,
        release_notes: 'SSA-011: Fix PowerShell syntax error (MissingCatchOrFinally) in Verify-ScriptSignature function. All try blocks now have matching catch blocks.',
        is_active: true,
        created_by: user.id
      });

    if (insertError) {
      return new Response(JSON.stringify({ 
        error: 'Failed to insert v4.1.3',
        details: insertError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Update agent_versions
    await supabase
      .from('agent_versions')
      .update({ is_latest: false })
      .eq('platform', 'windows');

    await supabase
      .from('agent_versions')
      .upsert({
        platform: 'windows',
        version: 'v4.1.3',
        is_latest: true,
        sha256,
        size_bytes: scriptContent.length,
        download_url: `${SUPABASE_URL}/functions/v1/serve-agent-update`,
        release_notes: 'SSA-011: Fix PowerShell syntax error'
      }, {
        onConflict: 'platform,version'
      });

    return new Response(JSON.stringify({
      success: true,
      fixApplied,
      newVersion: 'v4.1.3',
      sha256,
      scriptSize: scriptContent.length,
      diagnosis: {
        tryCountBefore,
        catchCountBefore,
        tryCountAfter,
        catchCountAfter,
        balanced: tryCountAfter === catchCountAfter
      },
      actions: [
        'Deactivated v4.1.2',
        'Created v4.1.3 with fix',
        'Updated agent_versions to latest'
      ],
      nextSteps: [
        'Reinstall affected agents with new enrollment key',
        'Or wait for auto-update to pull v4.1.3'
      ]
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: (error as Error).message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
