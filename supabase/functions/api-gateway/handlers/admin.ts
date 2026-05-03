// @ts-nocheck
/**
 * Admin namespace inlined handlers (migrated from standalone functions)
 * 
 * These handlers receive service_role client + user context extracted from JWT.
 * The gateway decodes the JWT to provide userId/tenantId.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { createAuditLog } from '../../_shared/audit.ts';
import { getTenantIdForUser } from '../../_shared/tenant.ts';
import { checkRateLimit } from '../../_shared/rate-limit.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

type SB = any;

export interface HandlerContext {
  req: Request;
  userId?: string;
  tenantId?: string;
}

// ── get-admin-releases ──────────────────────────────────────────────────
export async function handleGetAdminReleases(supabase: SB, requestId: string, _payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) throw new Error('Authentication required');

  const { data: isSuperAdmin, error: roleError } = await supabase.rpc('has_role', { _user_id: userId, _role: 'super_admin' });
  if (roleError || !isSuperAdmin) {
    return { __status: 403, error: 'Forbidden - super_admin required' };
  }

  const { data: releases, error } = await supabase
    .from('agent_releases')
    .select('id, version, platform, channel, is_active, sha256, release_notes, created_at, created_by, signature_base64, signed_at, signed_by, script_content')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return { releases: releases || [] };
}

// ── update-user-status ──────────────────────────────────────────────────
const UpdateStatusSchema = z.object({
  user_id: z.string().uuid(),
  is_active: z.boolean(),
});

export async function handleUpdateUserStatus(supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const actorId = ctx?.userId;
  const tenantId = ctx?.tenantId;
  if (!actorId) return { __status: 401, error: 'Authentication required' };

  const { data: hasAdminRole, error: roleError } = await supabase.rpc('has_role', { _user_id: actorId, _role: 'admin', _tenant_id: tenantId });
  if (roleError || !hasAdminRole) return { __status: 403, error: 'Acesso negado' };

  const validation = UpdateStatusSchema.safeParse(payload);
  if (!validation.success) return { __status: 400, error: validation.error.issues.map(i => i.message).join(', ') };

  const { user_id, is_active } = validation.data;
  if (user_id === actorId) return { __status: 400, error: 'Nao e possivel desativar sua propria conta' };

  if (tenantId) {
    const { data: targetRole } = await supabase.from('user_roles').select('tenant_id').eq('user_id', user_id).eq('tenant_id', tenantId).maybeSingle();
    if (!targetRole) return { __status: 403, error: 'Usuario nao encontrado no seu tenant' };
  }

  const banConfig = is_active ? { ban_duration: 'none' } : { ban_duration: '876000h' };
  const { error } = await supabase.auth.admin.updateUserById(user_id, banConfig);
  if (error) throw error;

  if (tenantId) {
    await createAuditLog({ supabase, userId: actorId, tenantId, action: is_active ? 'user_activated' : 'user_deactivated', resourceType: 'user', resourceId: user_id, details: { target_user_id: user_id, is_active }, request: ctx?.req, success: true });
  }

  return { success: true };
}

// ── update-member-role ──────────────────────────────────────────────────
const UpdateMemberRoleSchema = z.object({
  user_role_id: z.string().uuid(),
  new_role: z.enum(['admin', 'operator', 'viewer']),
});

export async function handleUpdateMemberRole(supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { __status: 401, error: 'Authentication required' };

  const { data: hasAdminRole, error: roleError } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin', _tenant_id: ctx?.tenantId });
  if (roleError || !hasAdminRole) return { __status: 403, error: 'Acesso negado' };

  const validation = UpdateMemberRoleSchema.safeParse(payload);
  if (!validation.success) return { __status: 400, error: validation.error.flatten().fieldErrors };

  const { user_role_id, new_role } = validation.data;

  const adminTenantId = await getTenantIdForUser(supabase, userId);
  if (!adminTenantId) return { __status: 400, error: 'Tenant nao encontrado' };

  const { data: targetRole, error: targetError } = await supabase
    .from('user_roles').select('user_id, tenant_id, role').eq('id', user_role_id).maybeSingle();
  if (targetError || !targetRole) return { __status: 404, error: 'Membro nao encontrado' };
  if (targetRole.tenant_id !== adminTenantId) return { __status: 403, error: 'Membro nao pertence ao seu tenant' };
  if (targetRole.user_id === userId) return { __status: 403, error: 'Voce nao pode alterar seu proprio role' };

  const { error: updateError } = await supabase.from('user_roles').update({ role: new_role }).eq('id', user_role_id);
  if (updateError) throw updateError;

  await createAuditLog({ supabase, userId, tenantId: adminTenantId, action: 'member_role_updated', resourceType: 'user_role', resourceId: user_role_id, details: { target_user_id: targetRole.user_id, old_role: targetRole.role, new_role }, request: ctx?.req, success: true });

  return { success: true };
}

// ── remove-member ───────────────────────────────────────────────────────
const RemoveMemberSchema = z.object({ member_id: z.string().uuid() });

export async function handleRemoveMember(supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { __status: 401, error: 'Authentication required' };

  const { data: callerRole } = await supabase.from('user_roles').select('role').eq('user_id', userId).in('role', ['admin', 'super_admin']).limit(1).maybeSingle();
  if (!callerRole) return { __status: 403, error: 'Apenas admins podem remover membros' };

  const validation = RemoveMemberSchema.safeParse(payload);
  if (!validation.success) return { __status: 400, error: validation.error.flatten().fieldErrors };

  const { member_id } = validation.data;

  const adminTenantId = await getTenantIdForUser(supabase, userId);
  if (!adminTenantId) return { __status: 400, error: 'Tenant nao encontrado' };

  const { data: targetRole, error: targetError } = await supabase.from('user_roles').select('id, user_id, tenant_id, role').eq('id', member_id).maybeSingle();
  if (targetError || !targetRole) return { __status: 404, error: 'Membro nao encontrado' };
  if (targetRole.tenant_id !== adminTenantId) return { __status: 403, error: 'Membro nao pertence ao seu tenant' };
  if (targetRole.user_id === userId) return { __status: 403, error: 'Voce nao pode remover a si mesmo' };

  if (targetRole.role === 'admin') {
    const { count: adminCount } = await supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('tenant_id', adminTenantId).eq('role', 'admin');
    if ((adminCount ?? 0) <= 1) return { __status: 400, error: 'Nao e possivel remover o ultimo admin do tenant' };
  }

  const { data: memberProfile } = await supabase.from('profiles').select('full_name').eq('user_id', targetRole.user_id).maybeSingle();

  const { error: deleteError } = await supabase.from('user_roles').delete().eq('id', member_id);
  if (deleteError) throw deleteError;

  await createAuditLog({ supabase, userId, tenantId: adminTenantId, action: 'member_removed', resourceType: 'user_role', resourceId: member_id, details: { removed_user_id: targetRole.user_id, removed_user_name: memberProfile?.full_name || 'Unknown', removed_role: targetRole.role }, request: ctx?.req, success: true });

  return { success: true, message: 'Membro removido com sucesso' };
}

// ── list-users ──────────────────────────────────────────────────────────
export async function handleListUsers(supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { __status: 401, error: 'Nao autorizado' };

  const [adminCheck, superAdminCheck] = await Promise.all([
    supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
    supabase.rpc('has_role', { _user_id: userId, _role: 'super_admin' }),
  ]);
  if (adminCheck.error || superAdminCheck.error) return { __status: 500, error: 'Falha ao verificar permissoes' };
  if (!adminCheck.data && !superAdminCheck.data) return { __status: 403, error: 'Acesso negado' };

  const requestedTenantId = (payload.tenant_id as string) || ctx?.tenantId;
  let targetTenantId: string | null = null;

  if (requestedTenantId) {
    if (superAdminCheck.data) {
      targetTenantId = requestedTenantId;
    } else {
      const { data: membership } = await supabase.from('user_roles').select('tenant_id').eq('user_id', userId).eq('tenant_id', requestedTenantId).limit(1).maybeSingle();
      if (!membership?.tenant_id) return { __status: 403, error: 'Acesso negado ao tenant selecionado' };
      targetTenantId = membership.tenant_id;
    }
  } else {
    const { data: userRole } = await supabase.from('user_roles').select('tenant_id').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    targetTenantId = userRole?.tenant_id || null;
  }

  if (!targetTenantId) return { __status: 400, error: 'Tenant nao encontrado' };

  const { data: tenantUsers } = await supabase.from('user_roles').select('user_id, role, created_at').eq('tenant_id', targetTenantId);
  if (!tenantUsers) return { users: [] };

  const { data: tenant } = await supabase.from('tenants').select('id, name').eq('id', targetTenantId).limit(1).maybeSingle();
  const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', tenantUsers.map(u => u.user_id));
  // P3 FIX: Do not list all users if we can avoid it. 
  // For standard admin, we only need profiles that belong to the tenant.
  const { data: authUsers } = await supabase.auth.admin.listUsers(); // Fallback for small fleets

  const tenantUserIds = tenantUsers.map(u => u.user_id);
  const filteredAuthUsers = authUsers?.users.filter(au => tenantUserIds.includes(au.id)) || [];

  const users = tenantUsers.map(tu => {
    const profile = profiles?.find(p => p.user_id === tu.user_id);
    const authUser = filteredAuthUsers.find(au => au.id === tu.user_id);
    const isBanned = authUser && (authUser as Record<string, unknown>).banned_until && new Date((authUser as Record<string, unknown>).banned_until as string) > new Date();
    return { user_id: tu.user_id, email: authUser?.email || '', full_name: profile?.full_name || '', role: tu.role, tenant_id: targetTenantId, tenant_name: tenant?.name || '', created_at: tu.created_at, is_active: !isBanned };
  });

  return { users };
}

// ── list-all-users-admin ────────────────────────────────────────────────
export async function handleListAllUsersAdmin(supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { __status: 401, error: 'Authentication required' };

  const { data: isSuperAdmin, error: roleError } = await supabase.rpc('is_super_admin', { _user_id: userId });
  if (roleError || !isSuperAdmin) return { __status: 403, error: 'Forbidden - super_admin required' };

  const limit = Math.min(Number(payload.limit) || 1000, 1000);
  const offset = Number(payload.offset) || 0;

  const { data: allUserRoles, error: rolesError, count: totalRoles } = await supabase
    .from('user_roles').select('user_id, role, tenant_id, created_at', { count: 'exact' })
    .range(offset, offset + limit - 1).order('created_at', { ascending: false });
  if (rolesError) throw rolesError;
  if (!allUserRoles?.length) return { users: [], pagination: { total: 0, limit, offset, hasMore: false } };

  const { data: allTenants } = await supabase.from('tenants').select('id, name, slug').limit(1000);
  const userIds = allUserRoles.map((ur: Record<string, unknown>) => ur.user_id);
  const { data: allProfiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds);
  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: Math.min(limit, 1000), page: Math.floor(offset / 1000) + 1 });

  const users = allUserRoles.map((ur: Record<string, unknown>) => {
    const profile = allProfiles?.find((p: Record<string, unknown>) => p.user_id === ur.user_id);
    const authUser = authData?.users.find((au: Record<string, unknown>) => au.id === ur.user_id);
    const tenant = allTenants?.find((t: Record<string, unknown>) => t.id === ur.tenant_id);
    return { user_id: ur.user_id, email: authUser?.email || '', full_name: profile?.full_name || '', role: ur.role, tenant_id: ur.tenant_id, tenant_name: tenant?.name || '', created_at: ur.created_at };
  });

  return { users, pagination: { total: totalRoles || 0, limit, offset, hasMore: (totalRoles || 0) > offset + limit } };
}

// ── set-active-tenant ───────────────────────────────────────────────────
const SetTenantSchema = z.object({ tenant_id: z.string().uuid() });

function extractClientIp(req?: Request): string {
  if (!req) return '127.0.0.1';
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || req.headers.get('cf-connecting-ip')?.trim()
    || '127.0.0.1';
}

export async function handleSetActiveTenant(supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { __status: 401, error: 'Unauthorized' };

  const parsed = SetTenantSchema.safeParse(payload);
  if (!parsed.success) return { __status: 400, error: 'Validation failed', details: parsed.error.flatten().fieldErrors };

  const { tenant_id } = parsed.data;
  const clientIp = extractClientIp(ctx?.req);

  const { data: ipAllowed, error: ipCheckError } = await supabase.rpc('check_super_admin_ip_access', { _user_id: userId, _ip_address: clientIp });
  if (!ipCheckError && ipAllowed === false) {
    try { await supabase.from('audit_logs').insert({ user_id: userId, action: 'super_admin_ip_blocked', target_type: 'security', details: { ip_address: clientIp, user_agent: ctx?.req?.headers.get('user-agent'), timestamp: new Date().toISOString() } }); } catch {}
    return { __status: 403, error: 'IP not authorized for super admin access', code: 'IP_BLOCKED' };
  }

  const { data: switchResult, error: switchError } = await supabase.rpc('switch_tenant_atomic', { p_user_id: userId, p_new_tenant_id: tenant_id });
  if (switchError) return { __status: 500, error: 'Failed to verify tenant access' };
  if (!switchResult?.success) {
    if (switchResult?.error === 'CONCURRENT_MODIFICATION') return { __status: 409, error: switchResult.message, retry: true };
    return { __status: 403, error: switchResult?.message || 'Tenant access denied' };
  }

  // Get existing app_metadata via auth header
  const authHeader = ctx?.req?.headers.get('Authorization');
  let existingAppMetadata: Record<string, unknown> = {};
  if (authHeader) {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const { createClient: cc } = await import('https://esm.sh/@supabase/supabase-js@2.74.0');
    const userClient = cc(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    existingAppMetadata = user?.app_metadata || {};
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { ...existingAppMetadata, active_tenant_id: switchResult.active_tenant_id, tenants: switchResult.tenants, is_super_admin: switchResult.is_super_admin },
  });
  if (updateError) return { __status: 500, error: 'Failed to update session' };

  const previousTenantId = existingAppMetadata.active_tenant_id;
  if (previousTenantId !== tenant_id) {
    try { await supabase.from('audit_logs').insert({ tenant_id, user_id: userId, action: 'tenant_switched', target_type: 'tenant', target_id: tenant_id, details: { previous_tenant_id: previousTenantId, new_tenant_id: tenant_id, timestamp: new Date().toISOString(), atomic_switch: true } }); } catch {}
  }

  return { success: true, active_tenant_id: switchResult.active_tenant_id, tenants: switchResult.tenants, is_super_admin: switchResult.is_super_admin, tenant_count: switchResult.tenant_count };
}

// ── update-user-role ────────────────────────────────────────────────────
const UpdateRoleSchema = z.object({
  userId: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  roles: z.array(z.enum(['admin', 'operator', 'viewer'])).min(1).max(3)
    .refine(roles => new Set(roles).size === roles.length, { message: 'Roles must be unique' }),
}).refine(data => data.userId || data.user_id, { message: 'Either userId or user_id is required' });

export async function handleUpdateUserRole(supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const actorId = ctx?.userId;
  const tenantId = ctx?.tenantId;
  if (!actorId || !tenantId) return { __status: 401, error: { code: 'UNAUTHORIZED', message: 'Authentication required', requestId } };

  const { data: actorRole, error: roleError } = await supabase.from('user_roles').select('role, tenant_id').eq('user_id', actorId).eq('tenant_id', tenantId).maybeSingle();
  if (roleError || !actorRole || !['admin', 'super_admin'].includes(actorRole.role)) {
    await supabase.from('audit_logs').insert({ tenant_id: tenantId, user_id: actorId, action: 'update_role', resource_type: 'user', success: false, details: { reason: 'Insufficient permissions', actor_role: actorRole?.role } });
    return { __status: 403, error: { code: 'NOT_ALLOWED', message: 'Only admins can update user roles', requestId } };
  }

  const rateLimitResult = await checkRateLimit(supabase, `tenant:${tenantId}`, 'update-user-role', { maxRequests: 10, windowMinutes: 1 });
  if (!rateLimitResult.allowed) return { __status: 429, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded', requestId } };

  const validation = UpdateRoleSchema.safeParse(payload);
  if (!validation.success) return { __status: 400, error: { code: 'BAD_REQUEST', message: validation.error.issues.map(i => i.message).join(', '), requestId } };

  const { userId: userIdCamel, user_id: userIdSnake, roles: newRoles } = validation.data;
  const targetUserId = userIdCamel || userIdSnake!;
  if (targetUserId === actorId) return { __status: 400, error: { code: 'BAD_REQUEST', message: 'Cannot change your own role', requestId } };

  const { data: targetUserRole } = await supabase.from('user_roles').select('role, tenant_id').eq('user_id', targetUserId).maybeSingle();
  if (!targetUserRole) return { __status: 404, error: { code: 'NOT_FOUND', message: 'User not found', requestId } };
  if (targetUserRole.tenant_id !== tenantId) return { __status: 403, error: { code: 'NOT_ALLOWED', message: 'Cannot update users from different tenants', requestId } };

  const newRole = newRoles[0];
  if (newRoles.length === 1 && newRoles[0] === targetUserRole.role) return { updated: false, message: 'Role unchanged' };

  if (targetUserRole.role === 'admin' && newRole !== 'admin') {
    const { count } = await supabase.from('user_roles').select('*', { count: 'exact', head: true }).eq('role', 'admin').eq('tenant_id', tenantId);
    if (count === 1) return { __status: 400, error: { code: 'BAD_REQUEST', message: 'Cannot demote the last admin', requestId } };
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc('update_user_role_rpc', { p_user_id: targetUserId, p_new_role: newRole });
  if (rpcError) return { __status: 500, error: { code: 'INTERNAL', message: 'Failed to update user role', requestId } };

  return { updated: true, message: 'User role updated successfully', data: rpcResult };
}

// ── admin-create-user ───────────────────────────────────────────────────
const CreateUserSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  password: z.string().min(8).max(72).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
  full_name: z.string().min(1).max(255),
  role: z.enum(['admin', 'operator', 'viewer']),
  tenant_id: z.string().uuid(),
});

export async function handleAdminCreateUser(supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) {
  const userId = ctx?.userId;
  if (!userId) return { __status: 401, success: false, error: 'Authorization required' };

  const parsed = CreateUserSchema.safeParse(payload);
  if (!parsed.success) return { __status: 400, success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors };

  const { username, password, full_name, role, tenant_id } = parsed.data;

  const { data: callerRole, error: roleError } = await supabase.from('user_roles').select('role').eq('user_id', userId).eq('tenant_id', tenant_id).in('role', ['admin', 'super_admin']).maybeSingle();
  if (roleError || !callerRole) return { __status: 403, success: false, error: 'Forbidden: Admin role required in this tenant' };

  const { data: existingUser } = await supabase.from('profiles').select('id').eq('username', username.toLowerCase()).maybeSingle();
  if (existingUser) return { __status: 409, success: false, error: 'Username already exists' };

  const { count: userCount } = await supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant_id);
  const { data: tenantFeatures } = await supabase.from('tenant_features').select('quota_limit').eq('tenant_id', tenant_id).eq('feature_code', 'max_users').maybeSingle();
  const maxUsers = tenantFeatures?.quota_limit ?? 5;
  if ((userCount ?? 0) >= maxUsers) return { __status: 403, success: false, error: `Limite de usuarios atingido (${userCount}/${maxUsers}). Faca upgrade do plano.` };

  const internalEmail = `${username.toLowerCase()}@local.internal`;
  const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
    email: internalEmail, password, email_confirm: true,
    user_metadata: { username: username.toLowerCase(), full_name, must_change_password: true, created_by: 'admin', created_by_user_id: userId },
  });
  if (createError || !authUser.user) return { __status: 500, success: false, error: createError?.message || 'Failed to create user' };

  const newUserId = authUser.user.id;

  const { error: profileError } = await supabase.from('profiles').update({ full_name, username: username.toLowerCase(), updated_at: new Date().toISOString() }).eq('user_id', newUserId);
  if (profileError) { await supabase.auth.admin.deleteUser(newUserId); return { __status: 500, success: false, error: 'Failed to update user profile' }; }

  await supabase.from('user_roles').delete().eq('user_id', newUserId);
  const { error: roleInsertError } = await supabase.from('user_roles').insert({ user_id: newUserId, tenant_id, role });
  if (roleInsertError) { await supabase.auth.admin.deleteUser(newUserId); return { __status: 500, success: false, error: 'Failed to assign user role' }; }

  await supabase.from('decision_events').insert({ tenant_id, rule_code: 'ACCESS_GOVERNANCE', decision_source: 'human', decision_type: 'user_management', action: 'admin_user_created', justification: `Usuario ${username} (${role}) criado manualmente por admin`, human_reviewed: true, created_at: new Date().toISOString(), evidence: { username, role, created_by: userId, method: 'username_password', adr_reference: 'ADR-008' } });
  await supabase.from('audit_logs').insert({ tenant_id, user_id: userId, action: 'create_user', resource_type: 'user', resource_id: newUserId, success: true, details: { username, role, method: 'admin_create_user', must_change_password: true } });

  return { __status: 201, success: true, user: { id: newUserId, username: username.toLowerCase(), full_name, role }, message: 'User created. They must change password on first login.' };
}

// ── get-rate-limit-stats ────────────────────────────────────────────────
const RateLimitStatsSchema = z.object({ hours_back: z.coerce.number().int().min(1).max(720).default(24) }).passthrough();

export async function handleGetRateLimitStats(supabase: SB, requestId: string, payload: Record<string, unknown>, _ctx?: HandlerContext) {
  const parsed = RateLimitStatsSchema.safeParse(payload);
  if (!parsed.success) return { __status: 400, error: 'Invalid input', issues: parsed.error.flatten().fieldErrors };
  const hoursBack = parsed.data.hours_back;
  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const { data: rateLimits, error } = await supabase.from('rate_limits').select('id, identifier, endpoint, request_count, window_start, blocked_until').gte('window_start', cutoffTime).order('window_start', { ascending: false });
  if (error) throw error;

  const endpointStats = new Map<string, { endpoint: string; total_requests: number; unique_identifiers: Set<string>; blocked_count: number }>();
  const currentlyBlocked: Array<{ identifier: string; endpoint: string; request_count: number; blocked_until: string }> = [];
  const now = new Date();

  for (const record of (rateLimits || [])) {
    const endpoint = record.endpoint || 'unknown';
    if (!endpointStats.has(endpoint)) endpointStats.set(endpoint, { endpoint, total_requests: 0, unique_identifiers: new Set(), blocked_count: 0 });
    const stats = endpointStats.get(endpoint)!;
    stats.total_requests += record.request_count || 0;
    stats.unique_identifiers.add(record.identifier);
    if (record.blocked_until && new Date(record.blocked_until) > now) {
      stats.blocked_count++;
      currentlyBlocked.push({ identifier: record.identifier, endpoint: record.endpoint, request_count: record.request_count, blocked_until: record.blocked_until });
    }
  }

  const summary = Array.from(endpointStats.values()).map(s => ({ endpoint: s.endpoint, total_requests: s.total_requests, unique_identifiers: s.unique_identifiers.size, blocked_count: s.blocked_count, avg_requests_per_identifier: s.unique_identifiers.size > 0 ? Math.round(s.total_requests / s.unique_identifiers.size) : 0 })).sort((a, b) => b.total_requests - a.total_requests);

  const hourlyBreakdown: Record<string, { hour: string; requests: number }[]> = {};
  for (const record of (rateLimits || [])) {
    const hour = new Date(record.window_start).toISOString().slice(0, 13) + ':00:00Z';
    const endpoint = record.endpoint || 'unknown';
    if (!hourlyBreakdown[endpoint]) hourlyBreakdown[endpoint] = [];
    const existing = hourlyBreakdown[endpoint].find(h => h.hour === hour);
    if (existing) existing.requests += record.request_count || 0;
    else hourlyBreakdown[endpoint].push({ hour, requests: record.request_count || 0 });
  }

  const totals = { total_requests: summary.reduce((a, s) => a + s.total_requests, 0), total_blocked: summary.reduce((a, s) => a + s.blocked_count, 0), unique_endpoints: summary.length, currently_blocked: currentlyBlocked.length };
  return { success: true, requestId, data: { summary, top_blocked: currentlyBlocked.slice(0, 10), hourly_breakdown: hourlyBreakdown, totals, period_hours: hoursBack } };
}