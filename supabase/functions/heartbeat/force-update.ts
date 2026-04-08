/**
 * Force-update logic module for heartbeat.
 * Handles all force_update decision-making, self-healing, delivery, and cleanup.
 * Uses the canonical prepareAgentScriptContent pipeline.
 */

import { normalizeVersion } from '../_shared/hexagonal/update-decision-service.ts'
import { prepareAgentScriptContent } from '../_shared/agent-script-preparation.ts'
import { resignIfNeeded } from '../_shared/script-resigner.ts'
import { logger } from '../_shared/logger.ts'
import { buildCorsHeaders } from '../_shared/cors.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import type { AgentContext, AgentUpdate } from './types.ts'

const MIN_FORCE_UPDATE_VERSION = '4.5.0'
const MAX_DELIVERY_ATTEMPTS = 50
const AUTO_REMEDIATION_COOLDOWN_MS = 60 * 60 * 1000
const AUTO_REMEDIATION_OVERRIDE_WINDOW_MS = 15 * 60 * 1000
const AUTO_REMEDIATION_STATES = new Set(['SAFE_MODE', 'DEGRADED', 'INITIALIZING'])

interface ForceUpdateResult {
  handled: boolean;
  response?: Response;
}

interface ForceUpdateDeliveryOptions {
  omitPayloadSignature?: boolean;
  overrideSafeMode?: boolean;
  overrideSafeModeExpiresAt?: string | null;
}

interface AutoRemediationResult extends ForceUpdateDeliveryOptions {
  version: string;
  reason: string;
  forceUpdateAt: string;
}

