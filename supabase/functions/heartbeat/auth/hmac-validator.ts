/**
 * HMAC validation module for heartbeat.
 * Extracts HMAC verification logic into a testable unit.
 * v7.0 HARDENED: All agents require valid HMAC — no legacy fallback.
 */

import { verifyHmacSignature } from '../../_shared/hmac.ts'
import { normalizeVersion } from '../../_shared/hexagonal/update-decision-service.ts'
import { logger } from '../../_shared/logger.ts'
import { buildCorsHeaders } from '../../_shared/cors.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'

const HMAC_REQUIRED_MIN_VERSION = '5.0.12'

export interface HmacValidationResult {
  /** Whether validation passed */
  ok: boolean;
  /** Raw body text for further parsing */
  rawBody: string;
  /** Pre-built error Response if ok=false */
  errorResponse?: Response;
}

/**
 * Determine if agent version is >= HMAC_REQUIRED_MIN_VERSION.
 * Kept for backward compatibility and tests.
 */
export function isModernAgent(agentVersion: string | null): boolean {
  const currentNormV = normalizeVersion(agentVersion || '')
  const hmacMinNormV = normalizeVersion(HMAC_REQUIRED_MIN_VERSION)
  return !!(currentNormV && hmacMinNormV && currentNormV >= hmacMinNormV)
}

/**
 * Validate HMAC signature for a heartbeat request.
 * v7.0: All agents are blocked on missing or invalid HMAC.
 */
export async function validateHeartbeatHmac(
  supabase: SupabaseClient,
  req: Request,
  agentName: string,
  hmacSecret: string,
  agentVersion: string | null,
  origin: string | null,
): Promise<HmacValidationResult> {
  const hasHmacHeaders = !!(
    req.headers.get('X-HMAC-Signature') ||
    req.headers.get('X-Timestamp') ||
    req.headers.get('X-HMAC-Timestamp')
  )
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')

  // No HMAC headers → reject immediately
  if (!hasHmacHeaders) {
    logger.error('SECURITY: Agent heartbeat WITHOUT HMAC headers - BLOCKED', {
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

  // Verify HMAC signature
  const hmacResult = await verifyHmacSignature(supabase, req, agentName, hmacSecret)

  if (!hmacResult.valid) {
    logger.error('SECURITY: HMAC verification FAILED - BLOCKED', {
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

  return { ok: true, rawBody: hmacResult.rawBody || '' }
}
