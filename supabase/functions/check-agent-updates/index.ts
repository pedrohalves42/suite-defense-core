import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { normalizeVersion } from '../_shared/hexagonal/update-decision-service.ts';
import { logger } from '../_shared/logger.ts';

/**
 * Edge Function para agentes verificarem updates disponiveis
 * Autenticacao: X-Agent-Token + HMAC
 * Retorna versao latest baseada no platform do agente
 * 
 * Integrado com Hexagonal Architecture:
 * - Usa normalizeVersion para comparação consistente de versões
 * - Compara versão do agente com latest antes de retornar has_update
 */

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  logger.info(`[${requestId}] Check agent updates request received`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      logger.error(`[${requestId}] Missing environment variables`);
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
      logger.warn(`[${requestId}] Missing X-Agent-Token header`);
      return new Response(
        JSON.stringify({ error: 'Missing agent token', requestId }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 2. Buscar agent e validar token via hash (P0 security fix)
    const tokenHash = await hashToken(agentToken);
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select(`
        agent_id,
        agents (
          agent_name,
          tenant_id,
          hmac_secret,
          os_type,
          agent_version
        )
      `)
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData || !tokenData.agents) {
      logger.warn(`[${requestId}] Invalid or inactive agent token`);
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
      logger.warn(`[${requestId}] HMAC validation failed:`, {
        errorCode: hmacResult.errorCode,
        errorMessage: hmacResult.errorMessage
      });
      
      // Log security event
      await supabase.from('security_logs').insert({
        tenant_id: agent.tenant_id,
        event_type: 'hmac_validation_failed',
        severity: 'high',
        source_ip: req.headers.get('x-forwarded-for') || 'unknown',
        details: {
          agent_name: agent.agent_name,
          error_code: hmacResult.errorCode,
          error_message: hmacResult.errorMessage,
          endpoint: 'check-agent-updates'
        }
      });

      return new Response(
        JSON.stringify({ 
          error: 'unauthorized',
          code: hmacResult.errorCode,
          message: hmacResult.errorMessage,
          transient: hmacResult.transient,
          requestId 
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    logger.info(`[${requestId}] Agent authenticated: ${agent.agent_name}`);

    // 4. Determinar platform do agente
    const platform = (agent.os_type?.toLowerCase() || 'windows');
    logger.info(`[${requestId}] Platform: ${platform}`);

    // 5. Buscar versao latest da tabela agent_releases (consistente com serve-agent-update)
    const { data: latestRelease, error: releaseError } = await supabase
      .from('agent_releases')
      .select('version, platform, sha256, release_notes, created_at')
      .eq('platform', platform)
      .eq('channel', 'stable')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (releaseError || !latestRelease) {
      logger.info(`[${requestId}] No updates available for platform ${platform}`);
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

    // 6. Comparar versão via normalizeVersion (hexagonal)
    const currentNorm = normalizeVersion(agent.agent_version);
    const latestNorm = normalizeVersion(latestRelease.version);
    const hasUpdate = currentNorm !== latestNorm;

    logger.info(`[${requestId}] Version comparison: current=${currentNorm} latest=${latestNorm} hasUpdate=${hasUpdate}`);

    // 7. Retornar informacoes da versao
    return new Response(
      JSON.stringify({
        has_update: hasUpdate,
        current_version: agent.agent_version,
        latest_version: latestRelease.version,
        version: latestRelease.version,
        platform: latestRelease.platform,
        sha256: latestRelease.sha256,
        release_notes: hasUpdate ? latestRelease.release_notes : null,
        requestId
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    logger.error(`[${requestId}] Unexpected error:`, error);
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
