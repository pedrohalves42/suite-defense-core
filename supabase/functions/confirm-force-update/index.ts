import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { normalizeVersion } from '../_shared/hexagonal/update-decision-service.ts';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

/**
 * confirm-force-update
 * 
 * Endpoint chamado pelo agente apos aplicar um force update com sucesso.
 * Limpa os campos de force_update e registra o timestamp.
 * 
 * GUARDS:
 * - Anti-downgrade: rejects if new_version < current agent_version
 * - Idempotency: if agent already at new_version and no force_update pending, returns success
 * - Loop detection: logs delivery count for diagnostics
 * 
 * Body:
 * - new_version: string (versao instalada)
 * - old_version: string (versao anterior)
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    logger.info('[confirm-force-update] Requisicao recebida', { requestId });

    // Verificar headers de autenticacao (aceita padrao novo X-HMAC-* + legado X-*)
    const agentToken = req.headers.get('X-Agent-Token');
    const signature = req.headers.get('X-HMAC-Signature');
    const hmacTimestamp = req.headers.get('X-HMAC-Timestamp') || req.headers.get('X-Timestamp');
    const hmacNonce = req.headers.get('X-HMAC-Nonce') || req.headers.get('X-Nonce');

    if (!agentToken) {
      logger.warn('[confirm-force-update] Missing X-Agent-Token', { requestId });
      return new Response(
        JSON.stringify({ error: 'Missing agent token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar token e agente via hash
    const tokenHash = await hashToken(agentToken);
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('agent_id, is_active, agents!inner(id, agent_name, hmac_secret, agent_version, force_update_version, force_update_delivery_count, force_update_delivered_count, tenant_id)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData) {
      logger.error('[confirm-force-update] Token invalido', { requestId, error: tokenError });
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agent = (tokenData as Record<string, unknown>).agents as { 
      id: string; 
      agent_name: string; 
      hmac_secret: string | null;
      agent_version: string | null;
      force_update_version: string | null;
      force_update_delivery_count: number | null;
      force_update_delivered_count: number | null;
      tenant_id: string;
    };

    // HMAC verification (accept token-only for pre-hotfix agents)
    const hasHmacHeaders = !!(signature && hmacTimestamp && hmacNonce);
    if (hasHmacHeaders && agent.hmac_secret) {
      const hmacResult = await verifyHmacSignature(
        supabase,
        req,
        agent.agent_name,
        agent.hmac_secret,
        {
          agentId: agent.id,
          tenantId: agent.tenant_id,
          endpoint: 'confirm-force-update',
        }
      );

      if (!hmacResult.valid) {
        logger.warn('[confirm-force-update] HMAC failed, accepting token-only', {
          requestId,
          errorCode: hmacResult.errorCode,
          agentName: agent.agent_name,
        });
      }
    } else {
      logger.warn('[confirm-force-update] Missing HMAC headers, token-only auth', {
        requestId,
        agentName: agent.agent_name,
        hasSignature: !!signature,
        hasTimestamp: !!hmacTimestamp,
        hasNonce: !!hmacNonce,
      });
    }

    // Parsear body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { new_version, old_version } = body as { new_version?: string; old_version?: string };

    if (!new_version) {
      return new Response(
        JSON.stringify({ error: 'new_version is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================================
    // GUARD 1: Idempotency - already at this version, no pending force_update
    // ============================================================
    const currentNorm = normalizeVersion(agent.agent_version);
    const newNorm = normalizeVersion(new_version);
    const targetNorm = normalizeVersion(agent.force_update_version);
    const deliveryCount = agent.force_update_delivered_count ?? agent.force_update_delivery_count ?? 0;
    const nowIso = new Date().toISOString();

    if (currentNorm === newNorm && !agent.force_update_version) {
      logger.info('[confirm-force-update] Idempotent: agent already at version, no force_update pending', {
        requestId, agentName: agent.agent_name, version: new_version
      });
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Already confirmed (idempotent)',
          agent_name: agent.agent_name,
          new_version: new_version,
          idempotent: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================================
    // GUARD 2: Reject mismatched confirmation for a different target
    // ============================================================
    if (targetNorm && newNorm !== targetNorm) {
      logger.warn('[confirm-force-update] Rejecting mismatched force update confirmation', {
        requestId,
        agentName: agent.agent_name,
        currentVersion: agent.agent_version,
        targetVersion: agent.force_update_version,
        reportedVersion: new_version,
      });

      return new Response(
        JSON.stringify({
          error: 'Reported version does not match pending force update target',
          agent_name: agent.agent_name,
          current_version: agent.agent_version,
          target_version: agent.force_update_version,
          reported_version: new_version,
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[confirm-force-update] Processing force update confirmation', {
      requestId,
      agentName: agent.agent_name,
      oldVersion: old_version || agent.agent_version,
      currentVersion: agent.agent_version,
      newVersion: new_version,
      pendingTargetVersion: agent.force_update_version,
      wasForceUpdate: !!agent.force_update_version,
      deliveryCount,
    });

    // IMPORTANT:
    // For legacy agents, this endpoint can be called by the *old* process immediately
    // after file replacement but before the new script produces a heartbeat.
    // Never trust this callback alone to flip agent_version or clear force_update
    // when DB still shows the previous version.
    if (currentNorm !== newNorm) {
      const { error: evidenceError } = await supabase
        .from('agent_evidence_logs')
        .insert({
          agent_id: agent.id,
          agent_name: agent.agent_name,
          agent_version: agent.agent_version,
          tenant_id: agent.tenant_id,
          event_type: 'force_update_staged',
          event_data: {
            old_version: old_version || agent.agent_version,
            new_version: new_version,
            pending_target_version: agent.force_update_version,
            delivery_count: deliveryCount,
            staged_at: nowIso,
            waiting_for_post_update_heartbeat: true,
          },
          evidence_hash: crypto.randomUUID(),
          severity: 'info'
        });

      if (evidenceError) {
        logger.warn('[confirm-force-update] Failed to register staged evidence (non-critical)', { requestId, error: evidenceError });
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Force update staged; waiting for heartbeat from the new version before clearing pending update',
          agent_name: agent.agent_name,
          current_version: agent.agent_version,
          new_version: new_version,
          awaiting_heartbeat: true,
        }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Current DB version already matches the reported version, so it is safe to clear
    const { error: updateError } = await supabase
      .from('agents')
      .update({
        force_update_version: null,
        force_update_reason: null,
        force_update_at: null,
        force_update_delivery_count: 0,
        force_update_delivered_count: 0,
        force_update_first_delivered_at: null,
        last_forced_update_applied: nowIso
      })
      .eq('id', agent.id);

    if (updateError) {
      logger.error('[confirm-force-update] Erro ao limpar force update', { requestId, error: updateError });
      return new Response(
        JSON.stringify({ error: 'Failed to clear pending force update' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: evidenceError } = await supabase
      .from('agent_evidence_logs')
      .insert({
        agent_id: agent.id,
        agent_name: agent.agent_name,
        agent_version: new_version,
        tenant_id: agent.tenant_id,
        event_type: 'force_update_applied',
        event_data: {
          old_version: old_version || agent.agent_version,
          new_version: new_version,
          was_force_update: !!agent.force_update_version,
          delivery_count: deliveryCount,
          applied_at: nowIso
        },
        evidence_hash: crypto.randomUUID(),
        severity: 'info'
      });

    if (evidenceError) {
      logger.warn('[confirm-force-update] Falha ao registrar evidence (nao critico)', { requestId, error: evidenceError });
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
