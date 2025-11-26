import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { AGENT_SCRIPT_WINDOWS_CONTENT } from '../_shared/agent-script-windows-content.ts';

const requestId = crypto.randomUUID();

Deno.serve(async (req) => {
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

    const jwt = authHeader.replace('Bearer ', '');

    // Create Supabase admin client with SERVICE_ROLE_KEY
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Validate JWT and get user
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(jwt);
    
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

    console.log(`[${requestId}] Super admin ${user.id} requesting agent script content`);

    // Return the embedded agent script content directly
    return new Response(
      JSON.stringify({
        success: true,
        script_content: AGENT_SCRIPT_WINDOWS_CONTENT,
        size_bytes: AGENT_SCRIPT_WINDOWS_CONTENT.length,
        source: 'embedded',
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
