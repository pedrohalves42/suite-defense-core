/**
 * Heartbeat-specific rate-limit wrapper.
 * Encapsulates identifier construction and policy for heartbeat endpoint.
 * Reuses the shared in-memory cache from _shared/rate-limit.ts.
 */

import { checkRateLimit } from '../../_shared/rate-limit.ts'
import { logger } from '../../_shared/logger.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'

/** Heartbeat rate-limit policy: 6 requests per 5 minutes, block for 2 minutes */
const HEARTBEAT_RL_CONFIG = {
  maxRequests: 6,
  windowMinutes: 5,
  blockMinutes: 2,
} as const

/**
 * Check heartbeat-specific rate limit for an agent.
 * Returns the result from the shared checkRateLimit (with cache).
 */
export async function checkHeartbeatRateLimit(
  supabase: SupabaseClient,
  agentName: string,
) {
  const identifier = `agent:${agentName}`
  const endpoint = 'heartbeat'

  const result = await checkRateLimit(supabase, identifier, endpoint, HEARTBEAT_RL_CONFIG)

  if (!result.allowed) {
    logger.warn('Heartbeat rate-limited', {
      agentName,
      resetAt: result.resetAt?.toISOString(),
      remaining: result.remainingRequests,
    })
  }

  return result
}
