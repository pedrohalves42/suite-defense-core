import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from './logger.ts';

export interface HmacVerificationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
  transient?: boolean;
  rawBody?: string;  // Body lido durante a verificacao
  modeUsed?: string;
  // Clock skew recovery fields (Fase 2)
  serverTimeMs?: number;
  skewSeconds?: number;
  receivedTimestamp?: number;
  maxSkewSeconds?: number;
}

/**
 * Verifica assinatura HMAC com codigos de erro estruturados
 */
/**
 * Convert HEX string to Uint8Array (32 bytes for SHA-256)
 * CRITICAL: This ensures compatibility with PowerShell/Bash agents that use HEX encoding
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  
  // Validate HEX format (64 characters = 32 bytes)
  if (!/^[0-9a-f]{64}$/i.test(clean)) {
    throw new Error(`Invalid HMAC secret format: expected 64 hex chars, got ${clean.length}`);
  }
  
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 64; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  
  return bytes;
}

export interface AuthFailureContext {
  agentId?: string;
  tenantId?: string;
  endpoint?: string;
  ip?: string;
}

function uniqueNonEmpty(values: Array<string | null>): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = value?.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function parseTimestampToMs(rawTimestamp: string): number | null {
  const parsed = Number.parseInt(rawTimestamp, 10)
  if (!Number.isFinite(parsed)) return null

  // Compat: alguns agentes enviam segundos, outros milissegundos
  return parsed < 1e12 ? parsed * 1000 : parsed
}

interface PayloadVariant {
  payload: string
  sep: ':' | '.'
  fmt: 'raw' | 'compact'
  mode: string
}

export async function verifyHmacSignature(
  supabase: SupabaseClient,
  request: Request,
  agentName: string,
  hmacSecret: string,
  context?: AuthFailureContext
): Promise<HmacVerificationResult> {
  const signatureRaw = request.headers.get('X-HMAC-Signature')?.trim()
  const signature = signatureRaw?.toLowerCase()

  // Padronizacao: priorizar headers explicitos X-HMAC-* e aceitar legacy X-*
  const timestampCandidates = uniqueNonEmpty([
    request.headers.get('X-HMAC-Timestamp'),
    request.headers.get('X-Timestamp'),
  ])
  const nonceCandidates = uniqueNonEmpty([
    request.headers.get('X-HMAC-Nonce'),
    request.headers.get('X-Nonce'),
  ])

  const serverTimeMs = Date.now()

  if (!signature || timestampCandidates.length === 0 || nonceCandidates.length === 0) {
    return {
      valid: false,
      errorCode: 'AUTH_MISSING_HEADERS',
      errorMessage: 'Headers HMAC ausentes (X-HMAC-Signature, X-HMAC-Timestamp|X-Timestamp, X-HMAC-Nonce|X-Nonce)',
      transient: false,
      serverTimeMs,
    }
  }

  // Replay protection
  const { data: usedSignature } = await supabase
    .from('hmac_signatures')
    .select('id')
    .eq('signature', signature)
    .order('used_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (usedSignature) {
    return {
      valid: false,
      errorCode: 'AUTH_REPLAY_DETECTED',
      errorMessage: 'Assinatura ja utilizada (replay attack detectado)',
      transient: false,
    }
  }

  // Body idempotente para nao consumir req original
  let body = ''
  try {
    body = await request.clone().text()
  } catch (err) {
    console.warn('[hmac] Failed to read request body', err);
    body = ''
  }

  let compactBody = body
  try {
    if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
      compactBody = JSON.stringify(JSON.parse(body))
    }
  } catch {
    compactBody = body
  }

  const buildPayloadVariants = (
    timestamp: string,
    nonce: string,
    cached?: { separator: string; body_format: string } | null,
  ): PayloadVariant[] => {
    const variants: PayloadVariant[] = [
      { payload: `${timestamp}:${nonce}:${body}`, sep: ':', fmt: 'raw', mode: 'strict_colon_raw' },
    ]

    // Compat legacy: manter fallback sem quebrar agentes antigos
    if (compactBody !== body) {
      variants.push({ payload: `${timestamp}:${nonce}:${compactBody}`, sep: ':', fmt: 'compact', mode: 'colon_compact' })
    }
    variants.push({ payload: `${timestamp}.${nonce}.${body}`, sep: '.', fmt: 'raw', mode: 'dot_raw_legacy' })
    if (compactBody !== body) {
      variants.push({ payload: `${timestamp}.${nonce}.${compactBody}`, sep: '.', fmt: 'compact', mode: 'dot_compact_legacy' })
    }

    if (!cached) return variants

    return [...variants].sort((a, b) => {
      const score = (variant: PayloadVariant) =>
        (variant.sep === cached.separator ? 2 : 0) + (variant.fmt === cached.body_format ? 1 : 0)
      return score(b) - score(a)
    })
  }

  // Key variants
  const encoder = new TextEncoder()
  const keyVariants: { name: string; data: Uint8Array }[] = []

  try {
    keyVariants.push({ name: 'hex', data: hexToBytes(hmacSecret) })
  } catch {
    // skip invalid hex, fallback to utf8 variant
  }
  keyVariants.push({ name: 'utf8', data: encoder.encode(hmacSecret) })

  if (keyVariants.length === 0) {
    return {
      valid: false,
      errorCode: 'AUTH_INVALID_SECRET_FORMAT',
      errorMessage: 'HMAC secret invalido. Agente deve ser reinstalado com secret HEX valido.',
      transient: false,
    }
  }

  // Cache de formato para reduzir tentativas e manter compatibilidade
  let cachedFormat: { key_encoding: string; separator: string; body_format: string } | null = null
  let resolvedTenantId: string | null = context?.tenantId ?? null

  if (context?.agentId) {
    // If caller did not pass tenantId, resolve it once from agents table
    if (!resolvedTenantId) {
      const { data: agentRow } = await supabase
        .from('agents')
        .select('tenant_id')
        .eq('id', context.agentId)
        .maybeSingle()
      resolvedTenantId = agentRow?.tenant_id ?? null
    }

    const { data: cache } = await supabase
      .from('agent_hmac_format_cache')
      .select('key_encoding, separator, body_format')
      .eq('agent_id', context.agentId)
      .maybeSingle()
    if (cache) cachedFormat = cache
  }

  const orderedKeys = cachedFormat
    ? [
        ...keyVariants.filter((k) => k.name === cachedFormat!.key_encoding),
        ...keyVariants.filter((k) => k.name !== cachedFormat!.key_encoding),
      ]
    : keyVariants

  const maxDiffMs = 5 * 60 * 1000
  let closestSkewSeconds: number | null = null
  let closestTimestamp: number | undefined
  let hasTimestampInRange = false

  for (const timestamp of timestampCandidates) {
    const requestTime = parseTimestampToMs(timestamp)
    if (!requestTime) continue

    const skewMs = Math.abs(serverTimeMs - requestTime)
    const skewSeconds = skewMs / 1000

    if (closestSkewSeconds === null || skewSeconds < closestSkewSeconds) {
      closestSkewSeconds = skewSeconds
      closestTimestamp = requestTime
    }

    if (skewMs > maxDiffMs) {
      continue
    }

    hasTimestampInRange = true

    for (const nonce of nonceCandidates) {
      const payloadVariants = buildPayloadVariants(timestamp, nonce, cachedFormat)

      for (const keyVariant of orderedKeys) {
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          keyVariant.data.buffer as ArrayBuffer,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        )

        for (const variant of payloadVariants) {
          const messageData = encoder.encode(variant.payload)
          const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
          const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')

          // SECURITY FIX: timing-safe comparison to prevent timing attacks
          // Use constant-time XOR comparison (both are hex strings of same hash algo, so fixed length)
          const sigBytes = new TextEncoder().encode(signature);
          const expectedBytes = new TextEncoder().encode(expectedSignature);
          let diff = sigBytes.length ^ expectedBytes.length;
          const len = Math.min(sigBytes.length, expectedBytes.length);
          for (let i = 0; i < len; i++) {
            diff |= sigBytes[i] ^ expectedBytes[i];
          }
          const isMatch = diff === 0;
          if (isMatch) {
            const { error: insertError } = await supabase.from('hmac_signatures').insert({
              signature,
              agent_name: agentName,
            })

            if (insertError) {
              logger.error(`[HMAC] CRITICAL: Failed to store signature for agent ${agentName}`, {
                error: insertError.message,
                code: insertError.code,
              })
            }

            if (context?.agentId && resolvedTenantId) {
              supabase.from('agent_hmac_format_cache').upsert(
                {
                  agent_id: context.agentId,
                  tenant_id: resolvedTenantId,
                  key_encoding: keyVariant.name,
                  separator: variant.sep,
                  body_format: variant.fmt,
                  last_verified_at: new Date().toISOString(),
                  hit_count: 1,
                },
                { onConflict: 'agent_id' }
              ).then(({ error }) => {
                if (error) logger.warn('[HMAC] Cache update failed', { error: error.message })
              })
            }

            return { valid: true, rawBody: body, modeUsed: variant.mode }
          }
        }
      }
    }
  }

  if (!hasTimestampInRange && closestSkewSeconds !== null) {
    if (context?.agentId && context?.tenantId) {
      await logAuthFailure(supabase, {
        agentId: context.agentId,
        agentName,
        tenantId: context.tenantId,
        errorCode: 'AUTH_TIMESTAMP_OUT_OF_RANGE',
        skewSeconds: closestSkewSeconds,
        endpoint: context.endpoint || 'unknown',
        ip: context.ip || request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        serverTimeMs,
        receivedTimestamp: closestTimestamp,
      })
    }

    return {
      valid: false,
      errorCode: 'AUTH_TIMESTAMP_OUT_OF_RANGE',
      errorMessage: `Timestamp expirado (skew: ${closestSkewSeconds.toFixed(1)}s, max: 300s)`,
      transient: true,
      serverTimeMs,
      skewSeconds: closestSkewSeconds,
      receivedTimestamp: closestTimestamp,
      maxSkewSeconds: 300,
    }
  }

  logger.error('[HMAC] Signature verification failed', {
    agent: agentName,
    error_code: 'AUTH_INVALID_SIGNATURE',
    has_timestamp_hmac: !!request.headers.get('X-HMAC-Timestamp'),
    has_timestamp_legacy: !!request.headers.get('X-Timestamp'),
    has_nonce_hmac: !!request.headers.get('X-HMAC-Nonce'),
    has_nonce_legacy: !!request.headers.get('X-Nonce'),
    bodyLength: body.length,
    mode: 'payload_mismatch',
  })

  return {
    valid: false,
    rawBody: body,
    errorCode: 'AUTH_INVALID_SIGNATURE',
    errorMessage: 'Assinatura HMAC invalida (payload/secret/header mismatch)',
    transient: false,
    serverTimeMs,
  }
}


// HMAC signature cleanup moved to run_system_maintenance() cron (every 30 min).
// Removed from hot path to save ~120 queries/min (was 20% of all requests).

/**
 * Gera HMAC secret para novo agente
 */
