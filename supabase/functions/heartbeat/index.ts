// @ts-nocheck
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
 * COST-OPT: Uses EdgeRuntime.waitUntil() to defer non-critical
 * side-effects (metrics, processes, token touch) to background,
 * reducing response time from ~2.2s to ~200ms.
 */

// Declare EdgeRuntime for Deno/Supabase environment
declare const EdgeRuntime: { waitUntil?: (promise: Promise<unknown>) => void } | undefined

import { createTypedClient } from '../_shared/supabase-client.ts'
import { logger } from '../_shared/logger.ts'
import { requireEnv } from '../_shared/env.ts'
import { serveAgent } from '../_shared/serve-agent.ts'

// Removed validateHeartbeatHmac import (now using serveAgent hmacVerify)
import { parseHeartbeatPayload, buildAgentUpdate } from './parser/heartbeat-parser.ts'
import { updateAgentStatus, executeParallelOps, TELEMETRY_THROTTLE_MS } from './state-updater.ts'
import { processForceUpdate } from './force-update.ts'
import { buildNormalResponse } from './response-builder.ts'
import type { AgentContext } from './types.ts'

// Extra agent fields needed for delta-updates and force-update logic
const HEARTBEAT_EXTRA_FIELDS = [
  'status', 'skip_firewall_remediation', 'agent_version', 'hostname', 'os_type', 'os_version',
  'force_update_version', 'force_update_reason', 'force_update_at',
  'force_update_override_safe_mode', 'force_update_override_safe_mode_expires_at',
  'force_update_delivered_count', 'force_update_first_delivered_at',
  'last_forced_update_applied', 'last_telemetry_at', 'last_heartbeat',
]

serveAgent(async (req, ctx) => {
  const { requestId, supabase: supabaseAny, agentData, rawBody } = ctx
  const traceId = requestId
  const supabase = supabaseAny
  const origin = req.headers.get('origin')
  const supabaseUrl = requireEnv('SUPABASE_URL')

  // Context construction for internal modules
  const agent: AgentContext = {
    id: ctx.agentId,
    agent_name: ctx.agentName,
    hmac_secret: ctx.hmacSecret || '',
    tenant_id: ctx.tenantId,
    status: (agentData.status as string) || '',
    os_type: (agentData.os_type as string | null) || null,
    os_version: (agentData.os_version as string | null) || null,
    hostname: (agentData.hostname as string | null) || null,
    ed25519_supported: (agentData.ed25519_supported as boolean | null) || null,
    signature_mode: (agentData.signature_mode as string | null) || null,
    skip_firewall_remediation: (agentData.skip_firewall_remediation as boolean) || false,
    agent_version: (agentData.agent_version as string | null) || null,
    force_update_version: (agentData.force_update_version as string | null) || null,
    force_update_reason: (agentData.force_update_reason as string | null) || null,
    force_update_at: (agentData.force_update_at as string | null) || null,
    force_update_override_safe_mode: (agentData.force_update_override_safe_mode as boolean) || false,
    force_update_override_safe_mode_expires_at: (agentData.force_update_override_safe_mode_expires_at as string | null) || null,
    force_update_delivered_count: (agentData.force_update_delivered_count as number) || 0,
    force_update_first_delivered_at: (agentData.force_update_first_delivered_at as string | null) || null,
    last_forced_update_applied: (agentData.last_forced_update_applied as string | null) || null,
    last_telemetry_at: (agentData.last_telemetry_at as string | null) || null,
    last_heartbeat: (agentData.last_heartbeat as string | null) || null,
  }

  // ── 1. HMAC validation ──────────────────────────────────
  // CENTRALIZED: Now uses serveAgent's hmacVerify. rawBody is guaranteed.
  if (rawBody === undefined) {
    logger.error('CRITICAL: rawBody missing from ctx. Ensure hmacVerify: true is set in serveAgent options.');
    return new Response(JSON.stringify({ error: 'Auth context error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // ── 2. Parse payload ────────────────────────────────────
  const osInfo = parseHeartbeatPayload(rawBody)
  const updateData = buildAgentUpdate(osInfo, agent)
  const platform = updateData.os_type || 'windows'

  logger.debug('Heartbeat received', { agentName: agent.agent_name, traceId })

  // ── 3. Update agent status (critical path) ──────────────
  // Use a more precise check to prevent redundant telemetry inserts in high-frequency scenarios
  const lastInsert = agent.last_telemetry_at ? new Date(agent.last_telemetry_at).getTime() : 0
  const driftBufferMs = 1000 // Small buffer for clock drift
  const shouldInsertTelemetry = (Date.now() - lastInsert) >= (TELEMETRY_THROTTLE_MS - driftBufferMs)
  
  if (shouldInsertTelemetry) {
    (updateData as any).last_telemetry_at = new Date().toISOString()
  }

  await updateAgentStatus(supabase, agent.id, agent.agent_name, updateData, agent.last_heartbeat)

  // ── 4. Force-update check (critical path) ───────────────
  const forceResult = await processForceUpdate(
    supabase, agent, updateData, osInfo.agent_version, platform, origin, supabaseUrl,
  )
  if (forceResult.handled && forceResult.response) return forceResult.response

  // ── 5. Build response ───────────────────────────────────
  const response = await buildNormalResponse(
    supabase, agent, updateData, osInfo.agent_version, platform, origin,
  )

  // ── 6. COST-OPT: Defer side-effects ─────────────────────
  const bgWork = executeParallelOps(supabase, agent, osInfo, shouldInsertTelemetry)
    .catch(e => logger.warn('Deferred work failed', { error: e.message, agentName: agent.agent_name }));
    
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    EdgeRuntime.waitUntil(bgWork)
  } else {
    // If not in EdgeRuntime (e.g. local dev), we MUST await to prevent data loss
    await bgWork
  }

  return response
}, {
  extraAgentFields: HEARTBEAT_EXTRA_FIELDS,
  hmacVerify: true,
  rateLimit: {
    endpoint: 'heartbeat',
    maxRequests: 30,
    windowMinutes: 10,
    blockMinutes: 2,
  }
})