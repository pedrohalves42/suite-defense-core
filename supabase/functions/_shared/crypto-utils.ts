import { logger } from "./logger.ts";
/**
 * SSA-004: Ed25519 Payload Signing
 * 
 * This module provides cryptographic utilities for signing job payloads
 * using Ed25519 signatures to prevent RCE via database compromise.
 * 
 * Security Model:
 * - Private key: Stored in Supabase secrets (ED25519_PRIVATE_KEY)
 * - Public key: Embedded in agent code
 * - Canonical payload: `${job_id}:${job_type}:${JSON.stringify(payload)}`
 */

/**
 * Signs a payload using Ed25519
 * @param payload - The canonical payload string to sign
 * @param privateKeyBase64 - Base64-encoded PKCS#8 private key
 * @returns Base64-encoded signature
 */
export async function signPayload(payload: string, privateKeyBase64: string): Promise<string> {
  try {
    // Decode the PKCS#8 private key from Base64
    const privateKeyBytes = base64ToArrayBuffer(privateKeyBase64)
    
    // Import the Ed25519 private key
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyBytes,
      {
        name: 'Ed25519',
      },
      false,
      ['sign']
    )
    
    // Encode payload as UTF-8 bytes
    const payloadBytes = new TextEncoder().encode(payload)
    
    // Sign the payload
    const signature = await crypto.subtle.sign(
      'Ed25519',
      privateKey,
      payloadBytes
    )
    
    // Return Base64-encoded signature
    return arrayBufferToBase64(signature)
  } catch (error) {
    logger.error('[CRYPTO] Ed25519 signing failed:', error)
    throw new Error(`Ed25519 signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Verifies an Ed25519 signature (for testing purposes)
 * @param payload - The canonical payload string
 * @param signatureBase64 - Base64-encoded signature
 * @param publicKeyBase64 - Base64-encoded SPKI public key
 * @returns true if valid, false otherwise
 */
export async function verifySignature(
  payload: string, 
  signatureBase64: string, 
  publicKeyBase64: string
): Promise<boolean> {
  try {
    // Decode the SPKI public key from Base64
    const publicKeyBytes = base64ToArrayBuffer(publicKeyBase64)
    
    // Import the Ed25519 public key
    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyBytes,
      {
        name: 'Ed25519',
      },
      false,
      ['verify']
    )
    
    // Decode payload and signature
    const payloadBytes = new TextEncoder().encode(payload)
    const signatureBytes = base64ToArrayBuffer(signatureBase64)
    
    // Verify the signature
    const isValid = await crypto.subtle.verify(
      'Ed25519',
      publicKey,
      signatureBytes,
      payloadBytes
    )
    
    return isValid
  } catch (error) {
    logger.error('[CRYPTO] Ed25519 verification failed:', error)
    return false
  }
}

/**
 * Creates a canonical payload string for signing
 * Ensures consistent serialization across all jobs
 */
export function createCanonicalPayload(jobId: string, jobType: string, payload: unknown): string {
  // Sort keys for consistent serialization
  const payloadJson = JSON.stringify(payload, Object.keys(payload as object).sort())
  return `${jobId}:${jobType}:${payloadJson}`
}

/**
 * Signs a job and returns the signature info
 */
export async function signJob(
  jobId: string, 
  jobType: string, 
  payload: unknown, 
  privateKeyBase64: string
): Promise<{ signature: string; algorithm: string; canonicalPayload: string }> {
  const canonicalPayload = createCanonicalPayload(jobId, jobType, payload)
  const signature = await signPayload(canonicalPayload, privateKeyBase64)
  
  return {
    signature,
    algorithm: 'Ed25519',
    canonicalPayload
  }
}

/**
 * Timing-safe string comparison for secret validation.
 * Prevents timing side-channel attacks by ensuring constant-time comparison.
 * If lengths differ, compares against self to maintain constant time, then returns false.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);

  // Use HMAC-based comparison for constant-time equality.
  // Signing both values with the same random key and comparing digests
  // ensures the comparison time doesn't leak information about content.
  const key = await crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const [macA, macB] = await Promise.all([
    crypto.subtle.sign('HMAC', key, aBuf),
    crypto.subtle.sign('HMAC', key, bBuf),
  ]);

  // Compare the HMAC digests byte-by-byte (fixed 32-byte length, constant time)
  const viewA = new Uint8Array(macA);
  const viewB = new Uint8Array(macB);
  if (viewA.length !== viewB.length) return false;

  let diff = 0;
  for (let i = 0; i < viewA.length; i++) {
    diff |= viewA[i] ^ viewB[i];
  }

  // Also reject if original lengths differ (check after constant-time work)
  diff |= aBuf.byteLength ^ bBuf.byteLength;

  return diff === 0;
}

// Utility functions for Base64 conversion
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
