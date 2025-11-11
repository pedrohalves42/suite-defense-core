import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    console.log(`[${requestId}] Starting list-all-users-admin`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error(`[${requestId}] Missing Authorization header`);
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.error(`[${requestId}] Auth failed:`, authError);
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${requestId}] User authenticated:`, user.id);
    
    // Check if user is super_admin
    const { data: hasSuperAdminRole } = await supabaseClient.rpc('is_super_admin', { 
      _user_id: user.id
    });

    if (!hasSuperAdminRole) {
      console.error(`[${requestId}] User is not super_admin:`, user.id);
      return new Response(JSON.stringify({ error: 'Access denied: Super Admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${requestId}] Fetching all users from all tenants`);

    // Get ALL user_roles
    const { data: allUserRoles, error: rolesError } = await supabaseClient
      .from('user_roles')
      .select('user_id, role, tenant_id, created_at');

    if (rolesError) {
      console.error(`[${requestId}] Error fetching user_roles:`, rolesError);
      throw rolesError;
    }

    if (!allUserRoles || allUserRoles.length === 0) {
      console.log(`[${requestId}] No users found`);
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${requestId}] Found ${allUserRoles.length} user roles`);

    // Get ALL tenants
    const { data: allTenants, error: tenantsError } = await supabaseClient
      .from('tenants')
      .select('id, name, slug');

    if (tenantsError) {
      console.error(`[${requestId}] Error fetching tenants:`, tenantsError);
      throw tenantsError;
    }

    console.log(`[${requestId}] Found ${allTenants?.length || 0} tenants`);

    // Get ALL profiles
    const userIds = allUserRoles.map(ur => ur.user_id);
    const { data: allProfiles, error: profilesError } = await supabaseClient
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', userIds);

    if (profilesError) {
      console.error(`[${requestId}] Error fetching profiles:`, profilesError);
      throw profilesError;
    }

    console.log(`[${requestId}] Found ${allProfiles?.length || 0} profiles`);

    // Get ALL auth users
    const { data: authData, error: authUsersError } = await supabaseClient.auth.admin.listUsers();
    
    if (authUsersError) {
      console.error(`[${requestId}] Error fetching auth users:`, authUsersError);
      throw authUsersError;
    }

    const authUsers = authData.users;
    console.log(`[${requestId}] Found ${authUsers.length} auth users`);

    // Combine all data
    const users = allUserRoles.map(ur => {
      const profile = allProfiles?.find(p => p.user_id === ur.user_id);
      const authUser = authUsers.find(au => au.id === ur.user_id);
      const tenant = allTenants?.find(t => t.id === ur.tenant_id);

      return {
        user_id: ur.user_id,
        email: authUser?.email || '',
        full_name: profile?.full_name || '',
        role: ur.role,
        tenant_id: ur.tenant_id,
        tenant_name: tenant?.name || '',
        created_at: ur.created_at,
      };
    });

    console.log(`[${requestId}] Returning ${users.length} users`);

    return new Response(JSON.stringify(users), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
