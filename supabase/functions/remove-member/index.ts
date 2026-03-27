/**
 * Remove Member - Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { getTenantIdForUser } from '../_shared/tenant.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { handleValidationError } from '../_shared/error-handler.ts';

const RemoveMemberSchema = z.object({
  member_id: z.string().uuid(),
});

serveTenant(async (req, ctx) => {
  const { supabase, userId, requestId, body } = ctx;

  // Verify admin/super_admin role
  const { data: callerRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['admin', 'super_admin'])
    .limit(1)
    .maybeSingle();

  if (!callerRole) {
    return new Response(
      JSON.stringify({ error: 'Apenas admins podem remover membros' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate input
  const validation = RemoveMemberSchema.safeParse(body);
  if (!validation.success) {
    return handleValidationError(validation.error, requestId);
  }

  const { member_id } = validation.data;

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
    .select('id, user_id, tenant_id, role')
    .eq('id', member_id)
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

  // Cannot remove self
  if (targetRole.user_id === userId) {
    return new Response(
      JSON.stringify({ error: 'Voce nao pode remover a si mesmo' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Cannot remove last admin
  if (targetRole.role === 'admin') {
    const { count: adminCount } = await supabase
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', adminTenantId)
      .eq('role', 'admin');

    if ((adminCount ?? 0) <= 1) {
      return new Response(
        JSON.stringify({ error: 'Nao e possivel remover o ultimo admin do tenant' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Get member info for audit
  const { data: memberProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('user_id', targetRole.user_id)
    .maybeSingle();

  // Remove member
  const { error: deleteError } = await supabase
    .from('user_roles')
    .delete()
    .eq('id', member_id);

  if (deleteError) throw deleteError;

  // Audit log
  await createAuditLog({
    supabase,
    userId: userId!,
    tenantId: adminTenantId,
    action: 'member_removed',
    resourceType: 'user_role',
    resourceId: member_id,
    details: {
      removed_user_id: targetRole.user_id,
      removed_user_name: memberProfile?.full_name || 'Unknown',
      removed_role: targetRole.role,
    },
    request: req,
    success: true,
  });

  logger.info(`[remove-member][${requestId}] Member ${member_id} removed by ${userId}`);

  return { success: true, message: 'Membro removido com sucesso' };
}, {
  methods: ['POST'],
  skipTenantValidation: true,
});
