import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, handleError } from '../_shared/errors.ts';
import { EnrollAgentSchema } from '../_shared/validation.ts';
import { createAuditLog } from '../_shared/audit.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse and validate input
    const rawData = await req.json();
    const validatedData = EnrollAgentSchema.parse(rawData);
    const { tenantId, enrollmentKey, agentName } = validatedData;

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
        action: 'agent_enrollment_failed',
        resourceType: 'agent',
        resourceId: agentName,
        details: { reason: 'invalid_key', tenant_id: tenantId },
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

    // Generate agent token
    const agentToken = crypto.randomUUID();

    // Check if agent already exists
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('agent_name', agentName)
      .single();

    if (existingAgent) {
      // Update existing agent token
      await supabase
        .from('agents')
        .update({ agent_token: agentToken })
        .eq('agent_name', agentName);
    } else {
      // Insert new agent
      await supabase.from('agents').insert({
        tenant_id: tenantId,
        agent_name: agentName,
        agent_token: agentToken,
        status: 'active',
      });
    }

    // Increment key usage
    await supabase
      .from('enrollment_keys')
      .update({ current_uses: keyData.current_uses + 1 })
      .eq('id', keyData.id);

    // Create audit log
    await createAuditLog({
      supabase,
      action: 'agent_enrolled',
      resourceType: 'agent',
      resourceId: agentName,
      details: {
        tenant_id: tenantId,
        enrollment_key_id: keyData.id,
        is_new: !existingAgent,
      },
      request: req,
      success: true,
    });

    console.log('Agent enrolled:', { agentName, tenantId, requestId });

    return new Response(
      JSON.stringify({
        agentToken,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return new Response(
        JSON.stringify({
          error: 'Dados inválidos',
          details: JSON.parse(error.message),
          requestId,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    return handleError(error, requestId);
  }
});
