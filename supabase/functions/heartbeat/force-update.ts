import { normalizeVersion } from '../_shared/hexagonal/update-decision-service.ts'
import { prepareAgentScriptContent } from '../_shared/agent-script-preparation.ts'
import { resignIfNeeded } from '../_shared/script-resigner.ts'
import { logger } from '../_shared/logger.ts'
import { buildCorsHeaders } from '../_shared/cors.ts'
import { SupabaseAgentReleaseRepository } from '../_shared/infrastructure/deployment/adapters/supabase-agent-release.repository.ts'
import { ForceUpdateUseCase } from '../_shared/domain/deployment/use-cases/force-update.use-case.ts'
import type { AgentContext, AgentUpdate } from './types.ts'

interface ForceUpdateResult {
  handled: boolean;
  response?: Response;
}

export async function processForceUpdate(
  supabase: any,
  agent: AgentContext,
  updateData: AgentUpdate,
  agentVersionFromPayload: string | undefined,
  platform: string,
  origin: string | null,
  supabaseUrl: string,
): Promise<ForceUpdateResult> {
  const currentVersion = agentVersionFromPayload || updateData.agent_version;
  const agentState = updateData.state || agent.state || null;
  
  const repository = new SupabaseAgentReleaseRepository(supabase);
  const useCase = new ForceUpdateUseCase(repository);

  const { agent: updatedAgent, release, options, shouldDeliver } = await useCase.execute(
    agent as any,
    currentVersion || 'unknown',
    platform,
    agentState
  );

  if (!shouldDeliver || !release) {
    return { handled: false };
  }

  const response = await buildForceUpdateResponse(
    supabase,
    updatedAgent as any,
    release,
    updatedAgent.force_update_reason,
    platform,
    origin,
    supabaseUrl,
    updatedAgent.force_update_delivered_count,
    currentVersion,
    options as any
  );

  return response ? { handled: true, response } : { handled: false };
}

async function buildForceUpdateResponse(
  supabase: any,
  agent: AgentContext,
  release: any,
  reason: string | null,
  platform: string,
  origin: string | null,
  supabaseUrl: string,
  deliveryAttempt: number,
  currentVersion: string | undefined,
  options: any = {},
): Promise<Response | null> {
  logger.info('Force update detected for agent', {
    agentName: agent.agent_name,
    targetVersion: release.version,
    deliveryAttempt,
  })

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
      targetVersion: release.version,
    })
    return null
  }

  const headerMatch = prepared.content.match(/CyberShield\s+Agent\s*[-?]\s*\w+\s+v?([\d]+\.[\d]+)/i)
  const scriptMajor = headerMatch?.[1] || ''
  const targetMajor = normalizeVersion(release.version)?.split('.').slice(0, 2).join('.') || ''

  if (headerMatch && scriptMajor !== targetMajor) {
    logger.error('Script version mismatch! DB content does not match target version', {
      agentName: agent.agent_name,
      scriptHeader: scriptMajor,
      targetVersion: release.version,
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
    logContext: { agentName: agent.agent_name, targetVersion: release.version, scope: 'heartbeat/force-update' },
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
      heartbeat_interval_seconds: 120,
      poll_interval_seconds: 120,
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
