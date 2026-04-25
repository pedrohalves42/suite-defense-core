import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from './logger.ts';

// Timing-safe comparison for strings
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

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
  sep: ':' | '.';
  fmt: 'raw' | 'compact';
  mode: string;
}

interface CachedFormat {
  key_encoding: string;
  separator: string;
  body_format: string;
}

// ── In-memory CryptoKey cache (avoids re-importing same key material) ──
const cryptoKeyCache = new Map<string, { key: CryptoKey; ts: number }>();
const CRYPTO_KEY_TTL_MS = 10 * 60 * 1000; // 10 min
const MAX_CACHE_ENTRIES = 500;

function pruneCache<T>(cache: Map<string, { ts: number } & T>, maxEntries: number) {
  if (cache.size <= maxEntries) return;
  const now = Date.now();
  // Remove expired or oldest
  const keys = Array.from(cache.keys());
  for (const key of keys) {
    const entry = cache.get(key);
    if (!entry || (now - entry.ts) > CRYPTO_KEY_TTL_MS || cache.size > maxEntries) {
      cache.delete(key);
    }
  }
}

async function getCryptoKey(keyData: Uint8Array, keyName: string): Promise<CryptoKey> {
  const cacheKey = `${keyName}:${keyData.length}`;
  const cached = cryptoKeyCache.get(cacheKey);
  const now = Date.now();
  
  if (cached && (now - cached.ts) < CRYPTO_KEY_TTL_MS) {
    return cached.key;
  }
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  
  pruneCache(cryptoKeyCache, MAX_CACHE_ENTRIES);
  cryptoKeyCache.set(cacheKey, { key, ts: now });
  return key;
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

/**
 * Timing-safe comparison of two hex signature strings.
 */
function timingSafeHexCompare(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const len = Math.min(aBytes.length, bBytes.length);
  for (let i = 0; i < len; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
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

  const timestampCandidates = uniqueNonEmpty([
    request.headers.get('X-HMAC-Timestamp'),
    request.headers.get('X-Timestamp'),
  ]);
  const nonceCandidates = uniqueNonEmpty([
    request.headers.get('X-HMAC-Nonce'),
    request.headers.get('X-Nonce'),
  ]);

  const serverTimeMs = Date.now();

  if (!signature || timestampCandidates.length === 0 || nonceCandidates.length === 0) {
    return {
      valid: false,
      errorCode: 'AUTH_MISSING_HEADERS',
      errorMessage: 'Headers HMAC ausentes (X-HMAC-Signature, X-HMAC-Timestamp|X-Timestamp, X-HMAC-Nonce|X-Nonce)',
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

  let compactBody = body;
  try {
    if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
      compactBody = JSON.stringify(JSON.parse(body));
    }
  } catch {
    compactBody = body;
  }

  // ── 3. Build key material ─────────────────────────────────
  const encoder = new TextEncoder();
  const keyVariants: { name: string; data: Uint8Array }[] = [];
  try {
    keyVariants.push({ name: 'hex', data: hexToBytes(hmacSecret) });
  } catch {
    // hex decode failed — will use utf8 only
  }
  keyVariants.push({ name: 'utf8', data: encoder.encode(hmacSecret) });

  if (keyVariants.length === 0) {
    return {
      valid: false,
      errorCode: 'AUTH_INVALID_SECRET_FORMAT',
      errorMessage: 'HMAC secret invalido. Agente deve ser reinstalado com secret HEX valido.',
      transient: false,
    };
  }

  // ── 4. Load format cache (single DB call) ─────────────────
  let cachedFormat: CachedFormat | null = null;
  let resolvedTenantId: string | null = context?.tenantId ?? null;

  if (context?.agentId) {
    if (!resolvedTenantId) {
      const { data: agentRow } = await supabase
        .from('agents')
        .select('tenant_id')
        .eq('id', context.agentId)
        .maybeSingle();
      resolvedTenantId = agentRow?.tenant_id ?? null;
    }

    const { data: cache } = await supabase
      .from('agent_hmac_format_cache')
      .select('key_encoding, separator, body_format')
      .eq('agent_id', context.agentId)
      .maybeSingle();
    if (cache) cachedFormat = cache;
  }

  // ── 5. Build payload variant generator ────────────────────
  const buildPayloadVariants = (
    timestamp: string,
    nonce: string,
  ): PayloadVariant[] => {
    const variants: PayloadVariant[] = [
      { payload: `${timestamp}:${nonce}:${body}`, sep: ':', fmt: 'raw', mode: 'strict_colon_raw' },
    ];
    if (compactBody !== body) {
      variants.push({ payload: `${timestamp}:${nonce}:${compactBody}`, sep: ':', fmt: 'compact', mode: 'colon_compact' });
    }
    variants.push({ payload: `${timestamp}.${nonce}.${body}`, sep: '.', fmt: 'raw', mode: 'dot_raw_legacy' });
    if (compactBody !== body) {
      variants.push({ payload: `${timestamp}.${nonce}.${compactBody}`, sep: '.', fmt: 'compact', mode: 'dot_compact_legacy' });
    }
    return variants;
  };

  // ── 6. Verification loop — FAST PATH then SLOW PATH ───────
  const maxDiffMs = 5 * 60 * 1000;
  let closestSkewSeconds: number | null = null;
  let closestTimestamp: number | undefined;
  let hasTimestampInRange = false;

  // Pre-import all CryptoKeys once (max 2, not per-variant)
  const importedKeys: { name: string; key: CryptoKey }[] = [];
  for (const kv of keyVariants) {
    importedKeys.push({ name: kv.name, key: await getCryptoKey(kv.data, kv.name) });
  }

  // Determine fast-path: if cache exists, try ONLY cached combo first
  // This reduces worst-case from 16 crypto ops to 1 for known agents
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

    // Update format cache (fire-and-forget)
    if (context?.agentId && resolvedTenantId) {
      supabase.from('agent_hmac_format_cache').upsert(
        {
          agent_id: context.agentId,
          tenant_id: resolvedTenantId,
          key_encoding: keyName,
          separator: variant.sep,
          body_format: variant.fmt,
          last_verified_at: new Date().toISOString(),
          hit_count: 1,
        },
        { onConflict: 'agent_id' },
      ).then(({ error }: { error: any }) => {
        if (error) logger.warn('[HMAC] Cache update failed', { error: error.message });
      });
    }

    return { valid: true, rawBody: body, modeUsed: variant.mode };
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
      // ── FAST PATH: try cached format only (1 crypto op) ───
      if (cachedFormat) {
        const cachedKey = importedKeys.find((k) => k.name === cachedFormat!.key_encoding);
        if (cachedKey) {
          const cachedSep = cachedFormat.separator as ':' | '.';
          const cachedFmt = cachedFormat.body_format as 'raw' | 'compact';
          const bodyForVariant = cachedFmt === 'compact' ? compactBody : body;
          const cachedPayload = `${timestamp}${cachedSep}${nonce}${cachedSep}${bodyForVariant}`;
          const cachedVariant: PayloadVariant = {
            payload: cachedPayload,
            sep: cachedSep,
            fmt: cachedFmt,
            mode: `cached_${cachedSep === ':' ? 'colon' : 'dot'}_${cachedFmt}`,
          };

          if (await tryVariant(cachedKey.key, cachedVariant, signature)) {
            return await onMatch(cachedKey.name, cachedVariant);
          }
        }
        // Cache miss — agent may have changed format. Fall through to slow path.
      }

      // ── SLOW PATH: try all variants (existing agents without cache, or cache miss)
      const allVariants = buildPayloadVariants(timestamp, nonce);

      for (const ik of importedKeys) {
        for (const variant of allVariants) {
          // Skip the combo we already tried in fast path
          if (cachedFormat &&
              ik.name === cachedFormat.key_encoding &&
              variant.sep === cachedFormat.separator &&
              variant.fmt === cachedFormat.body_format) {
            continue;
          }

          if (await tryVariant(ik.key, variant, signature)) {
            return await onMatch(ik.name, variant);
          }
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
      errorMessage: `Timestamp expirado (skew: ${closestSkewSeconds.toFixed(1)}s, max: 300s)`,
      transient: true,
      serverTimeMs,
      skewSeconds: closestSkewSeconds,
      receivedTimestamp: closestTimestamp,
      maxSkewSeconds: 300,
    };
  }

  logger.error('[HMAC] Signature verification failed', {
    agent: agentName,
    error_code: 'AUTH_INVALID_SIGNATURE',
    has_timestamp_hmac: !!request.headers.get('X-HMAC-Timestamp'),
    has_timestamp_legacy: !!request.headers.get('X-Timestamp'),
    has_nonce_hmac: !!request.headers.get('X-HMAC-Nonce'),
    has_nonce_legacy: !!request.headers.get('X-Nonce'),
    bodyLength: body.length,
    mode: cachedFormat ? 'cache_miss_all_variants' : 'no_cache_all_variants',
  });

  return {
    valid: false,
    rawBody: body,
    errorCode: 'AUTH_INVALID_SIGNATURE',
    errorMessage: 'Assinatura HMAC invalida (payload/secret/header mismatch)',
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

const authFailureCache = new Map<string, number>();
const AUTH_FAILURE_LOG_INTERVAL_MS = 5 * 60 * 1000;

async function logAuthFailure(supabase: any, data: AuthFailureLogData): Promise<void> {
  const cacheKey = `${data.agentId}:${data.errorCode}`;
  const now = Date.now();
  const lastLogged = authFailureCache.get(cacheKey);

  if (lastLogged && (now - lastLogged) < AUTH_FAILURE_LOG_INTERVAL_MS) {
    return;
  }

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

    authFailureCache.set(cacheKey, now);
  } catch (error) {
    logger.warn('[HMAC] Failed to log auth failure (non-blocking)', error);
  }
}
