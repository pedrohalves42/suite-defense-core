/**
 * List All Users Admin
 * Returns all users across tenants for super_admin management
 * Migrated to serveTenant middleware with skipTenantValidation
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (req, ctx) => {
  const { supabase, userId, requestId } = ctx;

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'Authentication required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify super_admin role via RPC
  const { data: isSuperAdmin, error: roleError } = await supabase.rpc('is_super_admin', {
    _user_id: userId,
  });

  if (roleError || !isSuperAdmin) {
    logger.warn(`Access denied for user ${userId}`, { requestId });
    return new Response(
      JSON.stringify({ error: 'Forbidden - super_admin required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Parse pagination parameters
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '1000'), 1000);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  logger.info(`Fetching users with pagination: limit=${limit}, offset=${offset}`, { requestId, userId });

  // Get user_roles with pagination
  const { data: allUserRoles, error: rolesError, count: totalRoles } = await supabase
    .from('user_roles')
    .select('user_id, role, tenant_id, created_at', { count: 'exact' })
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false });

  if (rolesError) {
    logger.error('Error fetching user_roles', rolesError);
    throw rolesError;
  }

  if (!allUserRoles || allUserRoles.length === 0) {
    logger.info('No users found', { requestId });
    return {
      users: [],
      pagination: { total: 0, limit, offset, hasMore: false },
    };
  }

  logger.info(`Found ${allUserRoles.length} user roles (total: ${totalRoles})`, { requestId });

  // Get tenants
  const { data: allTenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .limit(1000);

  if (tenantsError) {
    logger.error('Error fetching tenants', tenantsError);
    throw tenantsError;
  }

  // Get profiles for this page's users only
  const userIds = allUserRoles.map((ur: Record<string, unknown>) => ur.user_id);
  const { data: allProfiles, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, full_name')
    .in('user_id', userIds);

  if (profilesError) {
    logger.error('Error fetching profiles', profilesError);
    throw profilesError;
  }

  // Get auth users for this page
  const { data: authData, error: authUsersError } = await supabase.auth.admin.listUsers({
    perPage: Math.min(limit, 1000),
    page: Math.floor(offset / 1000) + 1,
  });

  if (authUsersError) {
    logger.error('Error fetching auth users', authUsersError);
    throw authUsersError;
  }

  const authUsers = authData.users;
  logger.info(`Found ${authUsers.length} auth users`, { requestId });

  // Combine all data
  const users = allUserRoles.map((ur: Record<string, unknown>) => {
    const profile = allProfiles?.find((p: Record<string, unknown>) => p.user_id === ur.user_id);
    const authUser = authUsers.find((au: Record<string, unknown>) => au.id === ur.user_id);
    const tenant = allTenants?.find((t: Record<string, unknown>) => t.id === ur.tenant_id);

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

  const hasMore = (totalRoles || 0) > offset + limit;

  logger.info(`Returning ${users.length} users`, { requestId });

  return {
    users,
    pagination: {
      total: totalRoles || 0,
      limit,
      offset,
      hasMore,
    },
  };
}, {
  methods: ['GET', 'POST'],
  skipTenantValidation: true,
});
