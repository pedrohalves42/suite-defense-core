/**
 * Force update handler — highest priority, bypasses rollout and jobs.
 * Uses the canonical prepareAgentScriptContent pipeline.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { prepareAgentScriptContent } from '../_shared/agent-script-preparation.ts';

interface AgentInfo {
  id: string;
  agent_name: string;
  tenant_id: string;
  hmac_secret?: string;
  agent_version: string | null;
  os_type?: string | null;
  force_update_version: string | null;
  force_update_reason: string | null;
}

/**
 * Handle force update if agent has force_update_version set.
 * Returns a Response if force update applies, or null to continue normal flow.
 */
export async function handleForceUpdate(
  supabase: SupabaseClient,
  agent: AgentInfo,
  platform: string,
  supabaseUrl: string,
  origin: string | null,
  requestId: string,
): Promise<Response | null> {
  if (!agent.force_update_version) return null;

  logger.info('[serve-agent-update] FORCE UPDATE detectado', {
    requestId, agentName: agent.agent_name,
    currentVersion: agent.agent_version,
    forceVersion: agent.force_update_version,
    reason: agent.force_update_reason,
  });

  const { data: forcedRelease, error: forcedError } = await supabase
    .from('agent_releases')
    .select('id, version, script_content, sha256, release_notes, signature_base64, signed_at, signed_by')
    .eq('version', agent.force_update_version)
    .eq('platform', platform)
    .eq('is_active', true)
    .single();

  if (forcedError || !forcedRelease) {
    logger.error('[serve-agent-update] Force update version not found', { requestId, forceVersion: agent.force_update_version, platform });
    await supabase.from('agents').update({ force_update_version: null, force_update_reason: null, force_update_at: null }).eq('id', agent.id);
    return new Response(
      JSON.stringify({ error: 'Forced version not found', force_update_version: agent.force_update_version }),
      { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );
  }

  // Unified pipeline: decode → hotfix → reject HTML → normalize → SHA-256 → base64
  const prepared = await prepareAgentScriptContent({
    supabase,
    releaseId: forcedRelease.id,
    rawScriptContent: forcedRelease.script_content,
    platform,
    requestId,
    logScope: 'serve-agent-update/force-update',
    persistIfChanged: true,
  });

  if (!prepared) {
    logger.error('[serve-agent-update] Force update script invalid after preparation', { requestId, forceVersion: agent.force_update_version });
    return new Response(
      JSON.stringify({ error: 'Script content corrupted', version: agent.force_update_version }),
      { status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );
  }

  // Signature staleness: if hotfix changed content, the old signature is invalid
  const signatureValid = !prepared.changed;
  const safeSignature = signatureValid ? (forcedRelease.signature_base64 || null) : null;
  const safeSignedAt = signatureValid ? (forcedRelease.signed_at || null) : null;
  const safeSignedBy = signatureValid ? (forcedRelease.signed_by || null) : null;

  if (prepared.changed && forcedRelease.signature_base64) {
    logger.warn('[serve-agent-update] Hotfix changed script content — invalidating stale Ed25519 signature in force-update', {
      requestId, agentName: agent.agent_name, forceVersion: forcedRelease.version, reasons: prepared.reasons,
    });
  }

  // Increment delivery counter
  const { data: currentAgent } = await supabase.from('agents').select('force_update_delivery_count').eq('id', agent.id).single();
  await supabase.from('agents').update({ force_update_delivery_count: (currentAgent?.force_update_delivery_count || 0) + 1 }).eq('id', agent.id);

  logger.info('[serve-agent-update] FORCE UPDATE: Enviando script', { requestId, agentName: agent.agent_name, fromVersion: agent.agent_version, toVersion: forcedRelease.version });

  return new Response(
    JSON.stringify({
      version: forcedRelease.version,
      script_content: prepared.content,
      sha256: prepared.sha256,
      script_sha256: prepared.sha256,
      script_content_base64: prepared.base64Content,
      sha256_base64: prepared.sha256,
      signature_base64: safeSignature,
      signed_at: safeSignedAt,
      signed_by: safeSignedBy,
      expected_sha256: prepared.sha256,
      signature_timestamp: safeSignedAt,
      release_notes: forcedRelease.release_notes,
      platform,
      current_version: agent.agent_version,
      force_update: true,
      bypass_jobs: true,
      force_update_reason: agent.force_update_reason,
      confirm_url: `${supabaseUrl}/functions/v1/confirm-force-update`,
      confirm_method: 'POST',
      confirm_body_schema: { new_version: forcedRelease.version, old_version: agent.agent_version || 'unknown' },
      confirm_required_headers: ['X-Agent-Token', 'X-HMAC-Signature', 'X-Timestamp', 'X-Nonce'],
      confirm_instructions: 'After applying the update and recreating the scheduled task, POST to confirm_url with confirm_body_schema and HMAC headers to clear the force_update flag.',
    }),
    { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
  );
}
