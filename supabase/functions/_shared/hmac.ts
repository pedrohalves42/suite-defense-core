import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export interface HmacVerificationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
  transient?: boolean;
  rawBody?: string;  // Body lido durante a verificacao
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

export async function verifyHmacSignature(
  supabase: SupabaseClient,
  request: Request,
  agentName: string,
  hmacSecret: string
): Promise<HmacVerificationResult> {
  const signature = request.headers.get('X-HMAC-Signature');
  const timestamp = request.headers.get('X-Timestamp');
  const nonce = request.headers.get('X-Nonce');

  if (!signature || !timestamp || !nonce) {
    return { 
      valid: false, 
      errorCode: 'AUTH_MISSING_HEADERS',
      errorMessage: 'Headers HMAC ausentes (X-HMAC-Signature, X-Timestamp, X-Nonce)',
      transient: false
    };
  }

  // Verificar timestamp (maximo 5 minutos de diferenca)
  const requestTime = parseInt(timestamp);
  const now = Date.now();
  const maxDiff = 5 * 60 * 1000; // 5 minutos
  const skewSeconds = Math.abs(now - requestTime) / 1000;

  if (Math.abs(now - requestTime) > maxDiff) {
    return { 
      valid: false, 
      errorCode: 'AUTH_TIMESTAMP_OUT_OF_RANGE',
      errorMessage: `Timestamp expirado (skew: ${skewSeconds.toFixed(1)}s, max: 300s)`,
      transient: true // Clock skew pode ser transitorio
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

  const payload = `${timestamp}:${nonce}:${body}`;

  // FASE 1 FIX: Usar HEX para compatibilidade com agentes Windows/macOS
  const encoder = new TextEncoder();
  let keyData: Uint8Array;
  
  try {
    keyData = hexToBytes(hmacSecret);
  } catch (hexError) {
    // P0 FIX: Remover fallback UTF-8 - secrets DEVEM ser HEX valido (64 chars)
    // Fallback permitia bypass de autenticacao com secrets malformados
    console.error(`[HMAC] CRITICAL: Invalid HMAC secret format for agent ${agentName}. Must be 64 hex chars.`, hexError);
    return {
      valid: false,
      errorCode: 'AUTH_INVALID_SECRET_FORMAT',
      errorMessage: 'HMAC secret invalido. Agente deve ser reinstalado com secret HEX valido.',
      transient: false,
    };
  }
  
  const messageData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  if (signature !== expectedSignature) {
    // Production logging: minimal info to prevent signature analysis attacks
    console.error('[HMAC] Signature verification failed', {
      agent: agentName,
      error_code: 'AUTH_INVALID_SIGNATURE',
      timestamp: timestamp
    });
    
    return { 
      valid: false, 
      errorCode: 'AUTH_INVALID_SIGNATURE',
      errorMessage: 'Assinatura HMAC invalida',
      transient: false
    };
  }

  // Armazenar assinatura usada
  await supabase.from('hmac_signatures').insert({
    signature,
    agent_name: agentName,
  });

  // SEC-01 FIX: Cleanup probabilistico sincrono (evita race conditions com setTimeout em Deno)
  // 1% das requests executam cleanup - distribui carga sem depender de timers
  await probabilisticCleanup(supabase);

  return { valid: true, rawBody: body };
}

/**
 * Cleanup probabilistico para evitar race conditions em Deno Edge Functions
 * setTimeout/setInterval nao sao confiaveis em ambiente serverless
 * Solucao: 20% das requests executam cleanup de forma sincrona
 * P1 SCALE-01: Aumentado de 10% para 20% para melhor gestão de 15.7K registros/dia
 */
const CLEANUP_PROBABILITY = 0.20; // 20% das requests - P1 optimization for 15.7K records/day

async function probabilisticCleanup(supabase: SupabaseClient): Promise<void> {
  // 10% das requests executam cleanup
  if (Math.random() > CLEANUP_PROBABILITY) {
    return;
  }
  
  try {
    await supabase.rpc('cleanup_old_hmac_signatures');
  } catch (error) {
    // Log silencioso - cleanup e best-effort, nao deve bloquear request
    console.warn('[HMAC] Probabilistic cleanup failed (non-blocking):', error);
  }
}

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
