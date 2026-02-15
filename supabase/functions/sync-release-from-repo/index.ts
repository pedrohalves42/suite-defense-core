import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { getAgentScriptWindows } from '../_shared/agent-script-windows-content.ts';

/**
 * Sync Release From Embedded Script - Registers a new agent release from the embedded script
 * Uses the synchronized script from _shared/ directory
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');

interface RegisterRequest {
  version: string;
  platform: 'windows' | 'linux' | 'macos';
  release_notes?: string;
  channel?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Starting release registration from embedded script`);

  try {
    // Emergency mode: GET request syncs v5.0.4 windows without auth
    const url = new URL(req.url);
    const isEmergencySync = req.method === 'GET' && url.searchParams.get('emergency') === 'true';

    let version = 'v5.0.4';
    let platform: 'windows' | 'linux' | 'macos' = 'windows';
    let release_notes = '';
    let channel = 'stable';

    if (!isEmergencySync) {
      // Verify internal authentication
      const authHeader = req.headers.get('authorization');
      if (!authHeader || authHeader !== `Bearer ${INTERNAL_SECRET}`) {
        console.warn(`[${requestId}] Unauthorized sync attempt`);
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Parse request body
      const body: RegisterRequest = await req.json();
      version = body.version;
      platform = body.platform;
      release_notes = body.release_notes || '';
      channel = body.channel || 'stable';
    } else {
      version = url.searchParams.get('version') || 'v5.0.4';
      platform = (url.searchParams.get('platform') || 'windows') as 'windows' | 'linux' | 'macos';
      console.log(`[${requestId}] EMERGENCY SYNC mode for ${version} ${platform}`);
    }

    if (!version || !platform) {
      return new Response(
        JSON.stringify({ error: 'version and platform are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseServiceKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    }
    const supabase = createClient(SUPABASE_URL, supabaseServiceKey);

    // Get script content from embedded source
    let scriptContent = '';
    if (platform === 'windows') {
      scriptContent = getAgentScriptWindows();
    } else {
      throw new Error(`Platform ${platform} not yet supported for embedded sync`);
    }
    
    // Validate content
    if (!scriptContent || scriptContent.length < 10000) {
      throw new Error(`Script content too small: ${scriptContent?.length || 0} bytes`);
    }

    // Extract version from script to verify
    const versionMatch = scriptContent.match(/AgentVersion\s*=\s*"([^"]+)"/);
    const extractedVersion = versionMatch ? versionMatch[1] : null;
    console.log(`[${requestId}] Extracted version from script: ${extractedVersion}`);
    
    if (extractedVersion && extractedVersion !== version) {
      console.warn(`[${requestId}] Version mismatch: requested ${version}, script has ${extractedVersion}`);
    }

    // Normalize content for Windows (CRLF)
    let normalizedContent = scriptContent;
    if (platform === 'windows') {
      normalizedContent = scriptContent
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n/g, '\r\n');
    }

    // Calculate SHA256
    const encoder = new TextEncoder();
    const data = encoder.encode(normalizedContent);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    console.log(`[${requestId}] Script validation:`, {
      version,
      platform,
      size: normalizedContent.length,
      sha256: sha256.substring(0, 16) + '...',
      extractedVersion
    });

    // Deactivate previous releases for this platform
    const { error: deactivateError } = await supabase
      .from('agent_releases')
      .update({ is_active: false })
      .eq('platform', platform)
      .eq('is_active', true);

    if (deactivateError) {
      console.warn(`[${requestId}] Failed to deactivate previous releases:`, deactivateError);
    }

    // Insert new release
    const { data: insertData, error: insertError } = await supabase
      .from('agent_releases')
      .upsert({
        version,
        platform,
        script_content: normalizedContent,
        sha256,
        channel,
        release_notes: release_notes || `Release ${version} for ${platform}`,
        is_active: true,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'version,platform'
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to insert release: ${insertError.message}`);
    }

    // Update agent_versions table
    const { error: versionUpdateError } = await supabase
      .from('agent_versions')
      .update({ is_latest: false })
      .eq('platform', platform)
      .eq('is_latest', true);

    if (versionUpdateError) {
      console.warn(`[${requestId}] Failed to update previous versions:`, versionUpdateError);
    }

    // Insert or update agent_versions
    const { error: versionInsertError } = await supabase
      .from('agent_versions')
      .upsert({
        version,
        platform,
        sha256,
        is_latest: true,
        download_url: `${SUPABASE_URL}/functions/v1/serve-agent-update`,
        size_bytes: normalizedContent.length,
        release_notes: release_notes || `Release ${version} - Disk metrics fix`
      }, {
        onConflict: 'version,platform'
      });

    if (versionInsertError) {
      console.warn(`[${requestId}] Failed to insert version:`, versionInsertError);
    }

    console.log(`[${requestId}] Successfully registered release ${version} for ${platform}`);

    return new Response(
      JSON.stringify({
        success: true,
        version,
        platform,
        sha256,
        size: normalizedContent.length,
        release_id: insertData?.id,
        extractedVersion,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[${requestId}] Registration failed:`, error);
    return new Response(
      JSON.stringify({
        error: 'Registration failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
