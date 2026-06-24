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
 *
 * D3 (Bloco D — type safety): @ts-nocheck removed. Runtime is unchanged;
 * only typings, narrowing helpers, and the extra-fields allowlist were
 * tightened to align with D1 (agent-auth) and D2 (state-updater).
 */

// Declare EdgeRuntime for Deno/Supabase environment
declare const EdgeRuntime: { waitUntil?: (promise: Promise<unknown>) => void } | undefined

import { logger } from '../_shared/logger.ts'
import { requireEnv } from '../_shared/env.ts'
import { serveAgent } from '../_shared/serve-agent.ts'
import type { AgentExtraField } from '../_shared/agent-auth.ts'

import { parseHeartbeatPayload, buildAgentUpdate } from './parser/heartbeat-parser.ts'
import {
  updateAgentStatus,
  executeParallelOps,
  TELEMETRY_THROTTLE_MS,
  type HeartbeatUpdateData,
} from './state-updater.ts'
import { processForceUpdate } from './force-update.ts'
import { buildNormalResponse } from './response-builder.ts'
import type { AgentContext } from './types.ts'

/**
 * Extra agent fields needed for delta-updates and force-update logic.
 *
 * HOTFIX-AUTH-01: 'metadata_hash' removed — column does not exist on
 * public.agents and was causing PostgREST to fail the
 * agent_tokens → agents!inner join with a "column agents_1.metadata_hash
 * does not exist" error, surfacing as false 401s.
 *
 * D3: typed via the D1 allowlist (`AgentExtraField`). Any field outside
 * the allowlist (or absent from the agents table) fails typecheck here.
 * 'status' is not listed because it is already part of the base agent
 * selection in agent-auth.ts.
 */
const HEARTBEAT_EXTRA_FIELDS = [
  'skip_firewall_remediation', 'agent_version', 'hostname', 'os_type', 'os_version',
  'state', 'agent_state', 'ed25519_supported', 'signature_mode',
  'force_update_version', 'force_update_reason', 'force_update_at',
  'force_update_override_safe_mode', 'force_update_override_safe_mode_expires_at',
  'force_update_delivered_count', 'force_update_first_delivered_at',
  'last_forced_update_applied', 'last_telemetry_at', 'last_heartbeat',
] as const satisfies ReadonlyArray<AgentExtraField>

/** Narrow an unknown agentData[key] to string|null without leaking `any`. */
function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}
function asNullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}
function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback
}

