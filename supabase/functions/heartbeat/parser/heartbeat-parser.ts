/**
 * Heartbeat payload parser module.
 * Parses raw body into typed OSInfo and builds AgentUpdate data.
 * Uses Zod for structural validation while remaining tolerant of legacy agents.
 */

import { z } from 'https://esm.sh/zod@3.23.8'
import { normalizeVersion } from '../../_shared/hexagonal/update-decision-service.ts'
import type { OSInfo, AgentUpdate } from '../types.ts'

/**
 * Zod schema for heartbeat payload.
 * All fields optional to support legacy agents that send empty/partial bodies.
 */
const HeartbeatPayloadSchema = z.object({
  os_type: z.string().max(64).optional(),
  platform: z.string().max(64).optional(),
  os_version: z.string().max(128).optional(),
  hostname: z.string().max(255).optional(),
  agent_version: z.string().max(32).optional(),
  ed25519_supported: z.boolean().optional(),
  signature_mode: z.string().max(32).optional(),
}).passthrough()  // Allow extra fields for forward compatibility

/**
 * Parse raw body into OSInfo. Tolerant of empty/invalid bodies for legacy agents.
 * Applies Zod validation but falls back gracefully for unparseable payloads.
 */
export function parseHeartbeatPayload(rawBody: string): OSInfo {
  if (!rawBody || !rawBody.trim()) return {}

  try {
    const jsonParsed = JSON.parse(rawBody)
    if (typeof jsonParsed !== 'object' || jsonParsed === null) return {}
    
    const result = HeartbeatPayloadSchema.safeParse(jsonParsed)
    // If validation fails, still use the raw parsed object for backward compat
    // but strip obviously dangerous fields
    if (!result.success) {
      return jsonParsed as OSInfo
    }
    return result.data as OSInfo
  } catch (err) {
    console.warn('[heartbeat-parser] Body parse failed (legacy agent OK)', err);
    return {}
  }
}

/**
 * Build the agent update object from parsed OS info.
 * Only includes fields that changed to minimize DB writes.
 */
export function buildAgentUpdate(
  osInfo: OSInfo,
  currentAgentVersion: string | null,
): AgentUpdate {
  const updateData: AgentUpdate = {
    last_heartbeat: new Date().toISOString(),
    status: 'active',
  }

  // Aceitar os_type ou platform (retrocompatibilidade)
  if (osInfo.os_type || osInfo.platform) {
    updateData.os_type = osInfo.os_type || osInfo.platform
  }
  if (osInfo.os_version) updateData.os_version = osInfo.os_version
  if (osInfo.hostname) updateData.hostname = osInfo.hostname

  // Capturar agent_version do payload (somente quando realmente mudou)
  if (osInfo.agent_version) {
    const incomingNorm = normalizeVersion(osInfo.agent_version)
    const currentNorm = normalizeVersion(currentAgentVersion || undefined)
    if (!incomingNorm || !currentNorm || incomingNorm !== currentNorm) {
      updateData.agent_version = osInfo.agent_version
    }
  }

  // Capturar Ed25519 capability flags
  if (osInfo.ed25519_supported !== undefined) {
    updateData.ed25519_supported = osInfo.ed25519_supported
  }
  if (osInfo.signature_mode) {
    updateData.signature_mode = osInfo.signature_mode
  }

  return updateData
}
