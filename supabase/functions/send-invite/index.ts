import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, handleError } from '../_shared/errors.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { Resend } from 'npm:resend@4.0.0';

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
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { 
      global: { headers: { Authorization: authHeader } } 
    });
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check if user is admin
    const { data: hasAdminRole } = await supabaseAdmin.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'admin' 
    });

    if (!hasAdminRole) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), { 
        status: 403, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Get user's tenant
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (!userRole?.tenant_id) {
      return new Response(JSON.stringify({ error: 'Tenant não encontrado' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { email, role } = await req.json();

    if (!email || !role) {
      return new Response(JSON.stringify({ error: 'Email e role são obrigatórios' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = existingUser.users.some(u => u.email === email);

    if (userExists) {
      return new Response(JSON.stringify({ error: 'Usuário já cadastrado' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
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
        tenant_id: userRole.tenant_id,
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
      action: 'invite_sent',
      resourceType: 'invite',
      resourceId: invite.id,
      details: { email, role, tenant_id: userRole.tenant_id },
      request: req,
      success: true,
    });

    return new Response(JSON.stringify({ success: true, invite }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in send-invite:', error);
    return handleError(error, requestId);
  }
});
