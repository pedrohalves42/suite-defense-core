import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const ValidateHmacSchema = {
  parse: (data: any) => {
    if (!data.hmac_secret || typeof data.hmac_secret !== 'string') {
      throw new Error('hmac_secret is required and must be a string');
    }
    
    const hexRegex = /^[0-9a-f]{64}$/i;
    if (!hexRegex.test(data.hmac_secret)) {
      throw new Error('hmac_secret must be 64-character hexadecimal string');
    }
    
    return {
      hmac_secret: data.hmac_secret,
      test_payload: data.test_payload || 'test_message'
    };
  }
};

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  const requestId = crypto.randomUUID();
  
  try {
    const body = await req.json();
    
    let validatedData;
    try {
      validatedData = ValidateHmacSchema.parse(body);
    } catch (validationError: any) {
      return new Response(JSON.stringify({
        valid: false,
        error: "Invalid payload",
        error_code: "INVALID_PAYLOAD",
        details: validationError.message,
        request_id: requestId
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    const { hmac_secret, test_payload } = validatedData;
    
    // Test HEX → bytes conversion
    let keyBytes: Uint8Array;
    try {
      keyBytes = hexToBytes(hmac_secret);
      
      if (keyBytes.length !== 32) {
        throw new Error(`Expected 32 bytes, got ${keyBytes.length}`);
      }
    } catch (conversionError: any) {
      return new Response(JSON.stringify({
        valid: false,
        error: "Failed to convert HEX to bytes",
        error_code: "HEX_CONVERSION_FAILED",
        details: conversionError.message,
        request_id: requestId
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
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
    
    console.log(`[${requestId}] ✅ HMAC validation successful`);
    
    return new Response(JSON.stringify({
      valid: true,
      signature,
      test_message: payload,
      timestamp,
      nonce,
      request_id: requestId
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
    
  } catch (error: any) {
    console.error(`[${requestId}] Unexpected error during HMAC validation:`, error);
    
    return new Response(JSON.stringify({
      valid: false,
      error: "Unexpected error during HMAC validation",
      error_code: "UNEXPECTED_ERROR",
      details: error.message,
      request_id: requestId
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