export async function processForceUpdate(
  supabase: SupabaseClient,
  agent: AgentContext,
  updateData: AgentUpdate,
  agentVersionFromPayload: string | undefined,
  platform: string,
  origin: string | null,
  supabaseUrl: string,
): Promise<ForceUpdateResult> {
  let workingAgent: AgentContext = { ...agent }
  let effectiveForceVersion = workingAgent.force_update_version
  let effectiveForceReason = workingAgent.force_update_reason
  let deliveryOptions: ForceUpdateDeliveryOptions = {}

  if (!effectiveForceVersion && workingAgent.force_update_at) {
    const healed = await selfHealForceVersion(supabase, workingAgent, platform, agentVersionFromPayload || updateData.agent_version)
    if (!healed) return { handled: false }
    effectiveForceVersion = healed.version
    effectiveForceReason = healed.reason
    workingAgent = {
      ...workingAgent,
      force_update_version: healed.version,
      force_update_reason: healed.reason,
    }
  }

  if (!effectiveForceVersion) {
    const autoRemediation = await maybeAutoArmSameVersionRemediation(
      supabase,
      workingAgent,
      updateData,
      agentVersionFromPayload || updateData.agent_version,
      platform,
    )

    if (autoRemediation) {
      effectiveForceVersion = autoRemediation.version
      effectiveForceReason = autoRemediation.reason
      deliveryOptions = {
        omitPayloadSignature: autoRemediation.omitPayloadSignature,
        overrideSafeMode: autoRemediation.overrideSafeMode,
        overrideSafeModeExpiresAt: autoRemediation.overrideSafeModeExpiresAt,
      }
      workingAgent = {
        ...workingAgent,
        force_update_version: autoRemediation.version,
        force_update_reason: autoRemediation.reason,
        force_update_at: autoRemediation.forceUpdateAt,
        force_update_override_safe_mode: autoRemediation.overrideSafeMode ?? workingAgent.force_update_override_safe_mode,
        force_update_override_safe_mode_expires_at: autoRemediation.overrideSafeModeExpiresAt ?? workingAgent.force_update_override_safe_mode_expires_at,
      }
    }
  }

  if (!effectiveForceVersion) return { handled: false }

  const agentNorm = normalizeVersion(agentVersionFromPayload || updateData.agent_version)
  const minNorm = normalizeVersion(MIN_FORCE_UPDATE_VERSION)

  if (agentNorm && minNorm && agentNorm < minNorm) {
    logger.warn('Agent version too old for force_update, clearing flag', {
      agentName: workingAgent.agent_name,
      agentVersion: agentNorm,
      minRequired: MIN_FORCE_UPDATE_VERSION,
      targetVersion: effectiveForceVersion,
    })
    await clearForceUpdateFlag(supabase, workingAgent.id, 'auto_cleared_version_too_old')
    return { handled: false }
  }

  const currentVersion = agentVersionFromPayload || updateData.agent_version
  const currentNorm = normalizeVersion(currentVersion)
  const targetNorm = normalizeVersion(effectiveForceVersion)
  const sameVersionReported = !!currentNorm && !!targetNorm && currentNorm === targetNorm

  const forceTriggeredAtMs = workingAgent.force_update_at ? new Date(workingAgent.force_update_at).getTime() : null
  const lastAppliedMs = workingAgent.last_forced_update_applied ? new Date(workingAgent.last_forced_update_applied).getTime() : null
  const staleSameVersionTrigger = sameVersionReported && lastAppliedMs !== null &&
    (forceTriggeredAtMs === null || forceTriggeredAtMs <= lastAppliedMs)

  if (staleSameVersionTrigger) {
    logger.warn('Stale same-version force_update detected after confirmed apply, clearing flag', {
      agentName: workingAgent.agent_name,
      version: currentVersion,
      forceTriggeredAt: workingAgent.force_update_at,
      lastForcedUpdateApplied: workingAgent.last_forced_update_applied,
    })
    await clearForceUpdateFlag(supabase, workingAgent.id, 'auto_cleared_already_applied')
    return { handled: false }
  }

  if (sameVersionReported) {
    logger.warn('Agent reports target version but force_update remains pending', {
      agentName: workingAgent.agent_name,
      version: currentVersion,
      targetVersion: effectiveForceVersion,
    })
  }

  if (workingAgent.force_update_delivered_count >= MAX_DELIVERY_ATTEMPTS) {
    logger.warn('Agent does not support force_update after max deliveries, clearing flag', {
      agentName: workingAgent.agent_name,
      targetVersion: effectiveForceVersion,
      deliveredCount: workingAgent.force_update_delivered_count,
    })
    await clearForceUpdateFlag(supabase, workingAgent.id, null)
    return { handled: false }
  }

  const deliveryAttempt = workingAgent.force_update_delivered_count + 1
  const now = new Date().toISOString()
  await supabase
    .from('agents')
    .update({
      force_update_delivered_count: deliveryAttempt,
      force_update_first_delivered_at: workingAgent.force_update_first_delivered_at || now,
    })
    .eq('id', workingAgent.id)

  const response = await buildForceUpdateResponse(
    supabase,
    workingAgent,
    effectiveForceVersion,
    effectiveForceReason,
    platform,
    origin,
    supabaseUrl,
    deliveryAttempt,
    currentVersion,
    deliveryOptions,
  )

  return response ? { handled: true, response } : { handled: false }
}

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

  if (currentVersion && normalizeVersion(currentVersion) === normalizeVersion(latestRelease.version)) {
    logger.warn('Self-heal recovered version matches current agent version, clearing stale flag', {
      agentName: agent.agent_name,
      currentVersion,
      recoveredVersion: latestRelease.version,
    })
    await clearForceUpdateFlag(supabase, agent.id, 'auto_cleared_version_matched_on_recovery')
    return null
  }

  const reason = agent.force_update_reason || 'Recovered from pending force_update_at without version'
  await supabase.from('agents')
    .update({ force_update_version: latestRelease.version, force_update_reason: reason })
    .eq('id', agent.id)

  logger.warn('Recovered missing force_update_version from latest active release', {
    agentName: agent.agent_name,
    targetVersion: latestRelease.version,
    platform,
  })

  return { version: latestRelease.version, reason }
}

