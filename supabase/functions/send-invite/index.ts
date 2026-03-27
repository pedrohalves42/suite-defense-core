/**
 * Send Invite - Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { getTenantIdForUser } from '../_shared/tenant.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { handleValidationError } from '../_shared/error-handler.ts';
import { EmailSchema } from '../_shared/validation.ts';
import { Resend } from 'https://esm.sh/resend@4.0.0';

const InviteSchema = z.object({
  email: EmailSchema,
  role: z.enum(['admin', 'operator', 'viewer'], {
    errorMap: () => ({ message: 'Role invalida' })
  }),
});

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

serveTenant(async (req, ctx) => {
  const { supabase, userId, requestId, body } = ctx;

  // Verify admin role
  const { data: hasAdminRole, error: roleError } = await supabase.rpc('has_role', {
    _user_id: userId, _role: 'admin'
  });

  if (roleError) {
    logger.error(`[send-invite][${requestId}] Role check error`, roleError as Error);
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

  // Get user's tenant
  const tenantId = await getTenantIdForUser(supabase, userId!);
  if (!tenantId) {
    return new Response(
      JSON.stringify({ error: 'Tenant nao encontrado' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check user quota
  const { data: maxUsersFeature } = await supabase
    .from('tenant_features')
    .select('quota_limit')
    .eq('tenant_id', tenantId)
    .eq('feature_key', 'max_users')
    .maybeSingle();

  const maxUsers = maxUsersFeature?.quota_limit || 5;

  const { count: currentUsersCount } = await supabase
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (currentUsersCount && currentUsersCount >= maxUsers) {
    return new Response(
      JSON.stringify({ error: `Limite de usuarios atingido. Seu plano permite no maximo ${maxUsers} usuarios.` }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate input
  const validation = InviteSchema.safeParse(body);
  if (!validation.success) {
    return handleValidationError(validation.error, requestId);
  }

  const { email, role } = validation.data;

  // Check if user already exists
  const { data: existingUser } = await supabase.auth.admin.listUsers();
  const userExists = existingUser.users.some(u => u.email === email);

  if (userExists) {
    return new Response(
      JSON.stringify({ error: 'Usuario ja cadastrado' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Generate unique token and create invite
  const inviteToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data: invite, error: inviteError } = await supabase
    .from('invites')
    .insert({
      email,
      role,
      token: inviteToken,
      tenant_id: tenantId,
      invited_by: userId,
      expires_at: expiresAt.toISOString(),
      status: 'pending',
    })
    .select()
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inviteError) throw inviteError;

  // Send email
  const inviteLink = `${Deno.env.get('SITE_URL') || 'https://cybershield.com.br'}/accept-invite?token=${inviteToken}`;

  const { data: tenantData } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .maybeSingle();

  const tenantName = tenantData?.name || 'CyberShield';

  try {
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'CyberShield <onboarding@resend.dev>';

    await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: `Convite para ${tenantName} - CyberShield`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #0066ff 0%, #0052cc 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🛡️ CyberShield</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Proteção Digital Inteligente</p>
          </div>
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px;">
            <h2 style="color: #333; margin-top: 0;">Você foi convidado!</h2>
            <p>Olá,</p>
            <p>Você foi convidado para fazer parte da equipe <strong>${tenantName}</strong> como <strong style="color: #0066ff;">${role === 'admin' ? 'Administrador' : role === 'operator' ? 'Operador' : 'Visualizador'}</strong>.</p>
            <p>O CyberShield é uma plataforma de segurança digital que protege seus computadores contra vírus, malwares e outras ameaças.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteLink}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #0066ff 0%, #0052cc 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(0,102,255,0.3);">Aceitar Convite e Criar Conta</a>
            </div>
            <p style="color: #666; font-size: 14px;"><strong>⏰ Importante:</strong> Este convite expira em 7 dias.</p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; margin-bottom: 0;">Se você não solicitou este convite, pode ignorar este email com segurança.</p>
          </div>
        </body>
        </html>
      `,
    });
  } catch (emailError) {
    logger.warn(`[send-invite][${requestId}] Failed to send email`);
  }

  await createAuditLog({
    supabase,
    userId: userId!,
    tenantId,
    action: 'invite_sent',
    resourceType: 'invite',
    resourceId: invite.id,
    details: { email, role, tenant_id: tenantId },
    request: req,
    success: true,
  });

  return new Response(
    JSON.stringify({ success: true, invite }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  );
}, {
  skipTenantValidation: true,
});
