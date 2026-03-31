/**
 * HMAC validation module for heartbeat.
 * Extracts HMAC verification logic into a testable unit.
 * Maintains Deno.serve() raw body access at caller level.
 */

import { verifyHmacSignature } from '../../_shared/hmac.ts'
import { normalizeVersion } from '../../_shared/hexagonal/update-decision-service.ts'
import { logger } from '../../_shared/logger.ts'
import { buildCorsHeaders } from '../../_shared/cors.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'

const HMAC_REQUIRED_MIN_VERSION = '5.0.12'

export interface HmacValidationResult {
  /** Whether validation passed (or was skipped for legacy) */
  ok: boolean;
  /** Raw body text for further parsing */
  rawBody: string;
  /** Pre-built error Response if ok=false */
  errorResponse?: Response;
}

/**
 * Determine if agent version requires HMAC enforcement.
 */
export function isModernAgent(agentVersion: string | null): boolean {
  const currentNormV = normalizeVersion(agentVersion || '')
  const hmacMinNormV = normalizeVersion(HMAC_REQUIRED_MIN_VERSION)
  return !!(currentNormV && hmacMinNormV && currentNormV >= hmacMinNormV)
}

/**
 * Validate HMAC signature for a heartbeat request.
 * Handles version-gated enforcement: modern agents are blocked on failure,
 * legacy agents are accepted with warnings.
 */
export async function validateHeartbeatHmac(
  supabase: SupabaseClient,
  req: Request,
  agentName: string,
  hmacSecret: string,
  agentVersion: string | null,
  origin: string | null,
): Promise<HmacValidationResult> {
  const modern = isModernAgent(agentVersion)
  const hasHmacHeaders = !!(
    req.headers.get('X-HMAC-Signature') ||
    req.headers.get('X-Timestamp') ||
    req.headers.get('X-HMAC-Timestamp')
  )
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')

  // Case 1: HMAC headers present → verify
  if (hasHmacHeaders) {
    const hmacResult = await verifyHmacSignature(supabase, req, agentName, hmacSecret)

    if (!hmacResult.valid) {
      if (modern) {
        logger.error('SECURITY: HMAC verification FAILED for modern agent - BLOCKED', {
          agentName, agentVersion, errorCode: hmacResult.errorCode, ip,
        })
        return {
          ok: false,
          rawBody: '',
          errorResponse: new Response(
            JSON.stringify({ error: 'HMAC verification failed', code: 'HMAC_INVALID' }),
            { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
          ),
        }
      }
      // Legacy agent: accept with warning
      logger.warn('HMAC verification failed - accepting legacy agent (token-only)', {
        agentName, agentVersion, errorCode: hmacResult.errorCode, ip,
      })
      return { ok: true, rawBody: hmacResult.rawBody || '' }
    }

    return { ok: true, rawBody: hmacResult.rawBody || '' }
  }

  // Case 2: No HMAC headers
  if (modern) {
    logger.error('SECURITY: Modern agent sent heartbeat WITHOUT HMAC headers - BLOCKED', {
      agentName, agentVersion, ip,
    })
    return {
      ok: false,
      rawBody: '',
      errorResponse: new Response(
        JSON.stringify({ error: 'HMAC headers required', code: 'HMAC_MISSING' }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
      ),
    }
  }

  // Legacy agent without HMAC headers — read body manually
  let rawBody = ''
  try {
    rawBody = await req.clone().text()
  } catch (err) { logger.warn('[hmac-validator] Failed to read legacy body', err); rawBody = '' }

  logger.warn('Heartbeat accepted without HMAC (legacy agent)', {
    agentName, agentVersion, ip,
  })

  return { ok: true, rawBody }
}
