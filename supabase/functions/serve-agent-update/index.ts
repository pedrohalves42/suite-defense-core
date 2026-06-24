/**
 * serve-agent-update — Migrated to serveAgent middleware.
 * NOTE: HMAC is best-effort (token-only fallback for some agents).
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { normalizeVersion, updateDecisionService } from '../_shared/hexagonal/update-decision-service.ts';
import { handleForceUpdate } from './force-update-handler.ts';
import { calculateBucket, checkRolloutPolicy, logRolloutDecision } from './rollout-engine.ts';
import { prepareScriptForDelivery } from './script-delivery.ts';
import type { Database } from '../_shared/database.types.ts';

type AgentReleaseRow = Database['public']['Tables']['agent_releases']['Row'];
type ReleasePick = Pick<
  AgentReleaseRow,
  'id' | 'version' | 'script_content' | 'sha256' | 'release_notes' | 'created_at' | 'signature_base64' | 'signed_at' | 'signed_by'
>;

const asNullableString = (v: unknown): string | null =>
  typeof v === 'string' ? v : v == null ? null : null;

serveAgent(async (req, ctx) => {
  const { agentId, agentName, tenantId, hmacSecret, requestId, agentData } = ctx;
  const supabase = ctx.supabase as SupabaseClient<Database>;
  const origin = req.headers.get('origin');

  // Best-effort HMAC verification (non-blocking)
  const signature = req.headers.get('X-HMAC-Signature');
  const timestamp = req.headers.get('X-HMAC-Timestamp') || req.headers.get('X-Timestamp');
  const nonce = req.headers.get('X-HMAC-Nonce') || req.headers.get('X-Nonce');
  const hasAnyHmacHeader = !!(signature || timestamp || nonce);

  if (hasAnyHmacHeader && hmacSecret) {
    try {
      const { verifyHmacSignature } = await import('../_shared/hmac.ts');
      const hmacResult = await verifyHmacSignature(supabase, req, agentName, hmacSecret, {
        agentId, tenantId, endpoint: '/serve-agent-update',
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
      });
      if (!hmacResult.valid) {
        logger.warn('[serve-agent-update] HMAC failed but accepting (token-authenticated)', { requestId, agentName, errorCode: hmacResult.errorCode });
      }
    } catch (err) { logger.warn('[serve-agent-update] HMAC check failed (best-effort)', err); }
  }

  const agentVersion = asNullableString(agentData.agent_version);
  const osType = asNullableString(agentData.os_type);
  const forceUpdateVersion = asNullableString(agentData.force_update_version);
  const forceUpdateReason = asNullableString(agentData.force_update_reason);

  const platform = (osType ?? 'windows').toLowerCase();
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

  // FORCE UPDATE: Priority
  const forceResponse = await handleForceUpdate(supabase, {
    id: agentId, agent_name: agentName, tenant_id: tenantId, hmac_secret: hmacSecret ?? '',
    agent_version: agentVersion, os_type: osType,
    force_update_version: forceUpdateVersion, force_update_reason: forceUpdateReason,
  }, platform, SUPABASE_URL, origin, requestId);
  if (forceResponse) return forceResponse;

  // ROLLOUT
  const bucket = await calculateBucket(agentId);
  const { policy: rolloutPolicy, blockedResponse } = await checkRolloutPolicy(supabase, agentId, agentName, agentVersion, platform, bucket, origin, requestId);
  if (blockedResponse) return blockedResponse;

  const rolloutPercentage =
    rolloutPolicy && typeof (rolloutPolicy as { rollout_percentage?: unknown }).rollout_percentage === 'number'
      ? ((rolloutPolicy as { rollout_percentage: number }).rollout_percentage)
      : 100;

  // Fetch latest release
  const { data: release, error: releaseError } = await supabase
    .from('agent_releases')
    .select('id, version, script_content, sha256, release_notes, created_at, signature_base64, signed_at, signed_by')
    .eq('platform', platform).eq('channel', 'stable').eq('is_active', true)
    .order('created_at', { ascending: false }).limit(1).single<ReleasePick>();

  if (releaseError || !release) {
    return { error: 'No update available', current_version: agentVersion };
  }

  // Version comparison
  const legacyVersions = ['3.10.37', '3.10.39', '3.10.14'];
  const currentVersionNorm = normalizeVersion(agentVersion);
  const isLegacyAgent = legacyVersions.some(v => currentVersionNorm.includes(v));

  if (!isLegacyAgent) {
    const decision = await updateDecisionService.evaluate(
      { agentId, agentName, currentVersion: agentVersion, currentScriptSha256: req.headers.get('X-Script-SHA256') || req.headers.get('X-Current-SHA256'), platform },
      { version: release.version, scriptContent: release.script_content, sha256: release.sha256, releaseNotes: release.release_notes, createdAt: release.created_at },
    );
    if (decision.action === 'no_update') {
      await logRolloutDecision(supabase, agentId, agentName, platform, agentVersion, release.version, bucket, rolloutPercentage, 'already_current', requestId);
      return { message: 'Already up to date', current_version: agentVersion };
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
    originalSignedBy: release.signed_by ?? null,
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

  await logRolloutDecision(supabase, agentId, agentName, platform, agentVersion, release.version, bucket, rolloutPercentage, 'allowed', requestId);

  return {
    version: release.version, script_content: prepared.finalContent, sha256: prepared.calculatedSha256,
    script_sha256: prepared.calculatedSha256, script_content_base64: prepared.base64Script, sha256_base64: prepared.calculatedSha256,
    signature_base64: safeSignature, signed_at: safeSignedAt, signed_by: safeSignedBy,
    expected_sha256: prepared.calculatedSha256,
    signature_timestamp: safeSignedAt,
    release_notes: release.release_notes, platform, current_version: agentVersion,
    legacy_agent_detected: isLegacyAgent,
    self_healing_note: isLegacyAgent ? 'Script saved to disk. New version active after Windows reboot.' : null,
    confirm_url: `${SUPABASE_URL}/functions/v1/confirm-force-update`,
    confirm_method: 'POST', confirm_body_schema: { new_version: release.version, old_version: agentVersion ?? 'unknown' },
    confirm_required_headers: ['X-Agent-Token', 'X-HMAC-Signature', 'X-Timestamp', 'X-Nonce'],
    confirm_instructions: 'After applying the update, POST to confirm_url with confirm_body_schema and HMAC headers.',
  };
}, {
  extraAgentFields: ['agent_version', 'os_type', 'force_update_version', 'force_update_reason'],
});
