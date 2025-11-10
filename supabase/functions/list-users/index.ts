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
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Não autorizado', 401, requestId);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { 
      global: { headers: { Authorization: authHeader } } 
    });
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Não autorizado', 401, requestId);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log(`[${requestId}] Checking admin role for user:`, user.id);
    
    // Check if user is admin
    const { data: hasAdminRole, error: roleError } = await supabaseAdmin.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'admin' 
    });

    console.log(`[${requestId}] Admin check result:`, { hasAdminRole, roleError });

    if (roleError) {
      console.error(`[${requestId}] Role check error:`, roleError);
      return createErrorResponse(
        ErrorCode.INTERNAL_ERROR, 
        'Falha ao verificar permissões de admin', 
        500, 
        requestId
      );
    }

    if (!hasAdminRole) {
      console.warn(`[${requestId}] User ${user.id} is not admin`);
      return createErrorResponse(ErrorCode.FORBIDDEN, 'Acesso negado', 403, requestId);
    }

    // Get user's tenant
    console.log(`[${requestId}] Fetching tenant for user:`, user.id);
    
    const { data: userRole, error: tenantError } = await supabaseAdmin
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    console.log(`[${requestId}] Tenant query result:`, { userRole, tenantError });

    if (tenantError) {
      console.error(`[${requestId}] Error fetching tenant:`, tenantError);
      return createErrorResponse(
        ErrorCode.INTERNAL_ERROR, 
        'Erro ao buscar tenant do usuário', 
        500, 
        requestId
      );
    }

    if (!userRole?.tenant_id) {
      console.warn(`[${requestId}] No tenant found for user:`, user.id);
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Tenant não encontrado', 400, requestId);
    }

    console.log(`[${requestId}] Found tenant:`, userRole.tenant_id);

    // Get all users in the tenant
    const { data: tenantUsers } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, role, created_at')
      .eq('tenant_id', userRole.tenant_id);

    if (!tenantUsers) {
      return new Response(JSON.stringify({ users: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get tenant info
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, name')
      .eq('id', userRole.tenant_id)
      .single();

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
        tenant_id: userRole.tenant_id,
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
