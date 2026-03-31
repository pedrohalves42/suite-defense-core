/**
 * Heartbeat Edge Function — Thin Orchestrator
 * 
 * Maintains Deno.serve() for raw body access (HMAC verification).
 * All business logic is delegated to focused modules:
 * - auth/hmac-validator.ts  → HMAC + version-gated enforcement
 * - parser/heartbeat-parser.ts → Payload parsing + AgentUpdate construction
 * - state-updater.ts → DB writes (agent status, metrics, processes)
 * - force-update.ts → Force-update decision logic + delivery
 * - response-builder.ts → Normal response construction
 * 
 * ~130 lines (down from 791).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { handleException } from '../_shared/error-handler.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logger } from '../_shared/logger.ts'
import { requireEnv } from '../_shared/env.ts'
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts'
import { authenticateAgent } from '../_shared/agent-auth.ts'
import { buildCorsHeaders } from '../_shared/cors.ts'

import { validateHeartbeatHmac } from './auth/hmac-validator.ts'
import { parseHeartbeatPayload, buildAgentUpdate } from './parser/heartbeat-parser.ts'
import { updateAgentStatus, executeParallelOps } from './state-updater.ts'
import { processForceUpdate } from './force-update.ts'
import { buildNormalResponse } from './response-builder.ts'
import type { AgentContext } from './types.ts'

// Extra agent fields needed for force-update logic
const HEARTBEAT_EXTRA_FIELDS = [
  'status', 'skip_firewall_remediation', 'agent_version',
  'force_update_version', 'force_update_reason', 'force_update_at',
  'force_update_override_safe_mode', 'force_update_override_safe_mode_expires_at',
  'force_update_delivered_count', 'force_update_first_delivered_at',
  'last_forced_update_applied',
]

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const traceId = req.headers.get('X-Trace-ID') || req.headers.get('X-Request-ID') || crypto.randomUUID()

  if (req.method === 'OPTIONS') return handleCorsPreflightRequest()

  const methodError = validateHttpMethod(req, ['POST'])
  if (methodError) return methodError

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL')
    const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl, supabaseKey)

    // ── 1. Authenticate agent ───────────────────────────────
    const authResult = await authenticateAgent(supabase, req, 'heartbeat', {
      extraAgentFields: HEARTBEAT_EXTRA_FIELDS,
    })
    if (!authResult.success) return authResult.response

    const agent: AgentContext = {
      id: authResult.agent.id,
      agent_name: authResult.agent.agent_name,
      hmac_secret: authResult.agent.hmac_secret,
      tenant_id: authResult.agent.tenant_id,
      status: (authResult.agentData.status as string) || '',
      skip_firewall_remediation: (authResult.agentData.skip_firewall_remediation as boolean) || false,
      agent_version: (authResult.agentData.agent_version as string | null) || null,
      force_update_version: (authResult.agentData.force_update_version as string | null) || null,
      force_update_reason: (authResult.agentData.force_update_reason as string | null) || null,
      force_update_at: (authResult.agentData.force_update_at as string | null) || null,
      force_update_override_safe_mode: (authResult.agentData.force_update_override_safe_mode as boolean) || false,
      force_update_override_safe_mode_expires_at: (authResult.agentData.force_update_override_safe_mode_expires_at as string | null) || null,
      force_update_delivered_count: (authResult.agentData.force_update_delivered_count as number) || 0,
      force_update_first_delivered_at: (authResult.agentData.force_update_first_delivered_at as string | null) || null,
      last_forced_update_applied: (authResult.agentData.last_forced_update_applied as string | null) || null,
    }

    // ── 2. HMAC validation ──────────────────────────────────
    if (!agent.hmac_secret) {
      logger.error('CRITICAL SECURITY: Agent without HMAC secret', { agentName: agent.agent_name })
      return new Response(
        JSON.stringify({ error: 'HMAC secret not configured for agent' }),
        { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
      )
    }

    const hmacResult = await validateHeartbeatHmac(
      supabase, req, agent.agent_name, agent.hmac_secret, agent.agent_version, origin,
    )
    if (!hmacResult.ok) return hmacResult.errorResponse!

    // ── 3. Parse payload ────────────────────────────────────
    const osInfo = parseHeartbeatPayload(hmacResult.rawBody)
    const updateData = buildAgentUpdate(osInfo, agent.agent_version)
    const platform = updateData.os_type || 'windows'

    // ── 4. Rate limiting ────────────────────────────────────
    const rateLimitResult = await checkRateLimit(supabase, agent.agent_name, 'heartbeat', {
      maxRequests: 6, windowMinutes: 5, blockMinutes: 2,
    })
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit excedido', resetAt: rateLimitResult.resetAt }),
        { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
      )
    }

    logger.debug('Heartbeat received', { agentName: agent.agent_name, traceId })

    // ── 5. Update agent status + parallel side-effects ──────
    await updateAgentStatus(supabase, agent.id, agent.agent_name, updateData)
    await executeParallelOps(supabase, agent, osInfo)

    // ── 6. Force-update check ───────────────────────────────
    const forceResult = await processForceUpdate(
      supabase, agent, updateData, osInfo.agent_version, platform, origin, supabaseUrl,
    )
    if (forceResult.handled && forceResult.response) return forceResult.response

    // ── 7. Normal response ──────────────────────────────────
    return await buildNormalResponse(
      supabase, agent, updateData, osInfo.agent_version, platform, origin,
    )
  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'heartbeat')
  }
})
