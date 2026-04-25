/**
 * Admin/Auth handlers — Phase 2F
 * Inlined: accept-invite, delete-invite, send-invite
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import type { HandlerContext } from './admin.ts';

type Supabase = any;

// ── accept-invite ──────────────────────────────────────────────────────
export async function handleAcceptInvite(
  supabase: Supabase, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const userId = ctx?.userId;
  if (!userId) return { __status: 401, error: 'Authentication required' };

  const token = payload.token as string;
  if (!token || typeof token !== 'string' || token.length > 512) {
    return { __status: 400, error: 'Invalid token' };
  }

  const { data: invite, error: inviteError } = await supabase
    .from('invites').select('id, token, email, role, tenant_id, invited_by, status, expires_at, created_at')
    .eq('token', token).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (inviteError || !invite) return { __status: 404, error: 'Convite nao encontrado ou expirado' };
  if (new Date(invite.expires_at) < new Date()) return { __status: 400, error: 'Convite expirado' };

  const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);
  if (authUser?.email !== invite.email) return { __status: 403, error: 'Email nao corresponde ao convite' };

  const { error: roleError } = await supabase.from('user_roles').insert({
    user_id: userId, role: invite.role, tenant_id: invite.tenant_id, created_by: invite.invited_by,
  });
  if (roleError) throw roleError;

  const { error: updateError } = await supabase.from('invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', invite.id);
  if (updateError) throw updateError;

  try {
    await supabase.from('audit_logs').insert({
      tenant_id: invite.tenant_id, user_id: userId, action: 'invite_accepted',
      resource_type: 'invite', resource_id: invite.id,
      details: { email: invite.email, role: invite.role, tenant_id: invite.tenant_id }, success: true,
    });
  } catch (_) { /* non-critical */ }

  return { success: true };
}

// ── delete-invite ──────────────────────────────────────────────────────
export async function handleDeleteInvite(
  supabase: Supabase, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const userId = ctx?.userId;
  if (!userId) return { __status: 401, error: 'Authentication required' };

  const inviteId = payload.inviteId as string;
  if (!inviteId) return { __status: 400, error: 'inviteId is required' };

  const { data: invite, error: inviteError } = await supabase
    .from('invites').select('id, tenant_id, email, status').eq('id', inviteId).maybeSingle();
  if (inviteError || !invite) return { __status: 404, error: 'Invite not found' };

  const { data: userRole } = await supabase.from('user_roles').select('role')
    .eq('user_id', userId).eq('tenant_id', invite.tenant_id).maybeSingle();
  const { data: superAdminRole } = await supabase.from('user_roles').select('role')
    .eq('user_id', userId).eq('role', 'super_admin').maybeSingle();

  if (userRole?.role !== 'admin' && superAdminRole?.role !== 'super_admin') {
    return { __status: 403, error: 'Unauthorized - admin access required' };
  }

  const { error: deleteError } = await supabase.from('invites').delete().eq('id', inviteId);
  if (deleteError) return { __status: 500, error: 'Failed to delete invite' };

  try {
    await supabase.from('audit_logs').insert({
      tenant_id: invite.tenant_id, user_id: userId, action: 'invite.deleted',
      resource_type: 'invite', resource_id: inviteId,
      details: { email: invite.email, status: invite.status },
    });
  } catch (_) { /* non-critical */ }

  return { success: true };
}

// ── send-invite ────────────────────────────────────────────────────────
export async function handleSendInvite(
  supabase: Supabase, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const userId = ctx?.userId;
  if (!userId) return { __status: 401, error: 'Authentication required' };

  const email = (payload.email as string || '').trim().toLowerCase();
  const role = payload.role as string;
  if (!email || !role || !['admin', 'operator', 'viewer'].includes(role)) {
    return { __status: 400, error: 'Email e role validos sao obrigatorios' };
  }

  // Verify admin role
  const { data: hasAdminRole } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
  if (!hasAdminRole) return { __status: 403, error: 'Acesso negado' };

  // Get tenant
  const { data: userRole } = await supabase.from('user_roles').select('tenant_id')
    .eq('user_id', userId).limit(1).maybeSingle();
  const tenantId = ctx?.tenantId || userRole?.tenant_id;
  if (!tenantId) return { __status: 400, error: 'Tenant nao encontrado' };

  // Check quota
  const { data: maxUsersFeature } = await supabase.from('tenant_features').select('quota_limit')
    .eq('tenant_id', tenantId).eq('feature_key', 'max_users').maybeSingle();
  const maxUsers = maxUsersFeature?.quota_limit || 5;
  const { count: currentUsersCount } = await supabase.from('user_roles')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  if (currentUsersCount && currentUsersCount >= maxUsers) {
    return { __status: 403, error: `Limite de usuarios atingido (${maxUsers})` };
  }

  // Check existing user
  const { data: existingUser } = await supabase.auth.admin.listUsers();
  if (existingUser.users.some(u => u.email === email)) {
    return { __status: 409, error: 'Usuario ja cadastrado' };
  }

  // Create invite
  const inviteToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invite, error: inviteError } = await supabase.from('invites').insert({
    email, role, token: inviteToken, tenant_id: tenantId, invited_by: userId,
    expires_at: expiresAt, status: 'pending',
  }).select().order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (inviteError) throw inviteError;

  // Send email via Resend (best-effort)
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey) {
      const { Resend } = await import('https://esm.sh/resend@4.0.0');
      const resend = new Resend(resendApiKey);
      const siteUrl = Deno.env.get('SITE_URL') || 'https://cybershield.com.br';
      const inviteLink = `${siteUrl}/accept-invite?token=${inviteToken}`;
      const { data: tenantData } = await supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle();
      const tenantName = tenantData?.name || 'CyberShield';
      const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'CyberShield <onboarding@resend.dev>';
      const roleLabel = role === 'admin' ? 'Administrador' : role === 'operator' ? 'Operador' : 'Visualizador';

      await resend.emails.send({
        from: fromEmail, to: [email],
        subject: `Convite para ${tenantName} - CyberShield`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="background:linear-gradient(135deg,#0066ff,#0052cc);padding:30px;border-radius:12px 12px 0 0;text-align:center"><h1 style="color:#fff;margin:0">CyberShield</h1></div><div style="background:#f8f9fa;padding:30px;border-radius:0 0 12px 12px"><h2>Voce foi convidado!</h2><p>Voce foi convidado para <strong>${tenantName}</strong> como <strong>${roleLabel}</strong>.</p><div style="text-align:center;margin:30px 0"><a href="${inviteLink}" style="padding:16px 32px;background:#0066ff;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Aceitar Convite</a></div><p style="color:#666;font-size:14px">Este convite expira em 7 dias.</p></div></div>`,
      });
    }
  } catch (emailError) {
    logger.warn(`[send-invite][${requestId}] Failed to send email`);
  }

  try {
    await supabase.from('audit_logs').insert({
      tenant_id: tenantId, user_id: userId, action: 'invite_sent',
      resource_type: 'invite', resource_id: invite.id,
      details: { email, role, tenant_id: tenantId }, success: true,
    });
  } catch (_) { /* non-critical */ }

  return { __status: 201, success: true, invite };
}
