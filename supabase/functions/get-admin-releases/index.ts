import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Get Admin Releases - Returns full release data including sensitive fields
 * SECURITY: Only accessible to super_admin users
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get current user
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify super_admin role
    const { data: isSuperAdmin, error: roleError } = await serviceClient.rpc('has_role', {
      _user_id: user.id,
      _role: 'super_admin',
    });

    if (roleError || !isSuperAdmin) {
      console.error('[get-admin-releases] Access denied for user:', user.id);
      return new Response(
        JSON.stringify({ error: 'Forbidden - super_admin required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[get-admin-releases] Super admin ${user.id} fetching all releases`);

    // Fetch all releases with full data using service role
    const { data: releases, error: fetchError } = await serviceClient
      .from('agent_releases')
      .select('id, version, platform, channel, is_active, sha256, release_notes, created_at, created_by, signature_base64, signed_at, signed_by, script_content')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('[get-admin-releases] Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch releases' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ releases: releases || [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[get-admin-releases] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
