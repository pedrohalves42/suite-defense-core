import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { INSTALLER_VERSION } from '../_shared/installer-version.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { updateDecisionService, normalizeVersion, normalizeForWindows } from '../_shared/hexagonal/update-decision-service.ts';
import { handleForceUpdate } from './force-update-handler.ts';
import { calculateBucket, checkRolloutPolicy, logRolloutDecision } from './rollout-engine.ts';
import { prepareScriptForDelivery } from './script-delivery.ts';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const requestId = crypto.randomUUID();

  try {
    logger.info('[serve-agent-update] Requisicao recebida', { requestId });

    const agentToken = req.headers.get('X-Agent-Token');
    if (!agentToken) {
      return new Response(JSON.stringify({ error: 'Missing agent token' }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Token auth via hash
    const tokenHash = await hashToken(agentToken);
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('agent_id, is_active, agents!inner(id, agent_name, tenant_id, hmac_secret, agent_version, os_type, force_update_version, force_update_reason)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData) {
      logger.error('[serve-agent-update] Token invalido', { requestId, error: tokenError });
      return new Response(JSON.stringify({ error: 'Invalid token or agent not found' }), { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const agent = (tokenData as Record<string, unknown>).agents as {
      id: string; agent_name: string; tenant_id: string; hmac_secret: string;
      agent_version: string | null; os_type: string | null;
      force_update_version: string | null; force_update_reason: string | null;
    };

    // HMAC verification with token-only fallback
    const signature = req.headers.get('X-HMAC-Signature');
    const timestamp = req.headers.get('X-HMAC-Timestamp') || req.headers.get('X-Timestamp');
    const nonce = req.headers.get('X-HMAC-Nonce') || req.headers.get('X-Nonce');
    const hasAnyHmacHeader = !!(signature || timestamp || nonce);

    if (hasAnyHmacHeader && agent.hmac_secret) {
      const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret, {
        agentId: agent.id, tenantId: agent.tenant_id, endpoint: '/serve-agent-update',
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
      });
      if (!hmacResult.valid) {
        logger.warn('[serve-agent-update] HMAC failed but accepting (token-authenticated)', { requestId, agentName: agent.agent_name, errorCode: hmacResult.errorCode });
      }
    }

    logger.info('[serve-agent-update] Agent authenticated', { requestId, agentName: agent.agent_name, currentVersion: agent.agent_version, authMethod: hasAnyHmacHeader ? 'hmac' : 'token-only' });

    const platform = agent.os_type?.toLowerCase() || 'windows';

    // FORCE UPDATE: Priority
    const forceResponse = await handleForceUpdate(supabase, agent, platform, SUPABASE_URL, origin, requestId);
    if (forceResponse) return forceResponse;

    // ROLLOUT
    const bucket = await calculateBucket(agent.id);
    const { policy: rolloutPolicy, blockedResponse } = await checkRolloutPolicy(supabase, agent.id, agent.agent_name, agent.agent_version, platform, bucket, origin, requestId);
    if (blockedResponse) return blockedResponse;

    // Fetch latest release
    const { data: release, error: releaseError } = await supabase
      .from('agent_releases')
      .select('id, version, script_content, sha256, release_notes, created_at, signature_base64, signed_at, signed_by')
      .eq('platform', platform).eq('channel', 'stable').eq('is_active', true)
      .order('created_at', { ascending: false }).limit(1).single();

    if (releaseError || !release) {
      return new Response(JSON.stringify({ error: 'No update available', current_version: agent.agent_version }), { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // Version comparison
    const legacyVersions = ['3.10.37', '3.10.39', '3.10.14'];
    const currentVersionNorm = normalizeVersion(agent.agent_version);
    const isLegacyAgent = legacyVersions.some(v => currentVersionNorm.includes(v));

    if (!isLegacyAgent) {
      const decision = await updateDecisionService.evaluate(
        { agentId: agent.id, agentName: agent.agent_name, currentVersion: agent.agent_version, currentScriptSha256: req.headers.get('X-Script-SHA256') || req.headers.get('X-Current-SHA256'), platform },
        { version: release.version, scriptContent: release.script_content, sha256: release.sha256, releaseNotes: release.release_notes, createdAt: release.created_at },
      );
      if (decision.action === 'no_update') {
        await logRolloutDecision(supabase, agent.id, agent.agent_name, platform, agent.agent_version, release.version, bucket, rolloutPolicy?.rollout_percentage || 100, 'already_current', requestId);
        return new Response(JSON.stringify({ message: 'Already up to date', current_version: agent.agent_version }), { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }
    }

    // Prepare script
    const prepared = await prepareScriptForDelivery(supabase, release.id, release.script_content, platform, requestId);
    if (!prepared) {
      return new Response(JSON.stringify({ error: 'No valid script available' }), { status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    logger.info('[serve-agent-update] Script preparado', { requestId, agentName: agent.agent_name, fromVersion: agent.agent_version, toVersion: release.version });

    await logRolloutDecision(supabase, agent.id, agent.agent_name, platform, agent.agent_version, release.version, bucket, rolloutPolicy?.rollout_percentage || 100, 'allowed', requestId);

    return new Response(
      JSON.stringify({
        version: release.version,
        script_content: prepared.finalContent,
        sha256: prepared.calculatedSha256,
        script_sha256: prepared.calculatedSha256,
        script_content_base64: prepared.base64Script,
        sha256_base64: prepared.calculatedSha256,
        signature_base64: release.signature_base64 || null,
        signed_at: release.signed_at || null,
        signed_by: release.signed_by || null,
        release_notes: release.release_notes,
        platform,
        current_version: agent.agent_version,
        legacy_agent_detected: isLegacyAgent,
        self_healing_note: isLegacyAgent ? 'Script saved to disk. New version active after Windows reboot.' : null,
        confirm_url: `${SUPABASE_URL}/functions/v1/confirm-force-update`,
        confirm_method: 'POST',
        confirm_body_schema: { new_version: release.version, old_version: agent.agent_version || 'unknown' },
        confirm_required_headers: ['X-Agent-Token', 'X-HMAC-Signature', 'X-Timestamp', 'X-Nonce'],
        confirm_instructions: 'After applying the update, POST to confirm_url with confirm_body_schema and HMAC headers to register the new version.',
      }),
      { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    const err = error as Error;
    logger.error('[serve-agent-update] Erro interno', { requestId, error: err.message, stack: err.stack });
    return new Response(JSON.stringify({ error: 'Internal server error', message: err.message, requestId }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
});
