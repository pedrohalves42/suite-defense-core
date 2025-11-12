import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import { handleException, handleValidationError, createErrorResponse, ErrorCode, corsHeaders } from '../_shared/error-handler.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { EmailSchema } from '../_shared/validation.ts';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { getTenantIdForUser } from '../_shared/tenant.ts';

// Validation schema for invite
const InviteSchema = z.object({
  email: EmailSchema,
  role: z.enum(['admin', 'operator', 'viewer'], { 
    errorMap: () => ({ message: 'Role inválida' }) 
  }),
});

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Não autorizado', 401, requestId);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { 
      global: { headers: { Authorization: authHeader } } 
    });
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Não autorizado', 401, requestId);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log(`[${requestId}] Checking admin role for user:`, user.id);
    
    // Check if user is admin
    const { data: hasAdminRole, error: roleError } = await supabaseAdmin.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'admin' 
    });

    console.log(`[${requestId}] Admin check result:`, { hasAdminRole, roleError });

    if (roleError) {
      console.error(`[${requestId}] Role check error:`, roleError);
      return createErrorResponse(
        ErrorCode.INTERNAL_ERROR, 
        'Falha ao verificar permissões de admin', 
        500, 
        requestId
      );
    }

    if (!hasAdminRole) {
      console.warn(`[${requestId}] User ${user.id} is not admin`);
      return createErrorResponse(ErrorCode.FORBIDDEN, 'Acesso negado', 403, requestId);
    }

    // Get user's tenant using helper (handles multiple roles)
    const tenantId = await getTenantIdForUser(supabaseAdmin, user.id);

    if (!tenantId) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Tenant não encontrado', 400, requestId);
    }

    // Verificar limite de usuários do plano
    const { data: subscription } = await supabaseAdmin
      .from('tenant_subscriptions')
      .select(`
        subscription_plans (
          max_users
        )
      `)
      .eq('tenant_id', tenantId)
      .single();

    if (!subscription) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Plano não encontrado', 400, requestId);
    }

    // Contar usuários atuais do tenant
    const { count: currentUsersCount } = await supabaseAdmin
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    const maxUsers = (subscription.subscription_plans as any).max_users;

    if (currentUsersCount && currentUsersCount >= maxUsers) {
      return createErrorResponse(
        ErrorCode.FORBIDDEN, 
        `Limite de usuários atingido. Seu plano permite no máximo ${maxUsers} usuários.`, 
        403, 
        requestId
      );
    }

    const body = await req.json();

    // Validate input with Zod
    const validation = InviteSchema.safeParse(body);
    if (!validation.success) {
      return handleValidationError(validation.error, requestId);
    }

    const { email, role } = validation.data;

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = existingUser.users.some(u => u.email === email);

    if (userExists) {
      return createErrorResponse(ErrorCode.CONFLICT, 'Usuário já cadastrado', 409, requestId);
    }

    // Generate unique token
    const inviteToken = crypto.randomUUID();
    
    // Create invite
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('invites')
      .insert({
        email,
        role,
        token: inviteToken,
        tenant_id: tenantId,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      })
      .select()
      .single();

    if (inviteError) throw inviteError;

    // Send email
    const inviteLink = `${Deno.env.get('SITE_URL') || 'https://suite-defense-core.lovable.app'}/accept-invite?token=${inviteToken}`;

    try {
      await resend.emails.send({
        from: 'CyberShield <onboarding@resend.dev>',
        to: [email],
        subject: 'Você foi convidado para o CyberShield',
        html: `
          <h1>Bem-vindo ao CyberShield!</h1>
          <p>Você foi convidado para participar como <strong>${role}</strong>.</p>
          <p>Clique no link abaixo para aceitar o convite e criar sua conta:</p>
          <a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background: #0066ff; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Aceitar Convite
          </a>
          <p>Este convite expira em 7 dias.</p>
          <p>Se você não solicitou este convite, pode ignorar este email.</p>
        `,
      });
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Don't fail the invite creation if email fails
    }

    await createAuditLog({
      supabase: supabaseAdmin,
      userId: user.id,
      tenantId: tenantId,
      action: 'invite_sent',
      resourceType: 'invite',
      resourceId: invite.id,
      details: { email, role, tenant_id: tenantId },
      request: req,
      success: true,
    });

    return new Response(JSON.stringify({ success: true, invite }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return handleException(error, requestId, 'send-invite');
  }
});
