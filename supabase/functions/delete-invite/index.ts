import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeleteInviteRequest {
  inviteId: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's token
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
      console.error('[delete-invite] Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { inviteId } = await req.json() as DeleteInviteRequest;
    if (!inviteId) {
      return new Response(
        JSON.stringify({ error: 'Missing inviteId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[delete-invite] User ${user.id} attempting to delete invite ${inviteId}`);

    // Get invite details (using service role to access tenant_id)
    const { data: invite, error: inviteError } = await serviceClient
      .from('invites')
      .select('id, tenant_id, email, status')
      .eq('id', inviteId)
      .maybeSingle();

    if (inviteError || !invite) {
      console.error('[delete-invite] Invite not found:', inviteError);
      return new Response(
        JSON.stringify({ error: 'Invite not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has admin role in the invite's tenant
    const { data: userRole, error: roleError } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', invite.tenant_id)
      .maybeSingle();

    // Also check if super_admin
    const { data: superAdminRole } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle();

    const isAdmin = userRole?.role === 'admin' || superAdminRole?.role === 'super_admin';

    if (roleError || !isAdmin) {
      console.error('[delete-invite] Unauthorized - user is not admin:', { roleError, userRole });
      return new Response(
        JSON.stringify({ error: 'Unauthorized - admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete the invite
    const { error: deleteError } = await serviceClient
      .from('invites')
      .delete()
      .eq('id', inviteId);

    if (deleteError) {
      console.error('[delete-invite] Delete failed:', deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete invite' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[delete-invite] Successfully deleted invite ${inviteId} by user ${user.id}`);

    // Log to audit
    try {
      await serviceClient.from('audit_logs').insert({
        tenant_id: invite.tenant_id,
        user_id: user.id,
        action: 'invite.deleted',
        resource_type: 'invite',
        resource_id: inviteId,
        details: { email: invite.email, status: invite.status },
      });
    } catch (auditErr) {
      console.error('[delete-invite] Audit log failed:', auditErr);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[delete-invite] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
