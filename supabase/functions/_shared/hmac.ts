import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

/**
 * Verifica assinatura HMAC para prevenir ataques de replay
 */
export async function verifyHmacSignature(
  supabase: SupabaseClient,
  request: Request,
  agentName: string,
  hmacSecret: string
): Promise<{ valid: boolean; error?: string }> {
  const signature = request.headers.get('X-HMAC-Signature');
  const timestamp = request.headers.get('X-Timestamp');
  const nonce = request.headers.get('X-Nonce');

  if (!signature || !timestamp || !nonce) {
    return { valid: false, error: 'Headers HMAC ausentes' };
  }

  // Verificar timestamp (máximo 5 minutos de diferença)
  const requestTime = parseInt(timestamp);
  const now = Date.now();
  const maxDiff = 5 * 60 * 1000; // 5 minutos

  if (Math.abs(now - requestTime) > maxDiff) {
    return { valid: false, error: 'Timestamp expirado' };
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
    return { valid: false, error: 'Assinatura já utilizada (replay attack detectado)' };
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
    return { valid: false, error: 'Assinatura HMAC inválida' };
  }

  // Armazenar assinatura usada
  await supabase.from('hmac_signatures').insert({
    signature,
    agent_name: agentName,
  });

  // Limpar assinaturas antigas (async, não esperar)
  supabase.rpc('cleanup_old_hmac_signatures').then();

  return { valid: true };
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
