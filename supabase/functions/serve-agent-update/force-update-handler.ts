/**
 * Force update handler — highest priority, bypasses rollout and jobs.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { applyWindowsScriptHotfix } from '../_shared/windows-script-hotfix.ts';
import { normalizeForWindows } from '../_shared/hexagonal/update-decision-service.ts';

interface AgentInfo {
  id: string;
  agent_name: string;
  tenant_id: string;
  agent_version: string | null;
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

  let scriptContent = forcedRelease.script_content;
  if (platform === 'windows' && scriptContent) {
    const hotfix = applyWindowsScriptHotfix(scriptContent);
    if (hotfix.changed) {
      scriptContent = hotfix.content;
      logger.warn('[serve-agent-update] Applied Windows hotfix in force-update path', { requestId, forceVersion: forcedRelease.version, reasons: hotfix.reasons });
      const { error: persistError } = await supabase.from('agent_releases').update({ script_content: scriptContent }).eq('id', forcedRelease.id);
      if (persistError) logger.warn('[serve-agent-update] Could not persist force-update hotfix', { requestId, error: persistError.message });
    }
  }

  // SAFETY: Reject HTML content
  if (scriptContent?.trimStart().startsWith('<!DOCTYPE') || scriptContent?.trimStart().startsWith('<html')) {
    logger.error('[serve-agent-update] Force update script is corrupted HTML', { requestId, forceVersion: agent.force_update_version });
    return new Response(
      JSON.stringify({ error: 'Script content corrupted (HTML)', version: agent.force_update_version }),
      { status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );
  }

  const normalizedScript = normalizeForWindows(scriptContent);
  const scriptBytes = new TextEncoder().encode(normalizedScript);
  const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes);
  const calculatedSha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  const base64Script = encodeBase64(scriptBytes);

  // Increment delivery counter
  const { data: currentAgent } = await supabase.from('agents').select('force_update_delivery_count').eq('id', agent.id).single();
  await supabase.from('agents').update({ force_update_delivery_count: (currentAgent?.force_update_delivery_count || 0) + 1 }).eq('id', agent.id);

  logger.info('[serve-agent-update] FORCE UPDATE: Enviando script', { requestId, agentName: agent.agent_name, fromVersion: agent.agent_version, toVersion: forcedRelease.version });

  return new Response(
    JSON.stringify({
      version: forcedRelease.version,
      script_content: scriptContent,
      sha256: calculatedSha256,
      script_sha256: calculatedSha256,
      script_content_base64: base64Script,
      sha256_base64: calculatedSha256,
      signature_base64: forcedRelease.signature_base64 || null,
      signed_at: forcedRelease.signed_at || null,
      signed_by: forcedRelease.signed_by || null,
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
