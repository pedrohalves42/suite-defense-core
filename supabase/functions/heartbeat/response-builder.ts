/**
 * Response builder module for heartbeat.
 * Constructs the normal (non-force-update) heartbeat response.
 */

import { prepareAgentScriptContent } from '../_shared/agent-script-preparation.ts'
import { resignIfNeeded } from '../_shared/script-resigner.ts'
import { logger } from '../_shared/logger.ts'
import { buildCorsHeaders } from '../_shared/cors.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import type { AgentContext, AgentUpdate } from './types.ts'

/**
 * Build the normal heartbeat response.
 * Includes current script hash for self-heal and config flags.
 *
 * Cost-optimized: single DB query for release data (script_content + signature).
 * Security: script_sha256 is only sent when a valid Ed25519 signature exists.
 *
 * FIX: Uses agentState from payload to decide resync (avoids extra DB query).
 * FIX: Accepts both 'active' and 'online' status for resync eligibility.
 * FIX: Returns script_hash_signature for Windows agents that require it.
 */
export async function buildNormalResponse(
  supabase: SupabaseClient,
  agent: AgentContext,
  updateData: AgentUpdate,
  agentVersionFromPayload: string | undefined,
  platform: string,
  origin: string | null,
): Promise<Response> {
  let safeScriptSha256: string | null = null
  let scriptHashSignature: string | null = null
  let scriptHashSignedAt: string | null = null
  let forceHashResync = false

  try {
    const currentVersion = agentVersionFromPayload || updateData.agent_version
    if (currentVersion) {
      // Single query: fetch script_content AND signature in one round-trip
      const { data: release } = await supabase
        .from('agent_releases')
        .select('id, script_content, sha256, signature_base64, signed_at')
        .eq('version', currentVersion)
        .eq('platform', platform)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (release?.script_content) {
        // Use canonical pipeline for hash computation (includes hotfix + normalize)
        const prepared = await prepareAgentScriptContent({
          supabase,
          releaseId: release.id,
          rawScriptContent: release.script_content,
          platform,
          requestId: `hb-${agent.agent_name}`,
          logScope: 'heartbeat/response-builder',
          persistIfChanged: true,
        })

        if (prepared) {
          const resignResult = await resignIfNeeded({
            sha256: prepared.sha256,
            originalSignature: release.signature_base64,
            originalSignedAt: release.signed_at,
            originalSignedBy: null,
            contentChanged: prepared.changed,
            logContext: { agentName: agent.agent_name, version: currentVersion, scope: 'heartbeat/response-builder' },
          })

          if (prepared.changed && resignResult.resigned && resignResult.signatureBase64 && resignResult.signedAt) {
            const { error: persistSignatureError } = await supabase
              .from('agent_releases')
              .update({
                signature_base64: resignResult.signatureBase64,
                signed_at: resignResult.signedAt,
                signed_by: resignResult.signedBy,
                sha256: prepared.sha256,
              })
              .eq('id', release.id)

            if (persistSignatureError) {
              logger.warn('Failed to persist re-signed script metadata for heartbeat', {
                agentName: agent.agent_name,
                version: currentVersion,
                error: persistSignatureError.message,
              })
            }
          }

          if (resignResult.signatureBase64) {
            safeScriptSha256 = prepared.sha256
            scriptHashSignature = resignResult.signatureBase64
            scriptHashSignedAt = resignResult.signedAt
          }
        }
      }
    }
  } catch (hashError) {
    logger.warn('Failed to compute script hash for heartbeat', {
      agentName: agent.agent_name, error: (hashError as Error).message,
    })
  }

  // Detect agents needing hash resync using state from the payload (cost-optimized: no extra DB query).
  // FIX: Accept both 'active' and 'online' status (heartbeat writes 'active', legacy uses 'online').
  if (safeScriptSha256) {
    const agentStatus = agent.status
    if (agentStatus === 'active' || agentStatus === 'online') {
      // Use state from updateData (payload) first, fallback to agent context
      const agentState = updateData.state || agent.state || null
      const degradedStates = ['SAFE_MODE', 'DEGRADED', 'INITIALIZING']
      if (agentState && degradedStates.includes(agentState)) {
        forceHashResync = true
        logger.info('Triggering force_hash_resync for degraded agent', {
          agentName: agent.agent_name, agentState, agentStatus,
        })
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      agent: agent.agent_name,
      timestamp: new Date().toISOString(),
      script_sha256: safeScriptSha256,
      script_hash_signature: scriptHashSignature,
      script_hash_signed_at: scriptHashSignedAt,
      expected_sha256: safeScriptSha256,
      signature_timestamp: scriptHashSignedAt,
      force_hash_resync: forceHashResync,
      heartbeat_interval_seconds: _getHeartbeatInterval(updateData.state || agent.state),
      poll_interval_seconds: _getPollInterval(updateData.state || agent.state),
      skip_firewall_remediation: agent.skip_firewall_remediation || false,
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

/**
 * Dynamic heartbeat interval based on agent state.
 * ENFORCING (stable) → 60s, degraded states → 30s (faster recovery).
 */
function _getHeartbeatInterval(agentState: string | null | undefined): number {
  const degradedStates = ['SAFE_MODE', 'DEGRADED', 'INITIALIZING']
  if (agentState && degradedStates.includes(agentState)) return 60
  return 120
}

function _getPollInterval(agentState: string | null | undefined): number {
  const degradedStates = ['SAFE_MODE', 'DEGRADED', 'INITIALIZING']
  if (agentState && degradedStates.includes(agentState)) return 30
  return 120
}
