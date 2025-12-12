import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Get Agent Script Content
 * 
 * Busca o script do agente para registro de releases.
 * Prioridade:
 * 1. Buscar da tabela agent_releases (se existir release ativa com script completo)
 * 2. Tentar buscar do storage bucket 'agent-installers'
 * 3. Retornar erro instruindo a executar npm run sync:agent
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
    // Extract JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized: Missing or invalid authorization header',
          requestId
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Parse request body for platform parameter
    let platform: 'windows' | 'linux' | 'macos' = 'windows';
    try {
      if (req.method === 'POST') {
        const body = await req.json();
        if (body?.platform && ['windows', 'linux', 'macos'].includes(body.platform)) {
          platform = body.platform as 'windows' | 'linux' | 'macos';
        }
      }
    } catch {
      // Default to windows if body parsing fails
    }

    // Create Supabase client with user's JWT for authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Get authenticated user from JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error(`[${requestId}] JWT validation failed:`, userError?.message);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized: Invalid or expired token',
          requestId
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Create admin client for role check (bypasses RLS)
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is super_admin using RPC
    const { data: isSuperAdmin, error: roleError } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'super_admin'
    });

    if (roleError) {
      console.error(`[${requestId}] Role check failed:`, roleError.message);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Internal error checking permissions',
          requestId
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!isSuperAdmin) {
      console.warn(`[${requestId}] User ${user.id} attempted access without super_admin role`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Forbidden: Super admin access required',
          requestId
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`[${requestId}] Super admin ${user.id} requesting agent script content for platform: ${platform}`);

    const minSize = MIN_SCRIPT_SIZE[platform];
    let scriptContent: string | null = null;
    let source = 'unknown';

    // Strategy 1: Try to fetch from storage bucket
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
          console.log(`[${requestId}] Found script in storage: ${text.length} bytes`);
        }
      }
    } catch (e) {
      console.log(`[${requestId}] Storage lookup failed, trying next strategy...`);
    }

    // Strategy 2: Try to fetch from agent_releases table (existing release)
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
          console.log(`[${requestId}] Found script in agent_releases (${release.version}): ${release.script_content.length} bytes`);
        }
      } catch (e) {
        console.log(`[${requestId}] agent_releases lookup failed`);
      }
    }

    // If no valid script found, return helpful error
    if (!scriptContent || scriptContent.length < minSize) {
      const platformLabel = platform === 'windows' ? 'Windows' : platform === 'linux' ? 'Linux' : 'macOS';
      console.error(`[${requestId}] No valid script found for ${platform}. Size: ${scriptContent?.length || 0} bytes (min: ${minSize})`);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: `Script ${platformLabel} não encontrado ou muito pequeno.`,
          details: `Execute localmente: node scripts/sync-all-agents.js --${platform}`,
          found_size: scriptContent?.length || 0,
          min_size: minSize,
          requestId
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Return the script content
    return new Response(
      JSON.stringify({
        success: true,
        script_content: scriptContent,
        size_bytes: scriptContent.length,
        platform,
        source,
        requestId
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error(`[${requestId}] Error in get-agent-script-content:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        requestId
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
