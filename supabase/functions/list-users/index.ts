/**
 * List Users - Migrated to serveTenant middleware
 * SECURITY: Only admin/super_admin can list users
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (req, ctx) => {
  const { supabase, userId, requestId } = ctx;

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'Nao autorizado' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check admin/super_admin role
  const [adminCheck, superAdminCheck] = await Promise.all([
    supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
    supabase.rpc('has_role', { _user_id: userId, _role: 'super_admin' }),
  ]);

  const hasAdminRole = adminCheck.data || superAdminCheck.data;
  const roleError = adminCheck.error || superAdminCheck.error;

  if (roleError) {
    logger.error(`[list-users][${requestId}] Role check error`, roleError as Error);
    return new Response(
      JSON.stringify({ error: 'Falha ao verificar permissoes de admin' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!hasAdminRole) {
    return new Response(
      JSON.stringify({ error: 'Acesso negado' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Resolve tenant context
  const url = new URL(req.url);
  const requestedTenantId = req.headers.get('x-tenant-id')?.trim() || url.searchParams.get('tenant_id')?.trim() || null;
  let targetTenantId: string | null = null;

  if (requestedTenantId) {
    if (superAdminCheck.data) {
      targetTenantId = requestedTenantId;
    } else {
      const { data: tenantMembership } = await supabase
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', userId)
        .eq('tenant_id', requestedTenantId)
        .limit(1)
        .maybeSingle();

      if (!tenantMembership?.tenant_id) {
        return new Response(
          JSON.stringify({ error: 'Acesso negado ao tenant selecionado' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
      targetTenantId = tenantMembership.tenant_id;
    }
  } else {
    // Fallback for legacy clients
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    targetTenantId = userRole?.tenant_id || null;
  }

  if (!targetTenantId) {
    return new Response(
      JSON.stringify({ error: 'Tenant nao encontrado' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[list-users][${requestId}] Using tenant: ${targetTenantId}`);

  // Get all users in the tenant
  const { data: tenantUsers } = await supabase
    .from('user_roles')
    .select('user_id, role, created_at')
    .eq('tenant_id', targetTenantId);

  if (!tenantUsers) {
    return { users: [] };
  }

  // Get tenant info
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('id', targetTenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, full_name')
    .in('user_id', tenantUsers.map(u => u.user_id));

  // Get auth users
  const { data: authUsers } = await supabase.auth.admin.listUsers();

  const tenantUserIds = tenantUsers.map(u => u.user_id);
  const filteredAuthUsers = authUsers.users.filter(au => tenantUserIds.includes(au.id));

  // Combine all data
  const users = tenantUsers.map(tu => {
    const profile = profiles?.find(p => p.user_id === tu.user_id);
    const authUser = filteredAuthUsers.find(au => au.id === tu.user_id);
    const isBanned = authUser && (authUser as Record<string, unknown>).banned_until &&
      new Date((authUser as Record<string, unknown>).banned_until) > new Date();

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

  return { users };
}, {
  methods: ['GET', 'POST'],
  skipTenantValidation: true,
});
