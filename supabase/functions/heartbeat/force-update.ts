/**
 * Force-update logic module for heartbeat.
 * Handles all force_update decision-making, self-healing, delivery, and cleanup.
 */

import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts'
import { normalizeVersion, normalizeForWindows } from '../_shared/hexagonal/update-decision-service.ts'
import { applyWindowsScriptHotfix } from '../_shared/windows-script-hotfix.ts'
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

  // SAFETY: Reject HTML content from DB (corrupted releases)
  if (release.script_content?.trimStart().startsWith('<!DOCTYPE') ||
      release.script_content?.trimStart().startsWith('<html')) {
    logger.error('Force update script is corrupted HTML, skipping delivery', {
      agentName: agent.agent_name, targetVersion,
    })
    return null
  }

  let finalScript = release.script_content

  // Apply runtime hotfixes for Windows
  if (platform === 'windows' || platform === 'Windows') {
    try {
      const hotfixResult = applyWindowsScriptHotfix(finalScript)
      if (hotfixResult.changed) {
        finalScript = hotfixResult.content
        logger.info('Applied runtime hotfixes to force_update script', {
          agentName: agent.agent_name, hotfixes: hotfixResult.reasons, count: hotfixResult.reasons.length,
        })
        // Best-effort: persist hotfixed content back
        const hotfixBytes = new TextEncoder().encode(finalScript)
        const hotfixHashBuf = await crypto.subtle.digest('SHA-256', hotfixBytes)
        const hotfixHash = Array.from(new Uint8Array(hotfixHashBuf))
          .map(b => b.toString(16).padStart(2, '0')).join('')
        await supabase.from('agent_releases')
          .update({ script_content: finalScript, sha256: hotfixHash })
          .eq('id', release.id)
      }
    } catch (hotfixErr) {
      logger.warn('Hotfix injection failed (non-fatal), delivering original script', {
        agentName: agent.agent_name, error: (hotfixErr as Error).message,
      })
    }
  }

  // SAFETY: Version header validation
  const headerMatch = finalScript.match(/CyberShield\s+Agent\s*[-?]\s*\w+\s+v?([\d]+\.[\d]+)/i)
  const scriptMajor = headerMatch?.[1] || ''
  const targetMajor = normalizeVersion(targetVersion)?.split('.').slice(0, 2).join('.') || ''

  if (headerMatch && scriptMajor !== targetMajor) {
    logger.error('Script version mismatch! DB content does not match target version', {
      agentName: agent.agent_name, scriptHeader: scriptMajor, targetVersion,
      hint: 'Use upload-release-content to fix the script_content in agent_releases',
    })
    return null
  }

  // Encode and hash
  const normalizedScript = normalizeForWindows(finalScript)
  const scriptBytes = new TextEncoder().encode(normalizedScript)
  const base64Script = encodeBase64(scriptBytes)
  const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes)
  const calculatedSha256 = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('')

  const overrideSafeMode = !!(agent.force_update_override_safe_mode &&
    (!agent.force_update_override_safe_mode_expires_at ||
      new Date(agent.force_update_override_safe_mode_expires_at) > new Date()))

  logger.info('Sending force update via heartbeat response', {
    agentName: agent.agent_name, targetVersion: release.version, platform,
    deliveryAttempt, hasSignature: !!release.signature_base64,
    skipFirewallRemediation: agent.skip_firewall_remediation,
    sha256: calculatedSha256.substring(0, 16) + '...',
  })

  return new Response(
    JSON.stringify({
      ok: true,
      agent: agent.agent_name,
      timestamp: new Date().toISOString(),
      force_update: true,
      target_version: release.version,
      version: release.version,
      script_content_base64: base64Script,
      script_content: finalScript,
      sha256: calculatedSha256,
      script_sha256: calculatedSha256,
      sha256_base64: calculatedSha256,
      ecdsa_signature: release.signature_base64 || null,
      script_hash_signature: release.signature_base64 || null,
      signature_base64: release.signature_base64 || null,
      script_hash_signed_at: release.signed_at || null,
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
      heartbeat_interval_seconds: 600,
      poll_interval_seconds: 600,
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
