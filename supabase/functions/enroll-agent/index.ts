import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException, handleValidationError, createErrorResponse, ErrorCode, corsHeaders } from '../_shared/error-handler.ts';
import { EnrollAgentSchema } from '../_shared/validation.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limiting por IP (prevenir brute force)
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const rateLimitResult = await checkRateLimit(supabase, clientIp, 'enroll-agent', {
      maxRequests: 5,
      windowMinutes: 60,
      blockMinutes: 60,
    });

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Muitas tentativas de enrollment. Tente novamente mais tarde.',
          resetAt: rateLimitResult.resetAt 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate input
    const rawData = await req.json();
    const validatedData = EnrollAgentSchema.parse(rawData);
    const { enrollmentKey, agentName } = validatedData;

    // Validate enrollment key
    const { data: keyData, error: keyError } = await supabase
      .from('enrollment_keys')
      .select('*')
      .eq('key', enrollmentKey)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      await createAuditLog({
        supabase,
        tenantId: 'unknown',
        action: 'agent_enrollment_failed',
        resourceType: 'agent',
        resourceId: agentName,
        details: { reason: 'invalid_key' },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ error: 'Chave de enrollment inválida' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check expiration
    if (new Date(keyData.expires_at) < new Date()) {
      await createAuditLog({
        supabase,
        tenantId: keyData.tenant_id,
        action: 'agent_enrollment_failed',
        resourceType: 'agent',
        resourceId: agentName,
        details: { reason: 'expired_key', key_id: keyData.id },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ error: 'Chave de enrollment expirada' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check usage limit
    if (keyData.max_uses !== null && keyData.current_uses >= keyData.max_uses) {
      await createAuditLog({
        supabase,
        tenantId: keyData.tenant_id,
        action: 'agent_enrollment_failed',
        resourceType: 'agent',
        resourceId: agentName,
        details: { reason: 'max_uses_exceeded', key_id: keyData.id },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ error: 'Limite de uso da chave atingido' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate agent token and HMAC secret
    const agentToken = crypto.randomUUID();
    const hmacSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Check if agent already exists
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('agent_name', agentName)
      .single();

    let agentId: string;

    if (existingAgent) {
      // Update existing agent
      await supabase
        .from('agents')
        .update({ hmac_secret: hmacSecret })
        .eq('agent_name', agentName);
      
      agentId = existingAgent.id;

      // Deactivate old tokens
      await supabase
        .from('agent_tokens')
        .update({ is_active: false })
        .eq('agent_id', agentId);
    } else {
      // Insert new agent
      const { data: newAgent } = await supabase.from('agents').insert({
        tenant_id: keyData.tenant_id,
        agent_name: agentName,
        hmac_secret: hmacSecret,
        status: 'active',
      }).select('id').single();
      
      agentId = newAgent!.id;
    }

    // Create token in dedicated table
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await supabase.from('agent_tokens').insert({
      agent_id: agentId,
      token: agentToken,
      expires_at: expiresAt.toISOString(),
    });

    // Increment key usage
    await supabase
      .from('enrollment_keys')
      .update({ current_uses: keyData.current_uses + 1 })
      .eq('id', keyData.id);

    // Create audit log
    await createAuditLog({
      supabase,
      tenantId: keyData.tenant_id,
      action: 'agent_enrolled',
      resourceType: 'agent',
      resourceId: agentName,
      details: {
        tenant_id: keyData.tenant_id,
        enrollment_key_id: keyData.id,
        is_new: !existingAgent,
      },
      request: req,
      success: true,
    });

    console.log('Agent enrolled:', { agentName, tenant_id: keyData.tenant_id, requestId });

    return new Response(
      JSON.stringify({
        agentToken,
        hmacSecret,
        expiresAt: expiresAt.toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleException(error, requestId, 'enroll-agent');
  }
});
