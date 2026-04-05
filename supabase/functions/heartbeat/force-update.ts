/**
 * Force-update logic module for heartbeat.
 * Handles all force_update decision-making, self-healing, delivery, and cleanup.
 * Uses the canonical prepareAgentScriptContent pipeline.
 */

import { normalizeVersion } from '../_shared/hexagonal/update-decision-service.ts'
import { prepareAgentScriptContent } from '../_shared/agent-script-preparation.ts'
import { logger } from '../_shared/logger.ts'
import { buildCorsHeaders } from '../_shared/cors.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import type { AgentContext, AgentUpdate } from './types.ts'

const MIN_FORCE_UPDATE_VERSION = '4.5.0'
const MAX_DELIVERY_ATTEMPTS = 50

interface ForceUpdateResult {
  /** If a force-update response should be sent */
  handled: boolean;
  /** Pre-built Response for the agent (only set if handled=true) */
  response?: Response;
}

/**
 * Process force-update logic for a heartbeat.
 * Returns { handled: true, response } if a force-update response should be sent,
 * or { handled: false } to fall through to normal heartbeat response.
 */
export async function processForceUpdate(
  supabase: SupabaseClient,
  agent: AgentContext,
  updateData: AgentUpdate,
  agentVersionFromPayload: string | undefined,
  platform: string,
  origin: string | null,
  supabaseUrl: string,
): Promise<ForceUpdateResult> {
  // Self-heal: recover missing force_update_version from latest release
  let effectiveForceVersion = agent.force_update_version
  let effectiveForceReason = agent.force_update_reason

  if (!effectiveForceVersion && agent.force_update_at) {
    const healed = await selfHealForceVersion(supabase, agent, platform, agentVersionFromPayload || updateData.agent_version)
    if (!healed) return { handled: false } // Cleared stale flag
    effectiveForceVersion = healed.version
    effectiveForceReason = healed.reason
  }

  if (!effectiveForceVersion) return { handled: false }

  // Guard: agent version too old for force_update
  const agentNorm = normalizeVersion(agentVersionFromPayload || updateData.agent_version)
  const minNorm = normalizeVersion(MIN_FORCE_UPDATE_VERSION)

  if (agentNorm && minNorm && agentNorm < minNorm) {
    logger.warn('Agent version too old for force_update, clearing flag', {
      agentName: agent.agent_name, agentVersion: agentNorm,
      minRequired: MIN_FORCE_UPDATE_VERSION, targetVersion: effectiveForceVersion,
    })
    await clearForceUpdateFlag(supabase, agent.id, 'auto_cleared_version_too_old')
    return { handled: false }
  }

  // Guard: stale same-version trigger (already applied)
  const currentVersion = agentVersionFromPayload || updateData.agent_version
  const currentNorm = normalizeVersion(currentVersion)
  const targetNorm = normalizeVersion(effectiveForceVersion)
  const sameVersionReported = !!currentNorm && !!targetNorm && currentNorm === targetNorm

  const forceTriggeredAtMs = agent.force_update_at ? new Date(agent.force_update_at).getTime() : null
  const lastAppliedMs = agent.last_forced_update_applied ? new Date(agent.last_forced_update_applied).getTime() : null
  const staleSameVersionTrigger = sameVersionReported && lastAppliedMs !== null &&
    (forceTriggeredAtMs === null || forceTriggeredAtMs <= lastAppliedMs)

  if (staleSameVersionTrigger) {
    logger.warn('Stale same-version force_update detected after confirmed apply, clearing flag', {
      agentName: agent.agent_name, version: currentVersion,
      forceTriggeredAt: agent.force_update_at, lastForcedUpdateApplied: agent.last_forced_update_applied,
    })
    await clearForceUpdateFlag(supabase, agent.id, 'auto_cleared_already_applied')
    return { handled: false }
  }

  if (sameVersionReported) {
    logger.warn('Agent reports target version but force_update remains pending', {
      agentName: agent.agent_name, version: currentVersion,
      targetVersion: effectiveForceVersion,
    })
  }

  // Guard: too many deliveries (agent doesn't support force_update)
  if (agent.force_update_delivered_count >= MAX_DELIVERY_ATTEMPTS) {
    logger.warn('Agent does not support force_update after max deliveries, clearing flag', {
      agentName: agent.agent_name, targetVersion: effectiveForceVersion,
      deliveredCount: agent.force_update_delivered_count,
    })
    await clearForceUpdateFlag(supabase, agent.id, null)
    return { handled: false }
  }

  // Increment delivery count
  const deliveryAttempt = agent.force_update_delivered_count + 1
  const now = new Date().toISOString()
  await supabase
    .from('agents')
    .update({
      force_update_delivered_count: deliveryAttempt,
      force_update_first_delivered_at: agent.force_update_first_delivered_at || now,
    })
    .eq('id', agent.id)

  // Fetch release
  const response = await buildForceUpdateResponse(
    supabase, agent, effectiveForceVersion, effectiveForceReason,
    platform, origin, supabaseUrl, deliveryAttempt, currentVersion,
  )

  return response
    ? { handled: true, response }
    : { handled: false }
}

// ─── Private helpers ────────────────────────────────────────

