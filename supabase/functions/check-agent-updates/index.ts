import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';

/**
 * Edge Function para agentes verificarem updates disponíveis
 * Autenticação: X-Agent-Token + HMAC
 * Retorna versão latest baseada no platform do agente
 */

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Check agent updates request received`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error(`[${requestId}] Missing environment variables`);
      return new Response(
        JSON.stringify({ error: 'Server configuration error', requestId }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Validar X-Agent-Token
    const agentToken = req.headers.get('X-Agent-Token');
    if (!agentToken) {
      console.warn(`[${requestId}] Missing X-Agent-Token header`);
      return new Response(
        JSON.stringify({ error: 'Missing agent token', requestId }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 2. Buscar agent e validar token
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select(`
        agent_id,
        agents (
          agent_name,
          tenant_id,
          hmac_secret,
          os_type
        )
      `)
      .eq('token', agentToken)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData || !tokenData.agents) {
      console.warn(`[${requestId}] Invalid or inactive agent token`);
      return new Response(
        JSON.stringify({ error: 'Invalid agent token', requestId }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const agent = tokenData.agents as any;

    // 3. Verificar HMAC
    const hmacResult = await verifyHmacSignature(
      supabase,
      req,
      agent.agent_name,
      agent.hmac_secret
    );

    if (!hmacResult.valid) {
      console.warn(`[${requestId}] HMAC validation failed: ${hmacResult.error}`);
      
      // Log security event
      await supabase.from('security_logs').insert({
        tenant_id: agent.tenant_id,
        event_type: 'hmac_validation_failed',
        severity: 'high',
        source_ip: req.headers.get('x-forwarded-for') || 'unknown',
        details: {
          agent_name: agent.agent_name,
          error: hmacResult.error,
          endpoint: 'check-agent-updates'
        }
      });

      return new Response(
        JSON.stringify({ error: hmacResult.error, requestId }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`[${requestId}] Agent authenticated: ${agent.agent_name}`);

    // 4. Determinar platform do agente
    const platform = (agent.os_type?.toLowerCase() || 'windows');
    console.log(`[${requestId}] Platform: ${platform}`);

    // 5. Buscar versão latest para o platform
    const { data: latestVersion, error: versionError } = await supabase
      .from('agent_versions')
      .select('*')
      .eq('platform', platform)
      .eq('is_latest', true)
      .single();

    if (versionError || !latestVersion) {
      console.log(`[${requestId}] No updates available for platform ${platform}`);
      return new Response(
        JSON.stringify({
          has_update: false,
          message: 'No updates available',
          requestId
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`[${requestId}] Latest version found: ${latestVersion.version}`);

    // 6. Retornar informações da versão
    return new Response(
      JSON.stringify({
        has_update: true,
        version: latestVersion.version,
        platform: latestVersion.platform,
        sha256: latestVersion.sha256,
        size_bytes: latestVersion.size_bytes,
        download_url: latestVersion.download_url,
        release_notes: latestVersion.release_notes,
        requestId
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error(`[${requestId}] Unexpected error:`, error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
