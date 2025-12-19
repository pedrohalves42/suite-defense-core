import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { hashToken } from '../_shared/token-hash.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * confirm-force-update
 * 
 * Endpoint chamado pelo agente após aplicar um force update com sucesso.
 * Limpa os campos de force_update e registra o timestamp.
 * 
 * Body:
 * - new_version: string (versão instalada)
 * - old_version: string (versão anterior)
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    logger.info('[confirm-force-update] Requisição recebida', { requestId });

    // Verificar HMAC
    const agentToken = req.headers.get('X-Agent-Token');
    const signature = req.headers.get('X-HMAC-Signature');
    const timestamp = req.headers.get('X-Timestamp');
    const nonce = req.headers.get('X-Nonce');

    if (!agentToken || !signature || !timestamp || !nonce) {
      logger.warn('[confirm-force-update] Headers HMAC ausentes', { requestId });
      return new Response(
        JSON.stringify({ error: 'Missing HMAC headers' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar token e agente via hash
    const tokenHash = await hashToken(agentToken);
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('agent_id, is_active, agents!inner(id, agent_name, hmac_secret, agent_version, force_update_version)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData) {
      logger.error('[confirm-force-update] Token inválido', { requestId, error: tokenError });
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agent = (tokenData as any).agents as { 
      id: string; 
      agent_name: string; 
      hmac_secret: string;
      agent_version: string | null;
      force_update_version: string | null;
    };

    // Verificar HMAC
    const hmacResult = await verifyHmacSignature(
      supabase,
      req,
      agent.agent_name,
      agent.hmac_secret
    );

    if (!hmacResult.valid) {
      logger.warn('[confirm-force-update] HMAC inválido', { requestId, errorCode: hmacResult.errorCode });
      return new Response(
        JSON.stringify({ error: 'Invalid HMAC signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parsear body
    const body = await req.json();
    const { new_version, old_version } = body;

    if (!new_version) {
      return new Response(
        JSON.stringify({ error: 'new_version is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[confirm-force-update] Confirmando force update', { 
      requestId, 
      agentName: agent.agent_name,
      oldVersion: old_version || agent.agent_version,
      newVersion: new_version,
      wasForceUpdate: !!agent.force_update_version
    });

    // Atualizar agente: limpar force_update e atualizar versão
    const { error: updateError } = await supabase
      .from('agents')
      .update({
        agent_version: new_version,
        force_update_version: null,
        force_update_reason: null,
        force_update_at: null,
        last_forced_update_applied: new Date().toISOString()
      })
      .eq('id', agent.id);

    if (updateError) {
      logger.error('[confirm-force-update] Erro ao atualizar agente', { requestId, error: updateError });
      return new Response(
        JSON.stringify({ error: 'Failed to update agent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Registrar evento de evidence
    const { error: evidenceError } = await supabase
      .from('agent_evidence_logs')
      .insert({
        agent_id: agent.id,
        agent_name: agent.agent_name,
        agent_version: new_version,
        tenant_id: (await supabase
          .from('agents')
          .select('tenant_id')
          .eq('id', agent.id)
          .single()).data?.tenant_id,
        event_type: 'force_update_applied',
        event_data: {
          old_version: old_version || agent.agent_version,
          new_version: new_version,
          was_force_update: !!agent.force_update_version,
          applied_at: new Date().toISOString()
        },
        evidence_hash: crypto.randomUUID(),
        severity: 'info'
      });

    if (evidenceError) {
      logger.warn('[confirm-force-update] Falha ao registrar evidence (não crítico)', { requestId, error: evidenceError });
    }

    logger.info('[confirm-force-update] Force update confirmado com sucesso', { 
      requestId, 
      agentName: agent.agent_name,
      newVersion: new_version
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Force update confirmed',
        agent_name: agent.agent_name,
        new_version: new_version,
        old_version: old_version || agent.agent_version
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const err = error as Error;
    logger.error('[confirm-force-update] Erro interno', { requestId, error: err.message });

    return new Response(
      JSON.stringify({ error: 'Internal server error', message: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
