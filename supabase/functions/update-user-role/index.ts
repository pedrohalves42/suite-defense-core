/**
 * Update User Role
 * CRITICAL SECURITY: Blocks super_admin assignment via this endpoint
 * Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const UpdateRoleSchema = z.object({
  userId: z.string().uuid('Invalid user ID format').optional(),
  user_id: z.string().uuid('Invalid user ID format').optional(),
  roles: z.array(z.enum(['admin', 'operator', 'viewer']))
    .min(1, 'At least one role is required')
    .max(3, 'Maximum of 3 roles')
    .refine((roles) => new Set(roles).size === roles.length, {
      message: 'Roles must be unique',
    })
    .refine((roles) => !roles.includes('super_admin' as never), {
      message: 'Cannot assign super_admin role through this endpoint.',
    }),
}).refine(data => data.userId || data.user_id, {
  message: 'Either userId or user_id is required',
});

serveTenant(async (_req, ctx) => {
  const { supabase, userId: actorId, tenantId, requestId, body } = ctx;

  if (!actorId) {
    return new Response(
      JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Authentication required', requestId } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check admin role
  const { data: actorRole, error: roleError } = await supabase
    .from('user_roles')
    .select('role, tenant_id')
    .eq('user_id', actorId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (roleError || !actorRole || !['admin', 'super_admin'].includes(actorRole.role)) {
    logger.warn(`[${requestId}] User ${actorId} is not admin, role: ${actorRole?.role}`);
    await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: actorId,
      action: 'update_role',
      resource_type: 'user',
      success: false,
      details: { reason: 'Insufficient permissions', actor_role: actorRole?.role },
      ip_address: ctx.req.headers.get('x-forwarded-for'),
      user_agent: ctx.req.headers.get('user-agent'),
    });
    return new Response(
      JSON.stringify({ error: { code: 'NOT_ALLOWED', message: 'Only admins can update user roles', requestId } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Rate limiting
  const rateLimitResult = await checkRateLimit(supabase, `tenant:${tenantId}`, 'update-user-role', {
    maxRequests: 10,
    windowMinutes: 1,
  });
  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded', requestId } }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate body
  const validationResult = UpdateRoleSchema.safeParse(body);
  if (!validationResult.success) {
    const errorMessage = validationResult.error.issues.map(i => i.message).join(', ');
    return new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: errorMessage, requestId } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { userId: userIdCamel, user_id: userIdSnake, roles: newRoles } = validationResult.data;
  const targetUserId = userIdCamel || userIdSnake!;

  // Prevent self-change
  if (targetUserId === actorId) {
    return new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Cannot change your own role', requestId } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check target user in same tenant
  const { data: targetUserRole } = await supabase
    .from('user_roles')
    .select('role, tenant_id')
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (!targetUserRole) {
    return new Response(
      JSON.stringify({ error: { code: 'NOT_FOUND', message: 'User not found', requestId } }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (targetUserRole.tenant_id !== tenantId) {
    return new Response(
      JSON.stringify({ error: { code: 'NOT_ALLOWED', message: 'Cannot update users from different tenants', requestId } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const newRole = newRoles[0];

  // Idempotency
  if (newRoles.length === 1 && newRoles[0] === targetUserRole.role) {
    return { updated: false, message: 'Role unchanged' };
  }

  // Prevent removing last admin
  if (targetUserRole.role === 'admin' && newRole !== 'admin') {
    const { count } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('tenant_id', tenantId);

    if (count === 1) {
      return new Response(
        JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Cannot demote the last admin', requestId } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc('update_user_role_rpc', {
    p_user_id: targetUserId,
    p_new_role: newRole,
  });

  if (rpcError) {
    logger.error('RPC error', rpcError);
    return new Response(
      JSON.stringify({ error: { code: 'INTERNAL', message: 'Failed to update user role', requestId } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[${requestId}] Role updated successfully`, { targetUserId, newRole });

  return { updated: true, message: 'User role updated successfully', data: rpcResult };
}, {
  methods: ['POST'],
});
