import { servePublic } from '../_shared/serve-tenant.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const ValidateHmacSchema = z.object({
  hmac_secret: z.string().regex(/^[0-9a-f]{64}$/i, 'Must be 64-character hexadecimal string'),
  test_payload: z.string().max(1024).default('test_message'),
});

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

servePublic(async (req, ctx) => {
  const { supabase, requestId, body } = ctx;
  const origin = req.headers.get('origin');

  // Rate limiting
  const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')
    || 'unknown';

  const rateLimitResult = await checkRateLimit(
    supabase, clientIP, 'validate-hmac-signature',
    { maxRequests: 10, windowMinutes: 1, blockMinutes: 15 }
  );

  if (!rateLimitResult.allowed) {
    logger.warn(`[${requestId}] Rate limit exceeded for IP: ${clientIP}`);
    return new Response(JSON.stringify({
      valid: false, error: "Rate limit exceeded", error_code: "RATE_LIMITED",
      retry_after: rateLimitResult.resetAt?.toISOString(), request_id: requestId
    }), {
      status: 429,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json', 'Retry-After': Math.ceil((rateLimitResult.resetAt!.getTime() - Date.now()) / 1000).toString() }
    });
  }

  const parsed = ValidateHmacSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({
      valid: false, error: "Invalid payload", error_code: "INVALID_PAYLOAD",
      issues: parsed.error.flatten().fieldErrors, request_id: requestId
    }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  const { hmac_secret, test_payload } = parsed.data;

  let keyBytes: Uint8Array;
  try {
    keyBytes = hexToBytes(hmac_secret);
    if (keyBytes.length !== 32) throw new Error(`Expected 32 bytes, got ${keyBytes.length}`);
  } catch (conversionError) {
    return new Response(JSON.stringify({
      valid: false, error: "Failed to convert HEX to bytes", error_code: "HEX_CONVERSION_FAILED",
      details: (conversionError as Error).message, request_id: requestId
    }), { status: 422, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const payload = `${timestamp}:${nonce}:${test_payload}`;

  const encoder = new TextEncoder();
  const messageData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  logger.info(`[${requestId}] HMAC validation successful`);

  return new Response(JSON.stringify({
    valid: true, signature, test_message: payload, timestamp, nonce, request_id: requestId
  }), { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
});
