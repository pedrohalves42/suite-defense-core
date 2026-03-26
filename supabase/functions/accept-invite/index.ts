/**
 * Accept Invite
 * Accepts a pending invite and creates user role
 * Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { createAuditLog } from '../_shared/audit.ts';

serveTenant(async (_req, ctx) => {
  const { supabase, userId, requestId, body } = ctx;

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'Authentication required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { token: inviteToken } = body;

  if (!inviteToken) {
    return new Response(
      JSON.stringify({ error: 'Token invalido' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get invite
  const { data: invite, error: inviteError } = await supabase
    .from('invites')
    .select('*')
    .eq('token', inviteToken)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inviteError || !invite) {
    return new Response(
      JSON.stringify({ error: 'Convite nao encontrado ou expirado' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (new Date(invite.expires_at) < new Date()) {
    return new Response(
      JSON.stringify({ error: 'Convite expirado' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get user email to verify match
  const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);
  if (authUser?.email !== invite.email) {
    return new Response(
      JSON.stringify({ error: 'Email nao corresponde ao convite' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create user role
  const { error: roleError } = await supabase
    .from('user_roles')
    .insert({
      user_id: userId,
      role: invite.role,
      tenant_id: invite.tenant_id,
      created_by: invite.invited_by,
    });

  if (roleError) throw roleError;

  // Mark invite as accepted
  const { error: updateError } = await supabase
    .from('invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  if (updateError) throw updateError;

  await createAuditLog({
    supabase,
    userId,
    tenantId: invite.tenant_id,
    action: 'invite_accepted',
    resourceType: 'invite',
    resourceId: invite.id,
    details: { email: invite.email, role: invite.role, tenant_id: invite.tenant_id },
    request: ctx.req,
    success: true,
  });

  return { success: true };
}, {
  skipTenantValidation: true,
  methods: ['POST'],
});
