import { logger } from './logger.ts';
import { timingSafeEqual } from './crypto-utils.ts';

// Timing-safe comparison for strings
export { timingSafeEqual };

export interface HmacVerificationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
  transient?: boolean;
  rawBody?: string;
  modeUsed?: string;
  serverTimeMs?: number;
  skewSeconds?: number;
  receivedTimestamp?: number;
  maxSkewSeconds?: number;
}

/**
 * Convert HEX string to Uint8Array (32 bytes for SHA-256)
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
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
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function parseTimestampToMs(rawTimestamp: string): number | null {
  const parsed = Number.parseInt(rawTimestamp, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed < 1e12 ? parsed * 1000 : parsed;
}

interface PayloadVariant {
  payload: string;
  sep: ':';
  fmt: 'raw';
  mode: 'strict_colon_raw';
}

// ── In-memory CryptoKey cache (avoids re-importing same key material) ──
// P3 hardening: Storing Promises to prevent race conditions during concurrent imports
const cryptoKeyCache = new Map<string, { promise: Promise<CryptoKey>; ts: number }>();
const CRYPTO_KEY_TTL_MS = 10 * 60 * 1000; // 10 min
const MAX_CACHE_ENTRIES = 500;

function pruneCache<T>(cache: Map<string, { ts: number } & T>, maxEntries: number) {
  if (cache.size <= maxEntries) return;
  const now = Date.now();
  // Sort by age and prune oldest if necessary, or just remove expired
  for (const [key, entry] of cache.entries()) {
    if ((now - entry.ts) > CRYPTO_KEY_TTL_MS || cache.size > maxEntries) {
      cache.delete(key);
    }
  }
}

async function getCryptoKey(keyData: Uint8Array, keyName: string): Promise<CryptoKey> {
  // P3 FIX: Include a digest of the key data to prevent cross-agent cache collisions
  const keyDigest = await crypto.subtle.digest('SHA-256', keyData);
  const keyHash = Array.from(new Uint8Array(keyDigest)).map(b => b.toString(16).padStart(2, '0')).join('');
  const cacheKey = `${keyName}:${keyHash}`;
  const now = Date.now();
  const cached = cryptoKeyCache.get(cacheKey);

  if (cached && (now - cached.ts) < CRYPTO_KEY_TTL_MS) {
    // Reuse the in-flight or resolved Promise — race-safe.
    return cached.promise;
  }

  // Create the import Promise WITHOUT re-reading the cache inside (which
  // would deadlock by awaiting our own entry).
  const promise = crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  pruneCache(cryptoKeyCache, MAX_CACHE_ENTRIES);
  cryptoKeyCache.set(cacheKey, { promise, ts: now });

  // If import fails, evict so the next caller retries instead of caching a rejected Promise.
  promise.catch(() => {
    const current = cryptoKeyCache.get(cacheKey);
    if (current && current.promise === promise) cryptoKeyCache.delete(cacheKey);
  });

  return promise;
}

/**
 * Compute HMAC-SHA256 and return hex string
 */
