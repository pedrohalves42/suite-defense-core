/**
 * Delete Invite - Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (_req, ctx) => {
  const { supabase, userId, requestId, body } = ctx;

  const inviteId = body?.inviteId;
  if (!inviteId) {
    return new Response(
      JSON.stringify({ error: 'Missing inviteId' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[delete-invite][${requestId}] User ${userId} attempting to delete invite ${inviteId}`);

  // Get invite details
  const { data: invite, error: inviteError } = await supabase
    .from('invites')
    .select('id, tenant_id, email, status')
    .eq('id', inviteId)
    .maybeSingle();

  if (inviteError || !invite) {
    return new Response(
      JSON.stringify({ error: 'Invite not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify user has admin role in the invite's tenant
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', invite.tenant_id)
    .maybeSingle();

  const { data: superAdminRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
    .maybeSingle();

  const isAdmin = userRole?.role === 'admin' || superAdminRole?.role === 'super_admin';

  if (!isAdmin) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized - admin access required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Delete the invite
  const { error: deleteError } = await supabase
    .from('invites')
    .delete()
    .eq('id', inviteId);

  if (deleteError) {
    logger.error(`[delete-invite][${requestId}] Delete failed`, deleteError as Error);
    return new Response(
      JSON.stringify({ error: 'Failed to delete invite' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[delete-invite][${requestId}] Successfully deleted invite ${inviteId}`);

  // Audit log
  try {
    await supabase.from('audit_logs').insert({
      tenant_id: invite.tenant_id,
      user_id: userId,
      action: 'invite.deleted',
      resource_type: 'invite',
      resource_id: inviteId,
      details: { email: invite.email, status: invite.status },
    });
  } catch (auditErr) {
    logger.warn(`[delete-invite][${requestId}] Audit log failed`);
  }

  return { success: true };
}, {
  skipTenantValidation: true,
});
