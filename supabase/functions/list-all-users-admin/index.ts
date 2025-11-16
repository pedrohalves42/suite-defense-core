import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { requireSuperAdmin } from '../_shared/require-super-admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    console.log(`[${requestId}] Starting list-all-users-admin`);
    
    // CRITICAL SECURITY: Validate super_admin role
    const authResult = await requireSuperAdmin(req, requestId);
    if (!authResult.success) {
      return authResult.response!;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Parse pagination parameters
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '1000'), 1000); // Max 1000
    const offset = parseInt(url.searchParams.get('offset') || '0');

    console.log(`[${requestId}] Fetching users with pagination: limit=${limit}, offset=${offset}`);

    // Get user_roles with pagination
    const { data: allUserRoles, error: rolesError, count: totalRoles } = await supabaseClient
      .from('user_roles')
      .select('user_id, role, tenant_id, created_at', { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (rolesError) {
      console.error(`[${requestId}] Error fetching user_roles:`, rolesError);
      throw rolesError;
    }

    if (!allUserRoles || allUserRoles.length === 0) {
      console.log(`[${requestId}] No users found`);
      return new Response(JSON.stringify({ 
        users: [], 
        pagination: { total: 0, limit, offset, hasMore: false } 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${requestId}] Found ${allUserRoles.length} user roles (total: ${totalRoles})`);

    // Get tenants (limited to 1000 for safety)
    const { data: allTenants, error: tenantsError } = await supabaseClient
      .from('tenants')
      .select('id, name, slug')
      .limit(1000);

    if (tenantsError) {
      console.error(`[${requestId}] Error fetching tenants:`, tenantsError);
      throw tenantsError;
    }

    console.log(`[${requestId}] Found ${allTenants?.length || 0} tenants`);

    // Get profiles for this page's users only
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

    // Get auth users for this page only (max 1000 per Supabase Auth API limit)
    const { data: authData, error: authUsersError } = await supabaseClient.auth.admin.listUsers({
      perPage: Math.min(limit, 1000),
      page: Math.floor(offset / 1000) + 1
    });
    
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

    const hasMore = (totalRoles || 0) > offset + limit;

    return new Response(JSON.stringify({
      users,
      pagination: {
        total: totalRoles || 0,
        limit,
        offset,
        hasMore
      }
    }), {
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