serveAgent(async (req, ctx) => {
  const handlerStart = Date.now()
  const { requestId, supabase, agentData, rawBody } = ctx
  const traceId = requestId
  const origin = req.headers.get('origin')
  const supabaseUrl = requireEnv('SUPABASE_URL')

  // ── [hb-diag] Structured entry log ──────────────────────
  // Emitted ONLY after auth + HMAC have passed (serveAgent gates both).
  // Used to diagnose why last_heartbeat is/isn't updated per tenant/agent.
  const sourceIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')
    || 'unknown'
  const ua = req.headers.get('user-agent') || 'unknown'
  logger.info('[hb-diag] heartbeat reached handler', {
    traceId,
    tenantId: ctx.tenantId,
    agentId: ctx.agentId,
    agentName: ctx.agentName,
    auth: 'ok',
    hmac: 'ok',
    sourceIp,
    userAgent: ua.slice(0, 80),
    prevLastHeartbeat: asNullableString(agentData.last_heartbeat),
    prevAgentVersion: asNullableString(agentData.agent_version),
    prevStatus: asNullableString(agentData.status),
    bodyBytes: rawBody?.length ?? 0,
  })

  // BUG 23: Guard against missing tenant_id (security and logic consistency)
  if (!ctx.tenantId) {
    logger.error('[hb-diag] CRITICAL: tenantId missing from context', {
      traceId, agentId: ctx.agentId, agentName: ctx.agentName,
    })
    return new Response(
      JSON.stringify({ error: 'Unauthorized: missing tenant context' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Context construction for internal modules
  const agent: AgentContext = {
    id: ctx.agentId,
    agent_name: ctx.agentName,
    hmac_secret: ctx.hmacSecret || '',
    tenant_id: ctx.tenantId,
    status: asNullableString(agentData.status) || '',
    os_type: asNullableString(agentData.os_type),
    os_version: asNullableString(agentData.os_version),
    hostname: asNullableString(agentData.hostname),
    ed25519_supported: asNullableBoolean(agentData.ed25519_supported),
    signature_mode: asNullableString(agentData.signature_mode),
    skip_firewall_remediation: asBoolean(agentData.skip_firewall_remediation),
    agent_version: asNullableString(agentData.agent_version),
    force_update_version: asNullableString(agentData.force_update_version),
    force_update_reason: asNullableString(agentData.force_update_reason),
    force_update_at: asNullableString(agentData.force_update_at),
    force_update_override_safe_mode: asBoolean(agentData.force_update_override_safe_mode),
    force_update_override_safe_mode_expires_at: asNullableString(
      agentData.force_update_override_safe_mode_expires_at,
    ),
    force_update_delivered_count: asNumber(agentData.force_update_delivered_count),
    force_update_first_delivered_at: asNullableString(agentData.force_update_first_delivered_at),
    last_forced_update_applied: asNullableString(agentData.last_forced_update_applied),
    last_telemetry_at: asNullableString(agentData.last_telemetry_at),
    last_heartbeat: asNullableString(agentData.last_heartbeat),
    state: asNullableString(agentData.state) ?? undefined,
    agent_state: asNullableString(agentData.agent_state) ?? undefined,
    metadata_hash: null, // HOTFIX-AUTH-01: column not persisted; echoed from incoming payload only
    version: asNumber(agentData.version, 1),
  }

  // ── 1. HMAC validation ──────────────────────────────────
  // CENTRALIZED: serveAgent's hmacVerify guarantees rawBody when enabled.
  if (rawBody === undefined) {
    logger.error('CRITICAL: rawBody missing from ctx. Ensure hmacVerify: true is set in serveAgent options.')
    return new Response(
      JSON.stringify({ error: 'Auth context error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // ── 2. Parse payload ────────────────────────────────────
  const osInfo = parseHeartbeatPayload(rawBody)
  const updateData: HeartbeatUpdateData = buildAgentUpdate(osInfo, agent)
  const platform = updateData.os_type || 'windows'

  logger.debug('Heartbeat received', { agentName: agent.agent_name, traceId })

  // ── 3. Update agent status (critical path) ──────────────
  // Use a more precise check to prevent redundant telemetry inserts in high-frequency scenarios
  const lastInsert = agent.last_telemetry_at ? new Date(agent.last_telemetry_at).getTime() : 0
  const driftBufferMs = 1000 // Small buffer for clock drift
  const shouldInsertTelemetry = (Date.now() - lastInsert) >= (TELEMETRY_THROTTLE_MS - driftBufferMs)

  // Use agent's high-precision timestamp if available, else fallback to server now
  const telemetryTimestamp = osInfo.collected_at || new Date().toISOString()

  if (shouldInsertTelemetry) {
    updateData.last_telemetry_at = telemetryTimestamp
  }

  // Always include a timestamp for the update to support idempotency in RPC
  updateData.update_timestamp = telemetryTimestamp
  // Pass current state for efficient dirty-checking (avoids extra round-trip)
  updateData._current_agent = {
    version: asNumber(agentData.version, 1),
    last_heartbeat: asNullableString(agentData.last_heartbeat),
  }

  await updateAgentStatus(supabase, agent.id, agent.agent_name, updateData, agent.last_heartbeat)
  logger.info('[hb-diag] agent status updated', {
    traceId,
    tenantId: agent.tenant_id,
    agentId: agent.id,
    agentName: agent.agent_name,
    telemetryInserted: shouldInsertTelemetry,
    telemetryTimestamp,
    platform,
    newAgentVersion: osInfo.agent_version || null,
  })

  // ── 4. Force-update check (critical path) ───────────────
  const forceResult = await processForceUpdate(
    supabase, agent, updateData, osInfo.agent_version, platform, origin, supabaseUrl,
  )
  if (forceResult.handled && forceResult.response) {
    logger.info('[hb-diag] heartbeat completed (force-update path)', {
      traceId,
      tenantId: agent.tenant_id,
      agentId: agent.id,
      agentName: agent.agent_name,
      durationMs: Date.now() - handlerStart,
      forceUpdate: true,
    })
    return forceResult.response
  }

  // ── 5. Build response ───────────────────────────────────
  const response = await buildNormalResponse(
    supabase, agent, updateData, osInfo.agent_version, platform, origin,
  )

  // ── 6. COST-OPT: Defer side-effects ─────────────────────
  const bgWork = executeParallelOps(supabase, agent, osInfo, shouldInsertTelemetry)
    .catch((e: unknown) => logger.warn('Deferred work failed', {
      error: e instanceof Error ? e.message : String(e),
      agentName: agent.agent_name,
      traceId,
    }))

  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(bgWork)
  } else {
    // If not in EdgeRuntime (e.g. local dev), we MUST await to prevent data loss
    await bgWork
  }

  logger.info('[hb-diag] heartbeat completed', {
    traceId,
    tenantId: agent.tenant_id,
    agentId: agent.id,
    agentName: agent.agent_name,
    durationMs: Date.now() - handlerStart,
    forceUpdate: false,
  })
  return response
}, {
  extraAgentFields: HEARTBEAT_EXTRA_FIELDS,
  hmacVerify: true,
  rateLimit: {
    endpoint: 'heartbeat',
    maxRequests: 30,
    windowMinutes: 10,
    blockMinutes: 2,
  },
})
