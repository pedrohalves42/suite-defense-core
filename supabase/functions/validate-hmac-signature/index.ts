import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
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

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }
  
  const requestId = crypto.randomUUID();
  
  try {
    // V-003 FIX: Add rate limiting to prevent brute-force attacks
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
      || req.headers.get('cf-connecting-ip') 
      || 'unknown';
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const rateLimitResult = await checkRateLimit(
      supabase,
      clientIP,
      'validate-hmac-signature',
      { maxRequests: 10, windowMinutes: 1, blockMinutes: 15 } // Strict limit: 10 req/min
    );
    
    if (!rateLimitResult.allowed) {
      logger.warn(`[${requestId}] Rate limit exceeded for IP: ${clientIP}`);
      return new Response(JSON.stringify({
        valid: false,
        error: "Rate limit exceeded",
        error_code: "RATE_LIMITED",
        retry_after: rateLimitResult.resetAt?.toISOString(),
        request_id: requestId
      }), { 
        status: 429, 
        headers: { 
          ...buildCorsHeaders(origin), 
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil((rateLimitResult.resetAt!.getTime() - Date.now()) / 1000).toString()
        } 
      });
    }
    
    const body = await req.json();
    
    let validatedData;
    try {
      validatedData = ValidateHmacSchema.parse(body);
    } catch (validationError: Record<string, unknown>) {
      return new Response(JSON.stringify({
        valid: false,
        error: "Invalid payload",
        error_code: "INVALID_PAYLOAD",
        details: validationError.message,
        request_id: requestId
      }), { 
        status: 400, 
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
      });
    }
    
    const { hmac_secret, test_payload } = validatedData;
    
    // Test HEX ? bytes conversion
    let keyBytes: Uint8Array;
    try {
      keyBytes = hexToBytes(hmac_secret);
      
      if (keyBytes.length !== 32) {
        throw new Error(`Expected 32 bytes, got ${keyBytes.length}`);
      }
    } catch (conversionError: Record<string, unknown>) {
      return new Response(JSON.stringify({
        valid: false,
        error: "Failed to convert HEX to bytes",
        error_code: "HEX_CONVERSION_FAILED",
        details: conversionError.message,
        request_id: requestId
      }), { 
        status: 422, 
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
      });
    }
    
    // Simulate HMAC signature (same as PowerShell will do)
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const payload = `${timestamp}:${nonce}:${test_payload}`;
    
    const encoder = new TextEncoder();
    const messageData = encoder.encode(payload);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    logger.info(`[${requestId}] [OK]  HMAC validation successful`);
    
    return new Response(JSON.stringify({
      valid: true,
      signature,
      test_message: payload,
      timestamp,
      nonce,
      request_id: requestId
    }), { 
      status: 200, 
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
    });
    
  } catch (error: Record<string, unknown>) {
    logger.error(`[${requestId}] Unexpected error during HMAC validation:`, error);
    
    return new Response(JSON.stringify({
      valid: false,
      error: "Unexpected error during HMAC validation",
      error_code: "UNEXPECTED_ERROR",
      details: error.message,
      request_id: requestId
    }), { 
      status: 500, 
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
    });
  }
});
