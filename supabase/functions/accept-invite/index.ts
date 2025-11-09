import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException, createErrorResponse, ErrorCode, corsHeaders } from '../_shared/error-handler.ts';
import { createAuditLog } from '../_shared/audit.ts';

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

    const { token: inviteToken } = await req.json();

    if (!inviteToken) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Token inválido', 400, requestId);
    }

    // Get invite
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('invites')
      .select('*')
      .eq('token', inviteToken)
      .eq('status', 'pending')
      .single();

    if (inviteError || !invite) {
      return createErrorResponse(ErrorCode.NOT_FOUND, 'Convite não encontrado ou expirado', 404, requestId);
    }

    // Check expiration
    if (new Date(invite.expires_at) < new Date()) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Convite expirado', 400, requestId);
    }

    // Check if email matches
    if (user.email !== invite.email) {
      return createErrorResponse(ErrorCode.FORBIDDEN, 'Email não corresponde ao convite', 403, requestId);
    }

    // Create user role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: user.id,
        role: invite.role,
        tenant_id: invite.tenant_id,
        created_by: invite.invited_by,
      });

    if (roleError) throw roleError;

    // Mark invite as accepted
    const { error: updateError } = await supabaseAdmin
      .from('invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    if (updateError) throw updateError;

    await createAuditLog({
      supabase: supabaseAdmin,
      userId: user.id,
      tenantId: invite.tenant_id,
      action: 'invite_accepted',
      resourceType: 'invite',
      resourceId: invite.id,
      details: { email: invite.email, role: invite.role, tenant_id: invite.tenant_id },
      request: req,
      success: true,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return handleException(error, requestId, 'accept-invite');
  }
});
