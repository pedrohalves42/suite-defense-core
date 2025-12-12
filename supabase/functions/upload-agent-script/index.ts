import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Upload Agent Script
 * 
 * Permite que super admins façam upload de scripts de agentes para o storage bucket.
 * Isso é usado para sincronizar scripts quando o npm run sync:agent não está disponível.
 */

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Extract JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', requestId }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { platform, script_content } = await req.json();
    
    if (!platform || !['windows', 'linux', 'macos'].includes(platform)) {
      return new Response(
        JSON.stringify({ error: 'Invalid platform. Must be windows, linux, or macos', requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!script_content || typeof script_content !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing script_content', requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const minSize = platform === 'windows' ? 40000 : 20000;
    if (script_content.length < minSize) {
      return new Response(
        JSON.stringify({ 
          error: `Script too small (${script_content.length} bytes). Minimum: ${minSize} bytes`,
          requestId 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's JWT for authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get authenticated user from JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token', requestId }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client for role check
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is super_admin
    const { data: isSuperAdmin } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'super_admin'
    });

    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Super admin access required', requestId }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine file name
    const scriptFileName = platform === 'windows' 
      ? 'cybershield-agent-windows-v3.ps1'
      : platform === 'linux'
        ? 'cybershield-agent-linux-v3.sh'
        : 'cybershield-agent-macos-v3.sh';

    const filePath = `scripts/${scriptFileName}`;

    console.log(`[${requestId}] Uploading ${platform} script (${script_content.length} bytes) to ${filePath}`);

    // Upload to storage bucket
    const { error: uploadError } = await supabaseAdmin.storage
      .from('agent-installers')
      .upload(filePath, new Blob([script_content], { type: 'text/plain' }), {
        upsert: true,
        contentType: 'text/plain'
      });

    if (uploadError) {
      console.error(`[${requestId}] Upload failed:`, uploadError);
      throw uploadError;
    }

    // Calculate SHA256
    const encoder = new TextEncoder();
    const data = encoder.encode(script_content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    console.log(`[${requestId}] Upload successful: ${filePath}, SHA256: ${sha256.substring(0, 16)}...`);

    return new Response(
      JSON.stringify({
        success: true,
        platform,
        file_path: filePath,
        size_bytes: script_content.length,
        sha256,
        requestId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
        requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
