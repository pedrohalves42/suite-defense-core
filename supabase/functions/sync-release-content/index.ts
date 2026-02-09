import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { AGENT_SCRIPT_WINDOWS_CONTENT } from '../_shared/agent-script-windows-content.ts';
import { signPayload } from '../_shared/crypto-utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ED25519_PRIVATE_KEY = Deno.env.get('ED25519_PRIVATE_KEY');
const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');

/**
 * Sync Release Content
 * 
 * Synchronizes the agent script content from the codebase to the agent_releases table.
 * This ensures the active release always has the correct script content.
 * 
 * Usage:
 *   POST /functions/v1/sync-release-content
 *   Authorization: Bearer <INTERNAL_FUNCTION_SECRET>
 *   Body: { "platform": "windows", "version": "v5.0.3" }
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[sync-release-content][${requestId}] Request received`);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Verify internal authentication or super_admin or user auth from preview
    const authHeader = req.headers.get('Authorization');
    let isAuthorized = false;
    
    if (authHeader) {
      // Check if internal call
      if (authHeader === `Bearer ${INTERNAL_SECRET}`) {
        isAuthorized = true;
        console.log(`[sync-release-content][${requestId}] Authorized via INTERNAL_SECRET`);
      } else {
        // Check if user is super_admin
        const { data: { user }, error: authError } = await supabase.auth.getUser(
          authHeader.replace('Bearer ', '')
        );

        if (!authError && user) {
          const { data: roles } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id);

          const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
          if (isSuperAdmin) {
            isAuthorized = true;
            console.log(`[sync-release-content][${requestId}] Authorized via super_admin user`);
          }
        }
      }
    }
    
    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - requires super_admin or internal secret', requestId }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const body = await req.json().catch(() => ({}));
    const targetPlatform = body.platform || 'all';
    const targetVersion = body.version || 'v5.0.3';

    const results: Record<string, unknown> = {};

    // Get script content based on platform (Windows only for now)
    const getScriptContent = (platform: string): string | null => {
      switch (platform) {
        case 'windows': return AGENT_SCRIPT_WINDOWS_CONTENT;
        // Linux and macOS scripts have encoding issues - skip for now
        default: return null;
      }
    };

    // Only sync Windows for now due to encoding issues in other platforms
    const platforms = targetPlatform === 'all' 
      ? ['windows'] 
      : (targetPlatform === 'windows' ? ['windows'] : []);

    for (const platform of platforms) {
      try {
        const scriptContent = getScriptContent(platform);
        
        if (!scriptContent) {
          results[platform] = { success: false, error: 'Platform not supported yet' };
          continue;
        }
        
        // Normalize line endings
        let normalizedScript = scriptContent;
        if (platform === 'windows') {
          normalizedScript = scriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
        }

        // Calculate SHA256
        const encoder = new TextEncoder();
        const scriptBytes = encoder.encode(normalizedScript);
        const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        console.log(`[sync-release-content][${requestId}] Syncing ${platform} ${targetVersion} (${scriptBytes.length} bytes, sha256: ${sha256.substring(0, 16)}...)`);

        // Generate signature if key available
        let signature_base64: string | null = null;
        let signed_at: string | null = null;
        let signed_by: string | null = null;

        if (ED25519_PRIVATE_KEY) {
          try {
            const canonicalPayload = JSON.stringify({
              platform,
              version: targetVersion,
              sha256,
              channel: 'stable'
            });
            signature_base64 = await signPayload(canonicalPayload, ED25519_PRIVATE_KEY);
            signed_at = new Date().toISOString();
            signed_by = 'sync-release-content';
            console.log(`[sync-release-content][${requestId}] Signed ${platform} release`);
          } catch (signError) {
            console.warn(`[sync-release-content][${requestId}] Failed to sign: ${(signError as Error).message}`);
          }
        }

        // Update the active release
        const updateData: Record<string, unknown> = {
          script_content: normalizedScript,
          sha256,
        };

        if (signature_base64) {
          updateData.signature_base64 = signature_base64;
          updateData.signed_at = signed_at;
          updateData.signed_by = signed_by;
        }

        const { error: updateError } = await supabase
          .from('agent_releases')
          .update(updateData)
          .eq('platform', platform)
          .eq('version', targetVersion)
          .eq('is_active', true);

        if (updateError) {
          console.error(`[sync-release-content][${requestId}] Failed to update ${platform}:`, updateError);
          results[platform] = { success: false, error: updateError.message };
        } else {
          results[platform] = { 
            success: true, 
            version: targetVersion, 
            size: scriptBytes.length,
            sha256: sha256.substring(0, 16) + '...',
            signed: !!signature_base64
          };
          console.log(`[sync-release-content][${requestId}] Updated ${platform} successfully`);
        }

      } catch (platformError) {
        console.error(`[sync-release-content][${requestId}] Error processing ${platform}:`, platformError);
        results[platform] = { success: false, error: (platformError as Error).message };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        requestId,
        results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const err = error as Error;
    console.error(`[sync-release-content][${requestId}] Error:`, err.message);
    
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