export async function selfHealForceVersion(
  supabase: SupabaseClient,
  agent: AgentContext,
  platform: string,
  currentVersion: string | undefined,
): Promise<{ version: string; reason: string } | null> {
  const { data: latestRelease } = await supabase
    .from('agent_releases')
    .select('version')
    .eq('platform', platform)
    .eq('channel', 'stable')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latestRelease?.version) return null

  // If recovered version matches current → clear stale flag
  if (currentVersion && normalizeVersion(currentVersion) === normalizeVersion(latestRelease.version)) {
    logger.warn('Self-heal recovered version matches current agent version, clearing stale flag', {
      agentName: agent.agent_name, currentVersion, recoveredVersion: latestRelease.version,
    })
    await clearForceUpdateFlag(supabase, agent.id, 'auto_cleared_version_matched_on_recovery')
    return null
  }

  const reason = agent.force_update_reason || 'Recovered from pending force_update_at without version'
  await supabase.from('agents')
    .update({ force_update_version: latestRelease.version, force_update_reason: reason })
    .eq('id', agent.id)

  logger.warn('Recovered missing force_update_version from latest active release', {
    agentName: agent.agent_name, targetVersion: latestRelease.version, platform,
  })

  return { version: latestRelease.version, reason }
}

async function clearForceUpdateFlag(
  supabase: SupabaseClient,
  agentId: string,
  reason: string | null,
): Promise<void> {
  await supabase.from('agents')
    .update({
      force_update_version: null,
      force_update_reason: reason,
      force_update_at: null,
      force_update_delivered_count: 0,
      force_update_first_delivered_at: null,
      force_update_override_safe_mode: false,
      force_update_override_safe_mode_expires_at: null,
    })
    .eq('id', agentId)
}

async function buildForceUpdateResponse(
  supabase: SupabaseClient,
  agent: AgentContext,
  targetVersion: string,
  reason: string | null,
  platform: string,
  origin: string | null,
  supabaseUrl: string,
  deliveryAttempt: number,
  currentVersion: string | undefined,
): Promise<Response | null> {
  logger.info('Force update detected for agent', {
    agentName: agent.agent_name, targetVersion, deliveryAttempt,
  })

  const { data: release } = await supabase
    .from('agent_releases')
    .select('id, version, script_content, sha256, signature_base64, signed_at')
    .eq('version', targetVersion)
    .eq('platform', platform)
    .eq('is_active', true)
    .single()

  if (!release) {
    logger.warn('Force update version not found in agent_releases', {
      agentName: agent.agent_name, targetVersion, platform,
    })
    return null
  }

  // Unified pipeline: decode → hotfix → reject HTML → normalize → SHA-256 → base64
  const prepared = await prepareAgentScriptContent({
    supabase,
    releaseId: release.id,
    rawScriptContent: release.script_content,
    platform,
    requestId: `fu-${agent.agent_name}`,
    logScope: 'heartbeat/force-update',
    persistIfChanged: true,
  })

  if (!prepared) {
    logger.error('Force update script invalid after preparation', {
      agentName: agent.agent_name, targetVersion,
    })
    return null
  }

  // SAFETY: Version header validation
  const headerMatch = prepared.content.match(/CyberShield\s+Agent\s*[-?]\s*\w+\s+v?([\d]+\.[\d]+)/i)
  const scriptMajor = headerMatch?.[1] || ''
  const targetMajor = normalizeVersion(targetVersion)?.split('.').slice(0, 2).join('.') || ''

  if (headerMatch && scriptMajor !== targetMajor) {
    logger.error('Script version mismatch! DB content does not match target version', {
      agentName: agent.agent_name, scriptHeader: scriptMajor, targetVersion,
      hint: 'Use upload-release-content to fix the script_content in agent_releases',
    })
    return null
  }

  // Signature staleness: if hotfix changed content, the old signature is invalid
  const signatureValid = !prepared.changed
  const signatureBase64 = signatureValid ? (release.signature_base64 || null) : null
  const signedAt = signatureValid ? (release.signed_at || null) : null

  if (prepared.changed && release.signature_base64) {
    logger.warn('Hotfix changed script content — invalidating stale Ed25519 signature', {
      agentName: agent.agent_name, targetVersion, reasons: prepared.reasons,
    })
  }

  const overrideSafeMode = !!(agent.force_update_override_safe_mode &&
    (!agent.force_update_override_safe_mode_expires_at ||
      new Date(agent.force_update_override_safe_mode_expires_at) > new Date()))

  logger.info('Sending force update via heartbeat response', {
    agentName: agent.agent_name, targetVersion: release.version, platform,
    deliveryAttempt, hasSignature: !!signatureBase64,
    skipFirewallRemediation: agent.skip_firewall_remediation,
    sha256: prepared.sha256.substring(0, 16) + '...',
  })

  return new Response(
    JSON.stringify({
      ok: true,
      agent: agent.agent_name,
      timestamp: new Date().toISOString(),
      force_update: true,
      target_version: release.version,
      version: release.version,
      script_content_base64: prepared.base64Content,
      script_content: prepared.content,
      sha256: prepared.sha256,
      script_sha256: prepared.sha256,
      sha256_base64: prepared.sha256,
      ecdsa_signature: signatureBase64,
      script_hash_signature: signatureBase64,
      signature_base64: signatureBase64,
      script_hash_signed_at: signedAt,
      skip_firewall_remediation: agent.skip_firewall_remediation || false,
      reason: reason || 'Forced update via backend',
      force_update_reason: reason || 'Forced update via backend',
      override_safe_mode: overrideSafeMode,
      confirm_url: `${supabaseUrl}/functions/v1/confirm-force-update`,
      confirm_method: 'POST',
      confirm_body_schema: {
        new_version: release.version,
        old_version: currentVersion || 'unknown',
      },
      heartbeat_interval_seconds: 60,
      poll_interval_seconds: 30,
      enable_eventlog: true,
      aggregation: null,
      jobs: [],
    }),
    {
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      status: 200,
    },
  )
}
