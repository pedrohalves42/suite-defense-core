/**
 * Cryptographic key generation and hashing for enrollment keys.
 */

/** Generate enrollment key in format XXXX-XXXX-XXXX-XXXX (cryptographically secure) */
export function generateEnrollmentKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segments = 4;
  const segmentLength = 4;
  const parts: string[] = [];

  for (let i = 0; i < segments; i++) {
    const randomBytes = new Uint8Array(segmentLength);
    crypto.getRandomValues(randomBytes);
    let segment = '';
    for (let j = 0; j < segmentLength; j++) {
      segment += chars[randomBytes[j] % chars.length];
    }
    parts.push(segment);
  }
  return parts.join('-');
}

/** Generate SHA-256 hash of a string, returned as hex */
export async function sha256Hex(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Generate a 64-character hex HMAC secret */
export function generateHmacSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Validate HMAC secret by performing a test sign operation (non-blocking) */
export async function validateHmacSecret(
  hmacSecret: string,
  requestId: string,
): Promise<boolean> {
  try {
    const testPayload = `${Date.now()}:${crypto.randomUUID()}:auto_validation`;
    const hexToBytes = (hex: string): Uint8Array => {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
      }
      return bytes;
    };

    const keyBytes = hexToBytes(hmacSecret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(testPayload));
    return true;
  } catch {
    return false;
  }
}
