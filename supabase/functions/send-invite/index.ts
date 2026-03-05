import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { handleException, handleValidationError, createErrorResponse, ErrorCode, corsHeaders } from '../_shared/error-handler.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { EmailSchema } from '../_shared/validation.ts';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { getTenantIdForUser } from '../_shared/tenant.ts';

// Validation schema for invite
const InviteSchema = z.object({
  email: EmailSchema,
  role: z.enum(['admin', 'operator', 'viewer'], { 
    errorMap: () => ({ message: 'Role invalida' }) 
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
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Nao autorizado', 401, requestId);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { 
      global: { headers: { Authorization: authHeader } } 
    });
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Nao autorizado', 401, requestId);
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
        'Falha ao verificar permissoes de admin', 
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
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Tenant nao encontrado', 400, requestId);
    }

    // [OK]  P0 FIX: Usar tenant_features como fonte de verdade unica (consistente com frontend)
    const { data: maxUsersFeature } = await supabaseAdmin
      .from('tenant_features')
      .select('quota_limit')
      .eq('tenant_id', tenantId)
      .eq('feature_key', 'max_users')
      .maybeSingle();

    // Fallback para plano Free se nao encontrar feature
    const maxUsers = maxUsersFeature?.quota_limit || 5;

    // Contar usuarios atuais do tenant
    const { count: currentUsersCount } = await supabaseAdmin
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (currentUsersCount && currentUsersCount >= maxUsers) {
      return createErrorResponse(
        ErrorCode.FORBIDDEN, 
        `Limite de usuarios atingido. Seu plano permite no maximo ${maxUsers} usuarios.`, 
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
      return createErrorResponse(ErrorCode.CONFLICT, 'Usuario ja cadastrado', 409, requestId);
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
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inviteError) throw inviteError;

    // Send email
    const inviteLink = `${Deno.env.get('SITE_URL') || 'https://cybershield.com.br'}/accept-invite?token=${inviteToken}`;
    
    // Get tenant name for email
    const { data: tenantData } = await supabaseAdmin
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .maybeSingle();
    
    const tenantName = tenantData?.name || 'CyberShield';

    try {
      // Use verified domain email or fallback to Resend test domain
      const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'CyberShield <onboarding@resend.dev>';
      
      await resend.emails.send({
        from: fromEmail,
        to: [email],
        subject: `Convite para ${tenantName} - CyberShield`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
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
                <a href="${inviteLink}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #0066ff 0%, #0052cc 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(0,102,255,0.3);">
                  Aceitar Convite e Criar Conta
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px;">
                <strong>⏰ Importante:</strong> Este convite expira em 7 dias.
              </p>
              
              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
              
              <p style="color: #999; font-size: 12px; margin-bottom: 0;">
                Se você não solicitou este convite, pode ignorar este email com segurança.
              </p>
            </div>
          </body>
          </html>
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
