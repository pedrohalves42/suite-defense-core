import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Get Agent Script Content
 * 
 * Supports two actions:
 * 1. Default: Fetch script content for a specific platform (admin only)
 * 2. list-all: List all releases with full metadata including signatures (admin only)
 */

const MIN_SCRIPT_SIZE = {
  windows: 40000,
  linux: 20000,
  macos: 20000
};

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized', requestId }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized', requestId }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: isSuperAdmin } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id, _role: 'super_admin'
    });

    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden', requestId }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse body
    let body: Record<string, unknown> = {};
    try {
      if (req.method === 'POST') {
        body = await req.json();
      }
    } catch { /* default empty */ }

    const action = body?.action as string | undefined;

    // ===== ACTION: list-all — return all releases with signature metadata =====
    if (action === 'list-all') {
      const { data: releases, error: listError } = await supabaseAdmin
        .from('agent_releases')
        .select('id, version, platform, channel, sha256, script_content, release_notes, is_active, signature_base64, signed_at, signed_by, created_at')
        .order('created_at', { ascending: false });

      if (listError) {
        console.error(`[${requestId}] list-all error:`, listError.message);
        return new Response(
          JSON.stringify({ success: false, error: listError.message, requestId }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ releases: releases || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== DEFAULT: fetch script content for a platform =====
    let platform: 'windows' | 'linux' | 'macos' = 'windows';
    if (body?.platform && ['windows', 'linux', 'macos'].includes(body.platform as string)) {
      platform = body.platform as 'windows' | 'linux' | 'macos';
    }

    console.log(`[${requestId}] Admin ${user.id} requesting script for ${platform}`);

    const minSize = MIN_SCRIPT_SIZE[platform];
    let scriptContent: string | null = null;
    let source = 'unknown';

    // Strategy 1: Storage bucket
    try {
      const scriptFileName = platform === 'windows' 
        ? 'cybershield-agent-windows-v3.ps1'
        : platform === 'linux'
          ? 'cybershield-agent-linux-v3.sh'
          : 'cybershield-agent-macos-v3.sh';

      const { data: fileData, error: storageError } = await supabaseAdmin.storage
        .from('agent-installers')
        .download(`scripts/${scriptFileName}`);

      if (!storageError && fileData) {
        const text = await fileData.text();
        if (text.length >= minSize) {
          scriptContent = text;
          source = 'storage';
        }
      }
    } catch { /* next strategy */ }

    // Strategy 2: agent_releases table
    if (!scriptContent) {
      try {
        const { data: release } = await supabaseAdmin
          .from('agent_releases')
          .select('script_content, version')
          .eq('platform', platform)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (release?.script_content && release.script_content.length >= minSize) {
          scriptContent = release.script_content;
          source = 'agent_releases';
        }
      } catch { /* no release found */ }
    }

    if (!scriptContent || scriptContent.length < minSize) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Script ${platform} não encontrado ou muito pequeno.`,
          requestId
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        script_content: scriptContent,
        size_bytes: scriptContent.length,
        platform,
        source,
        requestId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error', requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