async function computeHmacHex(cryptoKey: CryptoKey, message: string): Promise<string> {
  const messageData = new TextEncoder().encode(message);
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function timingSafeHexCompare(a: string, b: string): Promise<boolean> {
  return await timingSafeEqual(a.toLowerCase(), b.toLowerCase());
}

/**
 * Try a single key+payload variant. Returns true on match.
 */
async function tryVariant(
  cryptoKey: CryptoKey,
  variant: PayloadVariant,
  signature: string,
): Promise<boolean> {
  const expected = await computeHmacHex(cryptoKey, variant.payload);
  return timingSafeHexCompare(signature, expected);
}

export async function verifyHmacSignature(
  supabase: any,
  request: Request,
  agentName: string,
  hmacSecret: string,
  context?: AuthFailureContext,
): Promise<HmacVerificationResult> {
  const signatureRaw = request.headers.get('X-HMAC-Signature')?.trim();
  const signature = signatureRaw?.toLowerCase();

  const timestampCandidates = uniqueNonEmpty([request.headers.get('X-HMAC-Timestamp')]);
  const nonceCandidates = uniqueNonEmpty([request.headers.get('X-HMAC-Nonce')]);

  const serverTimeMs = Date.now();

  if (!signature || timestampCandidates.length === 0 || nonceCandidates.length === 0) {
    return {
      valid: false,
      errorCode: 'AUTH_MISSING_HEADERS',
      errorMessage: 'Missing strict HMAC headers (X-HMAC-Signature, X-HMAC-Timestamp, X-HMAC-Nonce)',
      transient: false,
      serverTimeMs,
    };
  }

  // ── 1. Replay protection (deferred to atomic insert on match) ──

  // ── 2. Read body once ─────────────────────────────────────
  let body = '';
  try {
    body = await request.clone().text();
  } catch {
    body = '';
  }

  // ── 3. Build key material ─────────────────────────────────
  const keyVariants: { name: string; data: Uint8Array }[] = [];
  try {
    keyVariants.push({ name: 'hex', data: hexToBytes(hmacSecret) });
  } catch {
    // Strict mode rejects non-HEX secrets instead of trying UTF-8 fallbacks.
  }

  if (keyVariants.length === 0) {
    return {
      valid: false,
      errorCode: 'AUTH_INVALID_SECRET_FORMAT',
      errorMessage: 'Invalid HMAC secret. Agent must be reinstalled with a valid 64-character HEX secret.',
      transient: false,
    };
  }

  // ── 4. Strict payload format: `${timestamp}:${nonce}:${rawBody}` only.
  // ── 5. Build payload variant generator ────────────────────
  const buildPayloadVariant = (timestamp: string, nonce: string): PayloadVariant => ({
    payload: `${timestamp}:${nonce}:${body}`,
    sep: ':',
    fmt: 'raw',
    mode: 'strict_colon_raw',
  });

  // ── 6. Verification loop — FAST PATH then SLOW PATH ───────
  // P3: Dynamic skew based on tenant policy (fallback to 5m)
  let maxDiffMs = 5 * 60 * 1000;
  if (resolvedTenantId) {
    const { data: policy } = await supabase
      .from('tenant_security_policies')
      .select('max_clock_skew_seconds')
      .eq('tenant_id', resolvedTenantId)
      .maybeSingle();
    if (policy?.max_clock_skew_seconds) {
      maxDiffMs = policy.max_clock_skew_seconds * 1000;
    }
  }

  let closestSkewSeconds: number | null = null;
  let closestTimestamp: number | undefined;
  let hasTimestampInRange = false;

  // Pre-import all CryptoKeys in parallel (max 2, not per-variant)
  const importedKeys = await Promise.all(
    keyVariants.map(async (kv) => ({ 
      name: kv.name, 
      key: await getCryptoKey(kv.data, kv.name) 
    }))
  );

  const onMatch = async (keyName: string, variant: PayloadVariant): Promise<HmacVerificationResult> => {
    // Atomic replay protection: check + insert in one DB call (eliminates TOCTOU)
    const { data: recorded, error: rpcError } = await supabase.rpc('hmac_check_and_record', {
      p_signature: signature,
      p_agent_name: agentName,
    });

    if (rpcError) {
      logger.error(`[HMAC] CRITICAL: Atomic replay check failed for agent ${agentName}`, {
        error: rpcError.message,
        code: rpcError.code,
      });
      // Fail-closed: reject if we can't guarantee uniqueness
      return {
        valid: false,
        errorCode: 'AUTH_REPLAY_CHECK_FAILED',
        errorMessage: 'Replay protection check failed',
        transient: true,
      };
    }

    if (recorded === false) {
      return {
        valid: false,
        errorCode: 'AUTH_REPLAY_DETECTED',
        errorMessage: 'Assinatura ja utilizada (replay attack detectado)',
        transient: false,
      };
    }

    // Strict mode avoids per-request HMAC format-cache writes; replay protection remains atomic.


    return { valid: true, rawBody: body, modeUsed: 'strict_colon_raw' };
  };

  for (const timestamp of timestampCandidates) {
    const requestTime = parseTimestampToMs(timestamp);
    if (!requestTime) continue;

    const skewMs = Math.abs(serverTimeMs - requestTime);
    const skewSeconds = skewMs / 1000;

    if (closestSkewSeconds === null || skewSeconds < closestSkewSeconds) {
      closestSkewSeconds = skewSeconds;
      closestTimestamp = requestTime;
    }

    if (skewMs > maxDiffMs) continue;
    hasTimestampInRange = true;

    for (const nonce of nonceCandidates) {
      const variant = buildPayloadVariant(timestamp, nonce);
      for (const ik of importedKeys) {
        if (await tryVariant(ik.key, variant, signature)) {
          return await onMatch(ik.name, variant);
        }
      }
    }
  }

  // ── 7. Failure handling ───────────────────────────────────
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
      });
    }

    return {
      valid: false,
      errorCode: 'AUTH_TIMESTAMP_OUT_OF_RANGE',
      errorMessage: `Timestamp expirado (skew: ${closestSkewSeconds.toFixed(1)}s, max: ${maxDiffMs / 1000}s)`,
      transient: true,
      serverTimeMs,
      skewSeconds: closestSkewSeconds,
      receivedTimestamp: closestTimestamp,
      maxSkewSeconds: maxDiffMs / 1000,
    };
  }

  logger.error('[HMAC] Signature verification failed', {
    agent: agentName,
    error_code: 'AUTH_INVALID_SIGNATURE',
    has_timestamp_hmac: !!request.headers.get('X-HMAC-Timestamp'),
    has_nonce_hmac: !!request.headers.get('X-HMAC-Nonce'),
    bodyLength: body.length,
    mode: 'strict_colon_raw',
  });

  return {
    valid: false,
    rawBody: body,
    errorCode: 'AUTH_INVALID_SIGNATURE',
    errorMessage: 'Invalid strict HMAC signature (payload/secret/header mismatch)',
    transient: false,
    serverTimeMs,
  };
}


// HMAC signature cleanup moved to run_system_maintenance() cron (every 30 min).

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

const authFailureCache = new Map<string, { ts: number }>();
const AUTH_FAILURE_LOG_INTERVAL_MS = 5 * 60 * 1000;
const MAX_AUTH_FAILURE_CACHE = 1000;

async function logAuthFailure(supabase: any, data: AuthFailureLogData): Promise<void> {
  const cacheKey = `${data.agentId}:${data.errorCode}`;
  const now = Date.now();
  const cached = authFailureCache.get(cacheKey);

  if (cached && (now - cached.ts) < AUTH_FAILURE_LOG_INTERVAL_MS) {
    return;
  }
  
  pruneCache(authFailureCache, MAX_AUTH_FAILURE_CACHE);
  authFailureCache.set(cacheKey, { ts: now });

  try {
    const evidencePayload = JSON.stringify({
      errorCode: data.errorCode,
      skewSeconds: data.skewSeconds,
      serverTimeMs: data.serverTimeMs,
      receivedTimestamp: data.receivedTimestamp,
      ip: data.ip,
      endpoint: data.endpoint,
      timestamp: new Date().toISOString(),
    });

    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(evidencePayload));
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
        endpoint: data.endpoint,
      },
    });

    authFailureCache.set(cacheKey, { ts: now });
  } catch (error) {
    logger.warn('[HMAC] Failed to log auth failure (non-blocking)', error);
  }
}