export async function maybeAutoArmSameVersionRemediation(
  supabase: SupabaseClient,
  agent: AgentContext,
  updateData: AgentUpdate,
  currentVersion: string | undefined,
  platform: string,
): Promise<AutoRemediationResult | null> {
  if (platform !== 'windows' || !currentVersion) return null

  const agentState = updateData.state || agent.state || null
  if (!agentState || !AUTO_REMEDIATION_STATES.has(agentState)) return null

  const currentNorm = normalizeVersion(currentVersion)
  const minNorm = normalizeVersion(MIN_FORCE_UPDATE_VERSION)
  if (!currentNorm || !minNorm || currentNorm < minNorm) return null

  const lastAppliedMs = agent.last_forced_update_applied
    ? new Date(agent.last_forced_update_applied).getTime()
    : null
  if (lastAppliedMs !== null && Date.now() - lastAppliedMs < AUTO_REMEDIATION_COOLDOWN_MS) {
    logger.info('Skipping same-version TOCTOU auto-remediation during cooldown', {
      agentName: agent.agent_name,
      currentVersion,
      agentState,
      lastForcedUpdateApplied: agent.last_forced_update_applied,
    })
    return null
  }

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

  const latestNorm = normalizeVersion(latestRelease.version)
  if (!latestNorm || latestNorm !== currentNorm) return null

  const forceUpdateAt = new Date().toISOString()
  const overrideSafeModeExpiresAt = new Date(Date.now() + AUTO_REMEDIATION_OVERRIDE_WINDOW_MS).toISOString()
  const reason = 'Auto-remediation: re-deliver patched script to recover TOCTOU loop'

  const { error } = await supabase
    .from('agents')
    .update({
      force_update_version: latestRelease.version,
      force_update_reason: reason,
      force_update_at: forceUpdateAt,
      force_update_override_safe_mode: true,
      force_update_override_safe_mode_expires_at: overrideSafeModeExpiresAt,
    })
    .eq('id', agent.id)

  if (error) {
    logger.warn('Failed to arm same-version TOCTOU auto-remediation', {
      agentName: agent.agent_name,
      currentVersion,
      error: error.message,
    })
    return null
  }

  logger.warn('Auto-armed same-version force_update for TOCTOU remediation', {
    agentName: agent.agent_name,
    currentVersion,
    targetVersion: latestRelease.version,
    agentState,
  })

  return {
    version: latestRelease.version,
    reason,
    forceUpdateAt,
    overrideSafeMode: true,
    overrideSafeModeExpiresAt,
    omitPayloadSignature: true,
  }
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
  options: ForceUpdateDeliveryOptions = {},
): Promise<Response | null> {
  logger.info('Force update detected for agent', {
    agentName: agent.agent_name,
    targetVersion,
    deliveryAttempt,
  })

  const { data: release } = await supabase
    .from('agent_releases')
    .select('id, version, script_content, sha256, signature_base64, signed_at, signed_by')
    .eq('version', targetVersion)
    .eq('platform', platform)
    .eq('is_active', true)
    .single()

  if (!release) {
    logger.warn('Force update version not found in agent_releases', {
      agentName: agent.agent_name,
      targetVersion,
      platform,
    })
    return null
  }

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
      agentName: agent.agent_name,
      targetVersion,
    })
    return null
  }

  const headerMatch = prepared.content.match(/CyberShield\s+Agent\s*[-?]\s*\w+\s+v?([\d]+\.[\d]+)/i)
  const scriptMajor = headerMatch?.[1] || ''
  const targetMajor = normalizeVersion(targetVersion)?.split('.').slice(0, 2).join('.') || ''

  if (headerMatch && scriptMajor !== targetMajor) {
    logger.error('Script version mismatch! DB content does not match target version', {
      agentName: agent.agent_name,
      scriptHeader: scriptMajor,
      targetVersion,
      hint: 'Use upload-release-content to fix the script_content in agent_releases',
    })
    return null
  }

  const resignResult = await resignIfNeeded({
    sha256: prepared.sha256,
    originalSignature: release.signature_base64,
    originalSignedAt: release.signed_at,
    originalSignedBy: release.signed_by || null,
    contentChanged: prepared.changed,
    logContext: { agentName: agent.agent_name, targetVersion, scope: 'heartbeat/force-update' },
  })

  const signatureBase64 = options.omitPayloadSignature ? null : resignResult.signatureBase64
  const signedAt = options.omitPayloadSignature ? null : resignResult.signedAt
  const overrideSafeMode = options.overrideSafeMode ?? !!(
    agent.force_update_override_safe_mode &&
    (!options.overrideSafeModeExpiresAt
      ? !agent.force_update_override_safe_mode_expires_at || new Date(agent.force_update_override_safe_mode_expires_at) > new Date()
      : new Date(options.overrideSafeModeExpiresAt) > new Date())
  )

  logger.info('Sending force update via heartbeat response', {
    agentName: agent.agent_name,
    targetVersion: release.version,
    platform,
    deliveryAttempt,
    hasSignature: !!signatureBase64,
    omitPayloadSignature: !!options.omitPayloadSignature,
    skipFirewallRemediation: agent.skip_firewall_remediation,
    sha256: `${prepared.sha256.substring(0, 16)}...`,
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
      expected_sha256: prepared.sha256,
      signature_timestamp: signedAt,
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
      heartbeat_interval_seconds: 30,
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
