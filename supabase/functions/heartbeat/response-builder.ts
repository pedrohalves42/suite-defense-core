/**
 * Response builder module for heartbeat.
 * Constructs the normal (non-force-update) heartbeat response.
 */

import { normalizeForWindows } from '../_shared/hexagonal/update-decision-service.ts'
import { applyWindowsScriptHotfix } from '../_shared/windows-script-hotfix.ts'
import { logger } from '../_shared/logger.ts'
import { buildCorsHeaders } from '../_shared/cors.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import type { AgentContext, AgentUpdate } from './types.ts'

/**
 * Build the normal heartbeat response.
 * Includes current script hash for self-heal and config flags.
 */
export async function buildNormalResponse(
  supabase: SupabaseClient,
  agent: AgentContext,
  updateData: AgentUpdate,
  agentVersionFromPayload: string | undefined,
  platform: string,
  origin: string | null,
): Promise<Response> {
  // Compute current script hash for agent self-heal
  let currentScriptSha256: string | null = null
  let currentScriptHashSignedAt: string | null = null

  try {
    const currentVersion = agentVersionFromPayload || updateData.agent_version
    if (currentVersion) {
      const { data: currentRelease } = await supabase
        .from('agent_releases')
        .select('script_content, signed_at')
        .eq('version', currentVersion)
        .eq('platform', platform)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (currentRelease?.script_content) {
        let currentScript = currentRelease.script_content

        if (platform === 'windows' || platform === 'Windows') {
          const hotfixResult = applyWindowsScriptHotfix(currentScript)
          if (hotfixResult.changed) {
            currentScript = hotfixResult.content
          }
        }

        const isWindows = platform === 'windows' || platform === 'Windows'
        const normalizedScript = isWindows
          ? normalizeForWindows(currentScript)
          : currentScript.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const currentBytes = new TextEncoder().encode(normalizedScript)
        const hashBuffer = await crypto.subtle.digest('SHA-256', currentBytes)
        currentScriptSha256 = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0')).join('')
        currentScriptHashSignedAt = currentRelease.signed_at || null
      }
    }
  } catch (hashHealError) {
    logger.warn('Failed to compute current script hash for heartbeat self-heal', {
      agentName: agent.agent_name, error: (hashHealError as Error).message,
    })
  }

  // CRITICAL FIX: Never send script_sha256 until Ed25519 signing is fully implemented.
  // Sending an unsigned or incorrectly-normalized hash causes the agent to overwrite
  // its local cache, triggering TOCTOU false positives and crash-restart loops (Exit 9004).
  // The guard below is intentionally hardcoded to false — enable only when real
  // Ed25519 signatures are generated and stored in agent_releases.script_hash_signature.
  const hasValidSignature = false
  const safeScriptSha256 = null

  return new Response(
    JSON.stringify({
      ok: true,
      agent: agent.agent_name,
      timestamp: new Date().toISOString(),
      script_sha256: safeScriptSha256,
      script_hash_signature: null,
      script_hash_signed_at: hasValidSignature ? currentScriptHashSignedAt : null,
      heartbeat_interval_seconds: 600,
      poll_interval_seconds: 600,
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
