import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException, createErrorResponse, ErrorCode, corsHeaders } from '../_shared/error-handler.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Nao autorizado', 401, requestId);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { 
      global: { headers: { Authorization: authHeader } } 
    });
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Nao autorizado', 401, requestId);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log(`[${requestId}] Checking admin/super_admin role for user:`, user.id);
    
    // Check if user is admin or super_admin
    const [adminCheck, superAdminCheck] = await Promise.all([
      supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'admin' }),
      supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'super_admin' })
    ]);

    const hasAdminRole = adminCheck.data || superAdminCheck.data;
    const roleError = adminCheck.error || superAdminCheck.error;

    console.log(`[${requestId}] Role check result:`, { hasAdminRole, isAdmin: adminCheck.data, isSuperAdmin: superAdminCheck.data, roleError });

    if (roleError) {
      console.error(`[${requestId}] Role check error:`, roleError);
      return createErrorResponse(
        ErrorCode.INTERNAL_ERROR, 
        'Falha ao verificar permissoes de admin', 
        500, 
        requestId
      );
    }

    if (!hasAdminRole) {
      console.warn(`[${requestId}] User ${user.id} is not admin or super_admin`);
      return createErrorResponse(ErrorCode.FORBIDDEN, 'Acesso negado', 403, requestId);
    }

    // Resolve tenant context (prefer explicit tenant from client)
    const requestedTenantId = req.headers.get('x-tenant-id')?.trim() || url.searchParams.get('tenant_id')?.trim() || null;
    console.log(`[${requestId}] Resolving tenant for user:`, { userId: user.id, requestedTenantId });

    let targetTenantId: string | null = null;

    if (requestedTenantId) {
      if (superAdminCheck.data) {
        targetTenantId = requestedTenantId;
      } else {
        const { data: tenantMembership, error: membershipError } = await supabaseAdmin
          .from('user_roles')
          .select('tenant_id')
          .eq('user_id', user.id)
          .eq('tenant_id', requestedTenantId)
          .limit(1)
          .maybeSingle();

        if (membershipError) {
          console.error(`[${requestId}] Error validating tenant membership:`, membershipError);
          return createErrorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Erro ao validar acesso ao tenant',
            500,
            requestId
          );
        }

        if (!tenantMembership?.tenant_id) {
          console.warn(`[${requestId}] User ${user.id} has no access to tenant ${requestedTenantId}`);
          return createErrorResponse(ErrorCode.FORBIDDEN, 'Acesso negado ao tenant selecionado', 403, requestId);
        }

        targetTenantId = tenantMembership.tenant_id;
      }
    } else {
      // Fallback for legacy clients without explicit tenant header
      const { data: userRole, error: tenantError } = await supabaseAdmin
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log(`[${requestId}] Tenant fallback result:`, { userRole, tenantError });

      if (tenantError) {
        console.error(`[${requestId}] Error fetching tenant:`, tenantError);
        return createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Erro ao buscar tenant do usuario',
          500,
          requestId
        );
      }

      targetTenantId = userRole?.tenant_id || null;
    }

    if (!targetTenantId) {
      console.warn(`[${requestId}] No tenant found for user:`, user.id);
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Tenant nao encontrado', 400, requestId);
    }

    console.log(`[${requestId}] Using tenant:`, targetTenantId);

    // Get all users in the tenant
    const { data: tenantUsers } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, role, created_at')
      .eq('tenant_id', targetTenantId);

    if (!tenantUsers) {
      return new Response(JSON.stringify({ users: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get tenant info
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, name')
      .eq('id', targetTenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get profiles
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', tenantUsers.map(u => u.user_id));

    // Get auth users (to get email and banned status)
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    
    const tenantUserIds = tenantUsers.map(u => u.user_id);
    const filteredAuthUsers = authUsers.users.filter(au => tenantUserIds.includes(au.id));

    // Combine all data
    const users = tenantUsers.map(tu => {
      const profile = profiles?.find(p => p.user_id === tu.user_id);
      const authUser = filteredAuthUsers.find(au => au.id === tu.user_id);

      // Check if user is banned by checking the banned_until field (requires casting to any)
      const isBanned = authUser && (authUser as any).banned_until && 
        new Date((authUser as any).banned_until) > new Date();

      return {
        user_id: tu.user_id,
        email: authUser?.email || '',
        full_name: profile?.full_name || '',
        role: tu.role,
        tenant_id: targetTenantId,
        tenant_name: tenant?.name || '',
        created_at: tu.created_at,
        is_active: !isBanned,
      };
    });

    return new Response(JSON.stringify({ users }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return handleException(error, requestId, 'list-users');
  }
});
