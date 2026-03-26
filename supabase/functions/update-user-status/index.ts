/**
 * Update User Status (activate/deactivate)
 * Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const UpdateStatusSchema = z.object({
  user_id: z.string().uuid({ message: 'ID de usuario invalido' }),
  is_active: z.boolean({ message: 'Status deve ser booleano' }),
});

serveTenant(async (_req, ctx) => {
  const { supabase, userId: actorId, tenantId, requestId, body } = ctx;

  if (!actorId) {
    return new Response(
      JSON.stringify({ error: 'Authentication required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check admin role
  const { data: hasAdminRole, error: roleError } = await supabase.rpc('has_role', {
    _user_id: actorId,
    _role: 'admin',
  });

  if (roleError || !hasAdminRole) {
    return new Response(
      JSON.stringify({ error: 'Acesso negado' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate body
  const validation = UpdateStatusSchema.safeParse(body);
  if (!validation.success) {
    const errorMessage = validation.error.issues.map(i => i.message).join(', ');
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { user_id, is_active } = validation.data;

  // Prevent self-deactivation
  if (user_id === actorId) {
    return new Response(
      JSON.stringify({ error: 'Nao e possivel desativar sua propria conta' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify target user is in same tenant
  const { data: targetRole } = await supabase
    .from('user_roles')
    .select('tenant_id')
    .eq('user_id', user_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!targetRole) {
    return new Response(
      JSON.stringify({ error: 'Usuario nao encontrado no seu tenant' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Update user status using Admin API
  if (is_active) {
    const { error } = await supabase.auth.admin.updateUserById(user_id, {
      ban_duration: 'none',
    });
    if (error) throw error;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user_id, {
      ban_duration: '876000h',
    });
    if (error) throw error;
  }

  await createAuditLog({
    supabase,
    userId: actorId,
    tenantId,
    action: is_active ? 'user_activated' : 'user_deactivated',
    resourceType: 'user',
    resourceId: user_id,
    details: { target_user_id: user_id, is_active },
    request: ctx.req,
    success: true,
  });

  return { success: true };
}, {
  methods: ['POST'],
});
