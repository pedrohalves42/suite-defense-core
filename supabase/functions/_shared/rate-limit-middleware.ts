/**
 * Rate Limiting Middleware for Edge Functions
 * Integrates with existing check_rate_limit_atomic RPC
 * Uses the shared rate-limit.ts pattern
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { checkRateLimit } from './rate-limit.ts'

export interface RateLimitMiddlewareConfig {
  /** Endpoint category for rate limit lookup */
  endpoint: string
  /** Max requests per window (default: 60) */
  maxRequests?: number
  /** Window in minutes (default: 1) */
  windowMinutes?: number
  /** Block duration in minutes when limit exceeded (default: 5) */
  blockMinutes?: number
}

/**
 * Extracts a stable identifier from the request for rate limiting.
 * Priority: user_id (from JWT) > tenant_id (from header) > IP address
 */
export function extractIdentifier(req: Request, userId?: string | null, tenantId?: string | null): string {
  if (userId) return `user:${userId}`
  if (tenantId) return `tenant:${tenantId}`
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  return `ip:${ip}`
}

/**
 * Apply rate limiting to a request. Returns headers and allowed status.
 */
export async function applyRateLimit(
  supabase: SupabaseClient,
  req: Request,
  config: RateLimitMiddlewareConfig,
  userId?: string | null,
  tenantId?: string | null
): Promise<{ allowed: boolean; headers: Record<string, string>; retryAfter?: number }> {
  const identifier = extractIdentifier(req, userId, tenantId)

  const result = await checkRateLimit(supabase, identifier, config.endpoint, {
    maxRequests: config.maxRequests ?? 60,
    windowMinutes: config.windowMinutes ?? 1,
    blockMinutes: config.blockMinutes ?? 5,
  })

  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(config.maxRequests ?? 60),
    'X-RateLimit-Remaining': String(result.remainingRequests ?? 0),
  }

  if (result.resetAt) {
    headers['X-RateLimit-Reset'] = String(Math.floor(result.resetAt.getTime() / 1000))
  }

  if (!result.allowed) {
    const retryAfter = result.resetAt
      ? Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000))
      : 60
    headers['Retry-After'] = String(retryAfter)
    return { allowed: false, headers, retryAfter }
  }

  return { allowed: true, headers }
}

/**
 * Convenience wrapper: returns a 429 Response if blocked, or null if allowed.
 * Adds rate-limit headers to whatever response the caller builds.
 */
export async function enforceRateLimit(
  supabase: SupabaseClient,
  req: Request,
  config: RateLimitMiddlewareConfig,
  userId?: string | null,
  tenantId?: string | null
): Promise<Response | null> {
  const { allowed, headers, retryAfter } = await applyRateLimit(supabase, req, config, userId, tenantId)

  if (!allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        retry_after: retryAfter,
      }),
      {
        status: 429,
        headers: { ...headers, 'Content-Type': 'application/json' },
      }
    )
  }

  return null // Allowed ? caller continues
}
