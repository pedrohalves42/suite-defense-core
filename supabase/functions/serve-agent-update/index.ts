import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    logger.info('[serve-agent-update] Requisição recebida', { requestId });

    // Verificar HMAC
    const agentToken = req.headers.get('X-Agent-Token');
    const signature = req.headers.get('X-HMAC-Signature');
    const timestamp = req.headers.get('X-Timestamp');
    const nonce = req.headers.get('X-Nonce');

    if (!agentToken || !signature || !timestamp || !nonce) {
      logger.warn('[serve-agent-update] Headers HMAC ausentes', { requestId });
      return new Response(
        JSON.stringify({ error: 'Missing HMAC headers' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar agente e HMAC secret
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, agent_name, hmac_secret, agent_version, os_type')
      .eq('id', agentToken)
      .single();

    if (agentError || !agent) {
      logger.error('[serve-agent-update] Agente não encontrado', { 
        requestId, 
        agentToken,
        error: agentError 
      });
      return new Response(
        JSON.stringify({ error: 'Agent not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar HMAC
    const hmacResult = await verifyHmacSignature(
      supabase,
      req,
      agent.agent_name,
      agent.hmac_secret
    );

    if (!hmacResult.valid) {
      logger.warn('[serve-agent-update] HMAC inválido', { 
        requestId, 
        agentName: agent.agent_name,
        errorCode: hmacResult.errorCode
      });
      return new Response(
        JSON.stringify({ error: 'Invalid HMAC signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[serve-agent-update] HMAC válido', { 
      requestId, 
      agentName: agent.agent_name,
      currentVersion: agent.agent_version 
    });

    // Determinar plataforma
    const platform = agent.os_type?.toLowerCase() || 'windows';

    // Buscar última release ativa
    const { data: release, error: releaseError } = await supabase
      .from('agent_releases')
      .select('version, script_content, sha256, release_notes, created_at')
      .eq('platform', platform)
      .eq('channel', 'stable')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (releaseError || !release) {
      logger.warn('[serve-agent-update] Nenhuma release disponível', { 
        requestId, 
        platform,
        error: releaseError 
      });
      return new Response(
        JSON.stringify({ 
          error: 'No update available',
          current_version: agent.agent_version 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se já está na última versão
    if (release.version === agent.agent_version) {
      logger.info('[serve-agent-update] Agente já está atualizado', { 
        requestId, 
        agentName: agent.agent_name,
        version: agent.agent_version 
      });
      return new Response(
        JSON.stringify({ 
          message: 'Already up to date',
          current_version: agent.agent_version 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[serve-agent-update] Retornando atualização', { 
      requestId, 
      agentName: agent.agent_name,
      fromVersion: agent.agent_version,
      toVersion: release.version 
    });

    return new Response(
      JSON.stringify({
        version: release.version,
        script_content: release.script_content,
        sha256: release.sha256,
        release_notes: release.release_notes,
        platform: platform,
        current_version: agent.agent_version
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const err = error as Error;
    logger.error('[serve-agent-update] Erro interno', { 
      requestId, 
      error: err.message,
      stack: err.stack 
    });

    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: err.message,
        requestId 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
