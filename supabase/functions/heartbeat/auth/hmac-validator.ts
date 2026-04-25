/**
 * HMAC validation module for heartbeat.
 * v7.1 HARDENED: All agents require valid HMAC — no legacy fallback.
 * Removed isModernAgent (dead code after v7.0 unified enforcement).
 */

import { verifyHmacSignature } from '../../_shared/hmac.ts'
import { logger } from '../../_shared/logger.ts'
import { buildCorsHeaders } from '../../_shared/cors.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'

export interface HmacValidationResult {
  /** Whether validation passed */
  ok: boolean;
  /** Raw body text for further parsing */
  rawBody: string;
  /** Pre-built error Response if ok=false */
  errorResponse?: Response;
}

/**
 * Validate HMAC signature for a heartbeat request.
 * All agents are blocked on missing or invalid HMAC.
 */
export async function validateHeartbeatHmac(
  supabase: any,
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
