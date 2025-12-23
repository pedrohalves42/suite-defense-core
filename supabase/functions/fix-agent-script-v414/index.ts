import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * SSA-011 v2: Fix MissingCatchOrFinally in Verify-Ed25519Signature
 * 
 * The v4.1.2/v4.1.3 scripts have an outer try block in Verify-Ed25519Signature
 * that ends without a catch block, causing PowerShell parse error.
 * 
 * Structure before fix:
 *   function Verify-Ed25519Signature {
 *     try {                    <- outer try
 *       ...
 *       if ($null -eq $ed25519Type) {
 *         try { ... }          <- inner try  
 *         catch { ... }        <- inner catch (OK)
 *       }
 *       else {
 *         ...
 *         return $isValid
 *       }                      <- end of else
 *   }                          <- MISSING catch for outer try!
 *   
 * The fix adds a catch block for the outer try before closing the function.
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

    // Get current active Windows script (v4.1.3 or v4.1.2)
    const { data: currentRelease, error: fetchError } = await supabase
      .from('agent_releases')
      .select('id, version, script_content, release_notes, channel, sha256')
      .eq('platform', 'windows')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !currentRelease) {
      return new Response(JSON.stringify({ 
        error: 'No active Windows release found',
        details: fetchError?.message 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let scriptContent = currentRelease.script_content;
    const originalVersion = currentRelease.version;
    const originalSha = currentRelease.sha256;
    
    // Count try/catch blocks before fix
    const tryCountBefore = (scriptContent.match(/\btry\s*\{/g) || []).length;
    const catchCountBefore = (scriptContent.match(/\bcatch\s*\{/g) || []).length;
    
    console.log('[fix-v414] Analysis before fix:', {
      version: originalVersion,
      tryCount: tryCountBefore,
      catchCount: catchCountBefore,
      balanced: tryCountBefore === catchCountBefore
    });

    // ============================================
    // THE FIX: Find and fix the Verify-Ed25519Signature function
    // ============================================
    
    // The broken pattern is:
    //   return $isValid
    //         }
    //     }
    // 
    // # ============================================
    // #  SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION
    //
    // The fix is to add a catch block before closing the function:
    //   return $isValid
    //         }
    //     }
    //     catch {
    //         Write-Log "[SECURITY] Ed25519 signature verification error: $($_.Exception.Message)" "ERROR"
    //         return $false
    //     }
    // }
    // 
    // # ============================================
    // #  SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION
    
    // Try multiple patterns (LF vs CRLF, different indentation)
    const patterns = [
      // Pattern 1: LF with standard indentation
      {
        search: /(\s+return \$isValid\s+\}\s+\}\s+)(# ============================================\s+#\s+SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION)/,
        replace: `$1    catch {
        Write-Log "[SECURITY] Ed25519 signature verification error: \$(\$_.Exception.Message)" "ERROR"
        return \$false
    }
}

$2`
      },
      // Pattern 2: Function ends with just "}" before next comment block
      {
        search: /(return \$isValid[\r\n]+\s+\}[\r\n]+\}[\r\n]+)([\r\n]+# ={40,}[\r\n]+#\s+SSA-004)/,
        replace: `$1    catch {
        Write-Log "[SECURITY] Ed25519 signature verification error: \$(\$_.Exception.Message)" "ERROR"
        return \$false
    }
}

$2`
      }
    ];

    let fixApplied = false;
    
    // More robust fix: Find the exact location and insert the catch block
    // Look for the pattern where Verify-Ed25519Signature ends
    const functionEndPattern = /(\s+return \$isValid\r?\n\s+\}\r?\n\s*\}\r?\n)(\r?\n# ============================================\r?\n#\s+SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION)/;
    
    if (functionEndPattern.test(scriptContent)) {
      scriptContent = scriptContent.replace(
        functionEndPattern,
        `$1    catch {
        Write-Log "[SECURITY] Ed25519 signature verification error: \$(\$_.Exception.Message)" "ERROR"
        return \$false
    }
}

$2`
      );
      fixApplied = true;
      console.log('[fix-v414] Fixed using primary pattern');
    }

    // Fallback: try direct string replacement
    if (!fixApplied) {
      const brokenEndings = [
        "        return $isValid\r\n        }\r\n}\r\n\r\n# ============================================\r\n#  SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION",
        "        return $isValid\n        }\n}\n\n# ============================================\n#  SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION",
        "            return $isValid\r\n        }\r\n    }\r\n}\r\n\r\n# ============================================\r\n#  SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION",
        "            return $isValid\n        }\n    }\n}\n\n# ============================================\n#  SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION",
      ];
      
      for (const broken of brokenEndings) {
        if (scriptContent.includes(broken)) {
          const lineEnding = broken.includes('\r\n') ? '\r\n' : '\n';
          const indent = broken.match(/^(\s+)return/)?.[1] || '        ';
          const baseIndent = indent.substring(0, indent.length - 4) || '    ';
          
          const fixed = broken.replace(
            /(\s+return \$isValid[\r\n]+\s+\}[\r\n]+\s*\}[\r\n]+)([\r\n]+# ={40,})/,
            `$1${baseIndent}catch {${lineEnding}` +
            `${indent}Write-Log "[SECURITY] Ed25519 signature verification error: \$(\$_.Exception.Message)" "ERROR"${lineEnding}` +
            `${indent}return \$false${lineEnding}` +
            `${baseIndent}}${lineEnding}` +
            `}${lineEnding}${lineEnding}$2`
          );
          
          scriptContent = scriptContent.replace(broken, fixed);
          fixApplied = true;
          console.log('[fix-v414] Fixed using fallback pattern');
          break;
        }
      }
    }

    // Ultra-fallback: Find the function and manually insert catch
    if (!fixApplied) {
      // Find "function Verify-Ed25519Signature" and look for its closing
      const funcStart = scriptContent.indexOf('function Verify-Ed25519Signature');
      if (funcStart > -1) {
        // Find "# SSA-004: JOB PAYLOAD" which comes after
        const nextSection = scriptContent.indexOf('SSA-004: JOB PAYLOAD SIGNATURE VERIFICATION', funcStart);
        if (nextSection > -1) {
          // Look backwards from nextSection to find the closing braces
          const sectionBefore = scriptContent.substring(funcStart, nextSection);
          
          // Count braces in function
          const tryMatches = sectionBefore.match(/\btry\s*\{/g) || [];
          const catchMatches = sectionBefore.match(/\bcatch\s*\{/g) || [];
          
          console.log('[fix-v414] Function analysis:', {
            tryCount: tryMatches.length,
            catchCount: catchMatches.length,
            needsFix: tryMatches.length > catchMatches.length
          });
          
          if (tryMatches.length > catchMatches.length) {
            // There's an unmatched try - need to add catch before function closes
            // Find the last "}" before "# SSA-004"
            const commentLineStart = scriptContent.lastIndexOf('\n', nextSection);
            const insertPoint = scriptContent.lastIndexOf('}', commentLineStart);
            
            if (insertPoint > funcStart) {
              const lineEnding = scriptContent.includes('\r\n') ? '\r\n' : '\n';
              const catchBlock = `${lineEnding}    catch {${lineEnding}        Write-Log "[SECURITY] Ed25519 signature verification error: \$(\$_.Exception.Message)" "ERROR"${lineEnding}        return \$false${lineEnding}    }${lineEnding}}`;
              
              // Replace the last } with catch block + }
              scriptContent = scriptContent.substring(0, insertPoint) + catchBlock + scriptContent.substring(insertPoint + 1);
              fixApplied = true;
              console.log('[fix-v414] Fixed using ultra-fallback insertion');
            }
          }
        }
      }
    }

    // Count after fix
    const tryCountAfter = (scriptContent.match(/\btry\s*\{/g) || []).length;
    const catchCountAfter = (scriptContent.match(/\bcatch\s*\{/g) || []).length;
    
    console.log('[fix-v414] Analysis after fix:', {
      tryCount: tryCountAfter,
      catchCount: catchCountAfter,
      balanced: tryCountAfter === catchCountAfter,
      fixApplied
    });

    // Update version in header to v4.1.4
    scriptContent = scriptContent.replace(
      /CyberShield Agent - Windows v4\.1\.\d+/,
      'CyberShield Agent - Windows v4.1.4'
    );
    
    // Add fix note to header
    if (!scriptContent.includes('SSA-011')) {
      scriptContent = scriptContent.replace(
        /SSA-010: Restauração de todos os jobs do v3/,
        'SSA-011: Fix MissingCatchOrFinally in Verify-Ed25519Signature (v4.1.4)\n    SSA-010: Restauração de todos os jobs do v3'
      );
    } else {
      // Update existing SSA-011 note
      scriptContent = scriptContent.replace(
        /SSA-011:[^\n]+/,
        'SSA-011: Fix MissingCatchOrFinally in Verify-Ed25519Signature (v4.1.4)'
      );
    }

    // Calculate new SHA256
    const encoder = new TextEncoder();
    const data = encoder.encode(scriptContent);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Check if script actually changed
    if (sha256 === originalSha) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Script content unchanged after fix attempt',
        originalVersion,
        originalSha,
        tryCountBefore,
        catchCountBefore,
        tryCountAfter,
        catchCountAfter,
        message: 'The fix pattern did not match. The script may have a different structure than expected.'
      }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Deactivate all Windows stable releases
    await supabase
      .from('agent_releases')
      .update({ is_active: false })
      .eq('platform', 'windows')
      .eq('channel', 'stable');

    // Insert v4.1.4
    const { error: insertError } = await supabase
      .from('agent_releases')
      .insert({
        platform: 'windows',
        version: 'v4.1.4',
        channel: 'stable',
        script_content: scriptContent,
        sha256,
        release_notes: 'SSA-011 v2: Fix PowerShell MissingCatchOrFinally syntax error in Verify-Ed25519Signature function. Added missing catch block for outer try statement.',
        is_active: true,
        created_by: user.id
      });

    if (insertError) {
      return new Response(JSON.stringify({ 
        error: 'Failed to insert v4.1.4',
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
        version: 'v4.1.4',
        is_latest: true,
        sha256,
        size_bytes: scriptContent.length,
        download_url: `${SUPABASE_URL}/functions/v1/serve-agent-update`,
        release_notes: 'SSA-011 v2: Fix PowerShell syntax error'
      }, {
        onConflict: 'platform,version'
      });

    return new Response(JSON.stringify({
      success: true,
      fixApplied,
      previousVersion: originalVersion,
      newVersion: 'v4.1.4',
      previousSha: originalSha,
      newSha: sha256,
      scriptSize: scriptContent.length,
      diagnosis: {
        tryCountBefore,
        catchCountBefore,
        tryCountAfter,
        catchCountAfter,
        wasBalanced: tryCountBefore === catchCountBefore,
        isBalanced: tryCountAfter === catchCountAfter
      },
      actions: [
        `Deactivated ${originalVersion}`,
        'Created v4.1.4 with proper catch block fix',
        'Updated agent_versions to latest'
      ],
      nextSteps: [
        'Generate new enrollment key for affected agents',
        'Reinstall agents with the new installer',
        'Agents will download corrected v4.1.4 script'
      ]
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[fix-v414] Error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: (error as Error).message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
