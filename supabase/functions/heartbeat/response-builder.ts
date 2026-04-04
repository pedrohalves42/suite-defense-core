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
 *
 * Cost-optimized: single DB query for release data (script_content + signature).
 * Security: script_sha256 is only sent when a valid Ed25519 signature exists.
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
  let scriptHashSignedAt: string | null = null
  let forceHashResync = false

  try {
    const currentVersion = agentVersionFromPayload || updateData.agent_version
    if (currentVersion) {
      // Single query: fetch script_content AND signature in one round-trip
      const { data: release } = await supabase
        .from('agent_releases')
        .select('script_content, signature_base64, signed_at')
        .eq('version', currentVersion)
        .eq('platform', platform)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (release?.script_content && release.signature_base64) {
        // Only compute hash when signature exists (prevents TOCTOU false positives)
        let script = release.script_content

        if (platform === 'windows' || platform === 'Windows') {
          const hotfixResult = applyWindowsScriptHotfix(script)
          if (hotfixResult.changed) {
            script = hotfixResult.content
          }
        }

        const isWindows = platform === 'windows' || platform === 'Windows'
        const normalizedScript = isWindows
          ? normalizeForWindows(script)
          : script.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const scriptBytes = new TextEncoder().encode(normalizedScript)
        const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes)
        safeScriptSha256 = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0')).join('')
        scriptHashSignedAt = release.signed_at || null
      }
    }
  } catch (hashError) {
    logger.warn('Failed to compute script hash for heartbeat', {
      agentName: agent.agent_name, error: (hashError as Error).message,
    })
  }

  // Detect agents needing hash resync: only when agent reported a degraded state
  // or when we have a valid hash to send (avoids pointless resync signals)
  if (safeScriptSha256 && agent.status === 'online') {
    try {
      const { data: agentState } = await supabase
        .from('agents')
        .select('state')
        .eq('id', agent.id)
        .single()

      // Only signal resync for agents in problematic states
      const degradedStates = ['SAFE_MODE', 'DEGRADED', 'INITIALIZING']
      if (agentState?.state && degradedStates.includes(agentState.state)) {
        forceHashResync = true
      }
    } catch (resyncError) {
      logger.warn('Failed to evaluate hash resync', {
        agentName: agent.agent_name, error: (resyncError as Error).message,
      })
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      agent: agent.agent_name,
      timestamp: new Date().toISOString(),
      script_sha256: safeScriptSha256,
      script_hash_signed_at: scriptHashSignedAt,
      force_hash_resync: forceHashResync,
      heartbeat_interval_seconds: 60,
      poll_interval_seconds: 30,
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
