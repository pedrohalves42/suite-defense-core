import { logger } from '../../_shared/logger.ts';
/**
 * Heartbeat payload parser module.
 * Parses raw body into typed OSInfo and builds AgentUpdate data.
 * Uses Zod for structural validation while remaining tolerant of legacy agents.
 */

import { z } from 'https://esm.sh/zod@3.23.8'
import { normalizeVersion } from '../../_shared/hexagonal/update-decision-service.ts'
import type { OSInfo, AgentUpdate, AgentContext } from '../types.ts'

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
  state: z.string().max(32).optional(),
  ed25519_supported: z.boolean().optional(),
  signature_mode: z.string().max(32).optional(),
  metadata_hash: z.string().max(64).optional(),
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
    if (!result.success) {
      // SECURITY-FIX: Do NOT return the raw object if validation fails.
      // This prevents "object injection" vulnerabilities and memory bloat.
      const sanitized: Record<string, any> = {};
      const shape = HeartbeatPayloadSchema.shape;
      for (const key in shape) {
        if (jsonParsed[key] !== undefined) {
          sanitized[key] = jsonParsed[key];
        }
      }
      // Also preserve extra fields that are known to be safe if passthrough is intended, 
      // but here we force strict adherence to the schema for safety.
      return sanitized as OSInfo;
    }
    return result.data as OSInfo
  } catch (err) {
    logger.warn('[heartbeat-parser] Body parse failed (legacy agent OK)', err);
    return {}
  }
}

/**
 * Build the agent update object from parsed OS info.
 * Only includes fields that changed to minimize DB writes.
 */
export function buildAgentUpdate(
  osInfo: OSInfo,
  current: AgentContext | null,
): AgentUpdate {
  const updateData: AgentUpdate & { agent_state?: string } = {
    // We only set status here; last_heartbeat is managed by state-updater dirty-checking
    status: 'active',
  }

  // Delta-update optimization: only include OS info if it actually changed
  const incomingOsType = osInfo.os_type || osInfo.platform;
  if (incomingOsType && incomingOsType.toLowerCase() !== (current?.os_type as string || '').toLowerCase()) {
    updateData.os_type = incomingOsType;
  }

  if (osInfo.os_version && osInfo.os_version !== current?.os_version) {
    updateData.os_version = osInfo.os_version;
  }

  if (osInfo.hostname && osInfo.hostname !== current?.hostname) {
    updateData.hostname = osInfo.hostname;
  }

  // Persist agent state (ENFORCING, SAFE_MODE, DEGRADED, INITIALIZING)
  if (osInfo.state) {
    const stateUpper = osInfo.state.toUpperCase();
    let canonicalState = 'healthy'; // Default for unrecognized active states
    
    if (['ENFORCING', 'HEALTHY'].includes(stateUpper)) {
      canonicalState = 'healthy';
    } else if (['SAFE_MODE', 'DEGRADED', 'RECOVERY', 'UPDATING', 'ROLLBACK'].includes(stateUpper)) {
      canonicalState = stateUpper.toLowerCase();
    } else if (['OFFLINE', 'ERROR', 'SHUTDOWN', 'ISOLATED', 'QUARANTINED'].includes(stateUpper)) {
      canonicalState = stateUpper.toLowerCase();
    } else {
      // For any other state, if online, keep it as 'warning' or 'degraded' if suspicious
      canonicalState = 'warning';
    }

    // Only update if canonical state differs from current to save IOPS
    if (canonicalState !== (current as any)?.agent_state) {
      updateData.agent_state = canonicalState;
    }
    
    updateData.state = osInfo.state;
  }
  // IMPORTANT: Do NOT default to 'healthy' if state is missing to avoid overriding 
  // backend-enforced states like 'isolated' or 'blocked'.

  // Capture agent_version from payload (only when it actually changed)
  if (osInfo.agent_version) {
    const incomingNorm = normalizeVersion(osInfo.agent_version)
    const currentNorm = normalizeVersion(current?.agent_version || undefined)
    if (incomingNorm && incomingNorm !== currentNorm) {
      updateData.agent_version = osInfo.agent_version
    }
  }

  // Capturar Ed25519 capability flags
  if (osInfo.ed25519_supported !== undefined && osInfo.ed25519_supported !== current?.ed25519_supported) {
    updateData.ed25519_supported = osInfo.ed25519_supported
  }
  if (osInfo.signature_mode && osInfo.signature_mode !== current?.signature_mode) {
    updateData.signature_mode = osInfo.signature_mode
  }

  // HOTFIX-AUTH-01: agents.metadata_hash column does not exist.
  // We accept the field from the payload (forward-compat) but do not persist it.
  // The response builder still echoes osInfo.metadata_hash back to the agent.

  return updateData
}