export function generateHmacSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Log auth failure to agent_evidence_logs for dashboard visibility
 * Includes rate limiting to avoid flooding (max 1 log per agent per 5 minutes)
 */
interface AuthFailureLogData {
  agentId: string;
  agentName: string;
  tenantId: string;
  errorCode: string;
  skewSeconds?: number;
  endpoint: string;
  ip: string;
  serverTimeMs: number;
  receivedTimestamp?: number;
}

// In-memory cache for rate limiting auth failure logs
const authFailureCache = new Map<string, number>();
const AUTH_FAILURE_LOG_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function logAuthFailure(supabase: SupabaseClient, data: AuthFailureLogData): Promise<void> {
  const cacheKey = `${data.agentId}:${data.errorCode}`;
  const now = Date.now();
  const lastLogged = authFailureCache.get(cacheKey);
  
  // Rate limit: only log once per agent per error code per 5 minutes
  if (lastLogged && (now - lastLogged) < AUTH_FAILURE_LOG_INTERVAL_MS) {
    return;
  }
  
  try {
    // Generate evidence hash
    const evidencePayload = JSON.stringify({
      errorCode: data.errorCode,
      skewSeconds: data.skewSeconds,
      serverTimeMs: data.serverTimeMs,
      receivedTimestamp: data.receivedTimestamp,
      ip: data.ip,
      endpoint: data.endpoint,
      timestamp: new Date().toISOString()
    });
    
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(evidencePayload));
    const evidenceHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    await supabase.from('agent_evidence_logs').insert({
      agent_id: data.agentId,
      agent_name: data.agentName,
      tenant_id: data.tenantId,
      event_type: 'auth_failure',
      severity: data.errorCode === 'AUTH_TIMESTAMP_OUT_OF_RANGE' ? 'high' : 'medium',
      evidence_hash: evidenceHash,
      event_data: {
        errorCode: data.errorCode,
        errorMessage: data.errorCode === 'AUTH_TIMESTAMP_OUT_OF_RANGE' 
          ? `Relogio do computador fora de sincronia (${data.skewSeconds?.toFixed(1) || '?'}s de diferenca)`
          : 'Falha de autenticacao HMAC',
        skewSeconds: data.skewSeconds,
        serverTimeMs: data.serverTimeMs,
        receivedTimestamp: data.receivedTimestamp,
        maxSkewSeconds: 300,
        ip: data.ip,
        endpoint: data.endpoint
      }
    });
    
    authFailureCache.set(cacheKey, now);
    logger.info(`[HMAC] Auth failure logged for ${data.agentName}: ${data.errorCode}`);
  } catch (error) {
    // Non-blocking - don't fail the request if logging fails
    logger.warn('[HMAC] Failed to log auth failure (non-blocking)', error);
  }
}
