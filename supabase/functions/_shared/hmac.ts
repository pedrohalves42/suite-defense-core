import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export interface HmacVerificationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
  transient?: boolean;
  rawBody?: string;  // Body lido durante a verificação
}

/**
 * Verifica assinatura HMAC com códigos de erro estruturados
 */
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

  // Verificar timestamp (máximo 5 minutos de diferença)
  const requestTime = parseInt(timestamp);
  const now = Date.now();
  const maxDiff = 5 * 60 * 1000; // 5 minutos
  const skewSeconds = Math.abs(now - requestTime) / 1000;

  if (Math.abs(now - requestTime) > maxDiff) {
    return { 
      valid: false, 
      errorCode: 'AUTH_TIMESTAMP_OUT_OF_RANGE',
      errorMessage: `Timestamp expirado (skew: ${skewSeconds.toFixed(1)}s, máx: 300s)`,
      transient: true // Clock skew pode ser transitório
    };
  }

  // Verificar se a assinatura já foi usada (prevenir replay)
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
      errorMessage: 'Assinatura já utilizada (replay attack detectado)',
      transient: false
    };
  }

  // Construir payload para verificação
  let body = '';
  try {
    const clonedRequest = request.clone();
    body = await clonedRequest.text();
  } catch {
    body = '';
  }

  const payload = `${timestamp}:${nonce}:${body}`;

  // Verificar assinatura HMAC
  const encoder = new TextEncoder();
  const keyData = encoder.encode(hmacSecret);
  const messageData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  if (signature !== expectedSignature) {
    return { 
      valid: false, 
      errorCode: 'AUTH_INVALID_SIGNATURE',
      errorMessage: 'Assinatura HMAC inválida',
      transient: false
    };
  }

  // Armazenar assinatura usada
  await supabase.from('hmac_signatures').insert({
    signature,
    agent_name: agentName,
  });

  // CRÍTICO: Cleanup com debounce para evitar race conditions
  await debouncedCleanup(supabase);

  return { valid: true, rawBody: body };
}

/**
 * Debounce Map para controlar chamadas de cleanup
 * Previne race conditions onde múltiplos agentes chamam cleanup simultaneamente
 */
const cleanupTimers = new Map<string, number>();
const CLEANUP_DEBOUNCE_MS = 5000; // 5 segundos

async function debouncedCleanup(supabase: SupabaseClient): Promise<void> {
  const key = 'hmac_cleanup';
  
  // Cancelar timer anterior se existir
  const existingTimer = cleanupTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  
  // Agendar novo cleanup
  const timer = setTimeout(async () => {
    try {
      await supabase.rpc('cleanup_old_hmac_signatures');
      cleanupTimers.delete(key);
    } catch (error) {
      console.error('Cleanup HMAC signatures failed:', error);
    }
  }, CLEANUP_DEBOUNCE_MS);
  
  cleanupTimers.set(key, timer as unknown as number);
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
