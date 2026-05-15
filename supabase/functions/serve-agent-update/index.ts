// @ts-nocheck
/**
 * serve-agent-update — Migrated to serveAgent middleware.
 * HMAC is mandatory via serveAgent strict verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { updateDecisionService } from '../_shared/hexagonal/update-decision-service.ts';
import { handleForceUpdate } from './force-update-handler.ts';
import { calculateBucket, checkRolloutPolicy, logRolloutDecision } from './rollout-engine.ts';
import { prepareScriptForDelivery } from './script-delivery.ts';

serveAgent(async (req, ctx) => {
  const { supabase, agentId, agentName, tenantId, hmacSecret, requestId, agentData } = ctx;
  const origin = req.headers.get('origin');

  // Strict HMAC verification is enforced by serveAgent before this handler runs.

  const platform = ((agentData.os_type as string) || 'windows').toLowerCase();
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

  // FORCE UPDATE: Priority
  const forceResponse = await handleForceUpdate(supabase, {
    id: agentId, agent_name: agentName, tenant_id: tenantId, hmac_secret: hmacSecret || '',
    agent_version: agentData.agent_version as string | null, os_type: agentData.os_type as string | null,
    force_update_version: agentData.force_update_version as string | null, force_update_reason: agentData.force_update_reason as string | null,
  }, platform, SUPABASE_URL, origin, requestId);
  if (forceResponse) return forceResponse;

  // ROLLOUT
  const bucket = await calculateBucket(agentId);
  const { policy: rolloutPolicy, blockedResponse } = await checkRolloutPolicy(supabase, agentId, agentName, agentData.agent_version as string | null, platform, bucket, origin, requestId);
  if (blockedResponse) return blockedResponse;

  // Fetch latest release
  const { data: release, error: releaseError } = await supabase
    .from('agent_releases')
    .select('id, version, script_content, sha256, release_notes, created_at, signature_base64, signed_at, signed_by')
    .eq('platform', platform).eq('channel', 'stable').eq('is_active', true)
    .order('created_at', { ascending: false }).limit(1).single();

  if (releaseError || !release) {
    return { error: 'No update available', current_version: agentData.agent_version };
  }

  // Version comparison
  {
    const decision = await updateDecisionService.evaluate(
      { agentId, agentName, currentVersion: agentData.agent_version as string | null, currentScriptSha256: req.headers.get('X-Script-SHA256') || req.headers.get('X-Current-SHA256'), platform },
      { version: release.version, scriptContent: release.script_content, sha256: release.sha256, releaseNotes: release.release_notes, createdAt: release.created_at },
    );
    if (decision.action === 'no_update') {
      await logRolloutDecision(supabase, agentId, agentName, platform, agentData.agent_version as string | null, release.version, bucket, rolloutPolicy?.rollout_percentage || 100, 'already_current', requestId);
      return { message: 'Already up to date', current_version: agentData.agent_version };
    }
  }

  const prepared = await prepareScriptForDelivery(supabase, release.id, release.script_content, platform, requestId);
  if (!prepared) {
    return new Response(JSON.stringify({ error: 'No valid script available' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  // Re-sign if hotfix changed content (eliminates stale signature warnings)
  const { resignIfNeeded } = await import('../_shared/script-resigner.ts');
  const resignResult = await resignIfNeeded({
    sha256: prepared.calculatedSha256,
    originalSignature: release.signature_base64,
    originalSignedAt: release.signed_at,
    originalSignedBy: release.signed_by || null,
    contentChanged: prepared.contentChanged,
    logContext: { agentName, version: release.version, scope: 'serve-agent-update', requestId },
  });
  const safeSignature = resignResult.signatureBase64;
  const safeSignedAt = resignResult.signedAt;
  const safeSignedBy = resignResult.signedBy;

  if (prepared.contentChanged && resignResult.resigned && safeSignature && safeSignedAt) {
    const { error: persistSignatureError } = await supabase
      .from('agent_releases')
      .update({
        signature_base64: safeSignature,
        signed_at: safeSignedAt,
        signed_by: safeSignedBy,
        sha256: prepared.calculatedSha256,
      })
      .eq('id', release.id);

    if (persistSignatureError) {
      logger.warn('[serve-agent-update] Failed to persist re-signed script metadata', {
        requestId,
        agentName,
        version: release.version,
        error: persistSignatureError.message,
      });
    }
  }

  await logRolloutDecision(supabase, agentId, agentName, platform, agentData.agent_version as string | null, release.version, bucket, rolloutPolicy?.rollout_percentage || 100, 'allowed', requestId);

  return {
    version: release.version, script_content: prepared.finalContent, sha256: prepared.calculatedSha256,
    script_sha256: prepared.calculatedSha256, script_content_base64: prepared.base64Script, sha256_base64: prepared.calculatedSha256,
    signature_base64: safeSignature, signed_at: safeSignedAt, signed_by: safeSignedBy,
    expected_sha256: prepared.calculatedSha256,
    signature_timestamp: safeSignedAt,
    release_notes: release.release_notes, platform, current_version: agentData.agent_version,
    legacy_agent_detected: false,
    self_healing_note: null,
    confirm_url: `${SUPABASE_URL}/functions/v1/confirm-force-update`,
    confirm_method: 'POST', confirm_body_schema: { new_version: release.version, old_version: agentData.agent_version || 'unknown' },
    confirm_required_headers: ['X-Agent-Token', 'X-HMAC-Signature', 'X-HMAC-Timestamp', 'X-HMAC-Nonce'],
    confirm_instructions: 'After applying the update, POST to confirm_url with confirm_body_schema and HMAC headers.',
  };
}, {
  extraAgentFields: ['agent_version', 'os_type', 'force_update_version', 'force_update_reason'],
  hmacVerify: true,
});