/**
 * validate-invite Edge Function
 * SECURITY: Validates invite tokens WITHOUT exposing sensitive data to frontend
 * Part of Phase 3 RLS Hardening - ADR-023
 * 
 * Returns only safe fields: email, role, expires_at, tenant_name
 * Token validation happens server-side only
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException, createErrorResponse, ErrorCode, corsHeaders } from '../_shared/error-handler.ts';

interface SafeInviteData {
  email: string;
  role: string;
  expires_at: string;
  tenant_name: string | null;
  is_valid: boolean;
  error_code?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // No auth required - this is called before user creates account
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { token } = await req.json();

    if (!token || typeof token !== 'string' || token.length < 10) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Token invalido', 400, requestId);
    }

    // Validate token server-side using service role
    // First get the invite
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('invites')
      .select('email, role, expires_at, status, tenant_id')
      .eq('token', token)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inviteError) {
      console.error(`[${requestId}] Database error:`, inviteError);
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Erro ao validar convite', 500, requestId);
    }

    if (!invite) {
      const response: SafeInviteData = {
        email: '',
        role: '',
        expires_at: '',
        tenant_name: null,
        is_valid: false,
        error_code: 'NOT_FOUND'
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get tenant name separately
    let tenantName: string | null = null;
    if (invite.tenant_id) {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('name')
        .eq('id', invite.tenant_id)
        .maybeSingle();
      tenantName = tenant?.name || null;
    }

    // Check expiration
    const isExpired = new Date(invite.expires_at) < new Date();
    
    const response: SafeInviteData = {
      email: invite.email,
      role: invite.role,
      expires_at: invite.expires_at,
      tenant_name: tenantName,
      is_valid: !isExpired,
      error_code: isExpired ? 'EXPIRED' : undefined
    };

    console.log(`[${requestId}] Invite validated: ${invite.email}, valid: ${response.is_valid}`);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return handleException(error, requestId, 'validate-invite');
  }
});
