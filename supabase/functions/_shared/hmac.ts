import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export interface HmacVerificationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
  transient?: boolean;
  rawBody?: string;  // Body lido durante a verificacao
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

export async function verifyHmacSignature(
  supabase: SupabaseClient,
  request: Request,
  agentName: string,
  hmacSecret: string,
  context?: AuthFailureContext
): Promise<HmacVerificationResult> {
  const signature = request.headers.get('X-HMAC-Signature');
  // COMPAT: Accept both X-Timestamp/X-Nonce (legacy) and X-HMAC-Timestamp/X-HMAC-Nonce (v5.0.3+)
  const timestamp = request.headers.get('X-Timestamp') || request.headers.get('X-HMAC-Timestamp');
  const nonce = request.headers.get('X-Nonce') || request.headers.get('X-HMAC-Nonce');
  const serverTimeMs = Date.now();

  if (!signature || !timestamp || !nonce) {
    return { 
      valid: false, 
      errorCode: 'AUTH_MISSING_HEADERS',
      errorMessage: 'Headers HMAC ausentes (X-HMAC-Signature, X-Timestamp, X-Nonce)',
      transient: false,
      serverTimeMs
    };
  }

  // Verificar timestamp (maximo 5 minutos de diferenca)
  // COMPAT: v5.0.3 agents send timestamp in SECONDS, legacy agents send in MILLISECONDS
  let requestTime = parseInt(timestamp);
  // Auto-detect: if timestamp < 1e12, it's in seconds; convert to ms
  if (requestTime < 1e12) {
    requestTime = requestTime * 1000;
  }
  const maxDiff = 5 * 60 * 1000; // 5 minutos
  const skewSeconds = Math.abs(serverTimeMs - requestTime) / 1000;

  if (Math.abs(serverTimeMs - requestTime) > maxDiff) {
    // Log auth failure to agent_evidence_logs for dashboard visibility
    if (context?.agentId && context?.tenantId) {
      await logAuthFailure(supabase, {
        agentId: context.agentId,
        agentName,
        tenantId: context.tenantId,
        errorCode: 'AUTH_TIMESTAMP_OUT_OF_RANGE',
        skewSeconds,
        endpoint: context.endpoint || 'unknown',
        ip: context.ip || request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        serverTimeMs,
        receivedTimestamp: requestTime
      });
    }
    
    return { 
      valid: false, 
      errorCode: 'AUTH_TIMESTAMP_OUT_OF_RANGE',
      errorMessage: `Timestamp expirado (skew: ${skewSeconds.toFixed(1)}s, max: 300s)`,
      transient: true, // Clock skew pode ser transitorio
      serverTimeMs,
      skewSeconds,
      receivedTimestamp: requestTime,
      maxSkewSeconds: 300
    };
  }

  // Verificar se a assinatura ja foi usada (prevenir replay)
  const { data: usedSignature } = await supabase
    .from('hmac_signatures')
    .select('id')
    .eq('signature', signature)
    .order('used_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (usedSignature) {
    return { 
      valid: false, 
      errorCode: 'AUTH_REPLAY_DETECTED',
      errorMessage: 'Assinatura ja utilizada (replay attack detectado)',
      transient: false
    };
  }

  // Construir payload para verificacao
  let body = '';
  try {
    const clonedRequest = request.clone();
    body = await clonedRequest.text();
  } catch {
    body = '';
  }

  // BUG-FIX: v5.0.3 agents sign with ConvertTo-Json -Compress (compact JSON)
  // but send the body with ConvertTo-Json (pretty-printed with \r\n and spaces)
  // Try both the raw body and a compacted version
  let compactBody = body;
  try {
    if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
      compactBody = JSON.stringify(JSON.parse(body));
    }
  } catch {
    compactBody = body; // If parse fails, keep original
  }

  // COMPAT: v5.0.3 uses "." separator, legacy uses ":" separator
  // Use the original timestamp string (not the converted one) for payload reconstruction
  const payloadColon = `${timestamp}:${nonce}:${body}`;
  const payloadDot = `${timestamp}.${nonce}.${body}`;
  // v5.0.3 compact body variants
  const payloadColonCompact = `${timestamp}:${nonce}:${compactBody}`;
  const payloadDotCompact = `${timestamp}.${nonce}.${compactBody}`;

  // COMPAT: Try multiple key encodings and payload formats
  // Optimization: check cached format first, then try all variants
  const encoder = new TextEncoder();
  
  // Build key variants
  const keyVariants: { name: string; data: Uint8Array }[] = [];
  
  // 1. HEX-decoded bytes (legacy/correct)
  try {
    keyVariants.push({ name: 'hex', data: hexToBytes(hmacSecret) });
  } catch {
    // Not valid hex - skip
  }
  
  // 2. UTF-8 raw bytes (v5.0.3 bug - treats hex string as UTF-8)
  keyVariants.push({ name: 'utf8', data: encoder.encode(hmacSecret) });
  
  if (keyVariants.length === 0) {
    console.error(`[HMAC] CRITICAL: No valid key encoding for agent ${agentName}`);
    return {
      valid: false,
      errorCode: 'AUTH_INVALID_SECRET_FORMAT',
      errorMessage: 'HMAC secret invalido. Agente deve ser reinstalado com secret HEX valido.',
      transient: false,
    };
  }
  
  // Check format cache to try the known-good combination first
  let cachedFormat: { key_encoding: string; separator: string; body_format: string } | null = null;
  if (context?.agentId) {
    const { data: cache } = await supabase
      .from('agent_hmac_format_cache')
      .select('key_encoding, separator, body_format')
      .eq('agent_id', context.agentId)
      .maybeSingle();
    if (cache) cachedFormat = cache;
  }
  
  // Order payloads: cached separator first, then alternatives
  const allPayloads: { payload: string; sep: string; fmt: string }[] = [];
  const separators = cachedFormat ? [cachedFormat.separator, cachedFormat.separator === ':' ? '.' : ':'] : [':', '.'];
  const bodyFormats = cachedFormat ? [cachedFormat.body_format, cachedFormat.body_format === 'raw' ? 'compact' : 'raw'] : ['raw', 'compact'];
  
  for (const sep of separators) {
    for (const fmt of bodyFormats) {
      const b = fmt === 'compact' ? compactBody : body;
      allPayloads.push({ payload: `${timestamp}${sep}${nonce}${sep}${b}`, sep, fmt });
    }
  }
  
  // Order keys: cached encoding first
  const orderedKeys = cachedFormat
    ? [...keyVariants.filter(k => k.name === cachedFormat!.key_encoding), ...keyVariants.filter(k => k.name !== cachedFormat!.key_encoding)]
    : keyVariants;
  
  for (const keyVariant of orderedKeys) {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyVariant.data.buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    for (const { payload, sep, fmt } of allPayloads) {
      const messageData = encoder.encode(payload);
      const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
      const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      if (signature === expectedSignature) {
        // Match found! Store signature for replay protection
        const { error: insertError } = await supabase.from('hmac_signatures').insert({
          signature,
          agent_name: agentName,
        });

        if (insertError) {
          console.error(`[HMAC] CRITICAL: Failed to store signature for agent ${agentName}:`, {
            error: insertError.message,
            code: insertError.code,
          });
        }

        // Update format cache (fire-and-forget, no await needed for response)
        if (context?.agentId) {
          supabase.from('agent_hmac_format_cache').upsert({
            agent_id: context.agentId,
            key_encoding: keyVariant.name,
            separator: sep,
            body_format: fmt,
            last_verified_at: new Date().toISOString(),
            hit_count: 1,
          }, { onConflict: 'agent_id' }).then(({ error }) => {
            if (error) console.warn('[HMAC] Cache update failed:', error.message);
          });
        }

        return { valid: true, rawBody: body };
      }
    }
  }

  // No match found - DEBUG: Log details for diagnosis
  const debugUtf8Key = encoder.encode(hmacSecret);
  let debugHexKey: Uint8Array | null = null;
  try { debugHexKey = hexToBytes(hmacSecret); } catch { /* skip */ }
  
  console.error('[HMAC] Signature verification failed', {
    agent: agentName,
    error_code: 'AUTH_INVALID_SIGNATURE',
    timestamp: timestamp,
    nonce: nonce?.substring(0, 8),
    receivedSignature: signature?.substring(0, 16) + '...',
    bodyLength: body.length,
    bodyPreview: body.substring(0, 100),
    secretLength: hmacSecret?.length,
    secretPrefix: hmacSecret?.substring(0, 8),
    utf8KeyLength: debugUtf8Key.length,
    hexKeyLength: debugHexKey?.length || 'N/A',
    headerNames: {
      timestamp: request.headers.get('X-Timestamp') ? 'X-Timestamp' : request.headers.get('X-HMAC-Timestamp') ? 'X-HMAC-Timestamp' : 'none',
      nonce: request.headers.get('X-Nonce') ? 'X-Nonce' : request.headers.get('X-HMAC-Nonce') ? 'X-HMAC-Nonce' : 'none',
    }
  });
  
  return { 
    valid: false, 
    rawBody: body,
    errorCode: 'AUTH_INVALID_SIGNATURE',
    errorMessage: 'Assinatura HMAC invalida',
    transient: false
  };
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
          ? `Relógio do computador fora de sincronia (${data.skewSeconds?.toFixed(1) || '?'}s de diferença)`
          : 'Falha de autenticação HMAC',
        skewSeconds: data.skewSeconds,
        serverTimeMs: data.serverTimeMs,
        receivedTimestamp: data.receivedTimestamp,
        maxSkewSeconds: 300,
        ip: data.ip,
        endpoint: data.endpoint
      }
    });
    
    authFailureCache.set(cacheKey, now);
    console.log(`[HMAC] Auth failure logged for ${data.agentName}: ${data.errorCode}`);
  } catch (error) {
    // Non-blocking - don't fail the request if logging fails
    console.warn('[HMAC] Failed to log auth failure (non-blocking):', error);
  }
}
