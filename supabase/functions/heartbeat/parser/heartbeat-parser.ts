/**
 * Heartbeat payload parser module.
 * Parses raw body into typed OSInfo and builds AgentUpdate data.
 */

import { normalizeVersion } from '../../_shared/hexagonal/update-decision-service.ts'
import type { OSInfo, AgentUpdate } from '../types.ts'

/**
 * Parse raw body into OSInfo. Tolerant of empty/invalid bodies for legacy agents.
 */
export function parseHeartbeatPayload(rawBody: string): OSInfo {
  if (!rawBody || !rawBody.trim()) return {}

  try {
    const parsed = JSON.parse(rawBody)
    return typeof parsed === 'object' && parsed !== null ? parsed as OSInfo : {}
  } catch {
    // Body vazio ou invalido é OK para heartbeats legacy
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
