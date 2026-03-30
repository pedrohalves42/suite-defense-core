/**
 * Update Member Role - Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { getTenantIdForUser } from '../_shared/tenant.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { handleValidationError } from '../_shared/error-handler.ts';

const UpdateRoleSchema = z.object({
  user_role_id: z.string().uuid(),
  new_role: z.enum(['admin', 'operator', 'viewer']),
});

serveTenant(async (req, ctx) => {
  const { supabase, userId, requestId, body } = ctx;

  // Verify admin role
  const { data: hasAdminRole, error: roleError } = await supabase.rpc('has_role', {
    _user_id: userId, _role: 'admin'
  });

  if (roleError || !hasAdminRole) {
    return new Response(
      JSON.stringify({ error: 'Acesso negado' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate input
  const validation = UpdateRoleSchema.safeParse(body);
  if (!validation.success) {
    return handleValidationError(validation.error, requestId);
  }

  const { user_role_id, new_role } = validation.data;

  // Get admin's tenant
  const adminTenantId = await getTenantIdForUser(supabase, userId!);
  if (!adminTenantId) {
    return new Response(
      JSON.stringify({ error: 'Tenant nao encontrado' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get target role
  const { data: targetRole, error: targetError } = await supabase
    .from('user_roles')
    .select('user_id, tenant_id, role')
    .eq('id', user_role_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (targetError || !targetRole) {
    return new Response(
      JSON.stringify({ error: 'Membro nao encontrado' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify same tenant
  if (targetRole.tenant_id !== adminTenantId) {
    return new Response(
      JSON.stringify({ error: 'Membro nao pertence ao seu tenant' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Cannot change own role
  if (targetRole.user_id === userId) {
    return new Response(
      JSON.stringify({ error: 'Voce nao pode alterar seu proprio role' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Update role
  const { error: updateError } = await supabase
    .from('user_roles')
    .update({ role: new_role })
    .eq('id', user_role_id);

  if (updateError) throw updateError;

  await createAuditLog({
    supabase,
    userId: userId!,
    tenantId: adminTenantId,
    action: 'member_role_updated',
    resourceType: 'user_role',
    resourceId: user_role_id,
    details: {
      target_user_id: targetRole.user_id,
      old_role: targetRole.role,
      new_role,
    },
    request: req,
    success: true,
  });

  return { success: true };
}, {
  skipTenantValidation: true,
  rateLimit: { maxRequests: 10, windowMinutes: 1 },
});
