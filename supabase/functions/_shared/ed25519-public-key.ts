/**
 * Ed25519 Public Key Derivation Utility
 * 
 * Derives the public key from the ED25519_PRIVATE_KEY secret and caches it
 * in memory for the lifetime of the edge function cold start.
 * Cost: zero DB queries — pure in-memory crypto derivation.
 * Failure caching: derivation is attempted once per cold start;
 * subsequent calls return null instantly if the first attempt failed.
 */

import { logger } from './logger.ts'

let cachedPublicKeyBase64: string | null = null
/** true = derivation was attempted and failed; skip future attempts this cold start */
let derivationFailed = false

/**
 * Derive the Ed25519 public key (SPKI, Base64) from the private key secret.
 * Returns null if the secret is not configured or derivation fails.
 * Result is cached in memory (one derivation per cold start).
 */
export async function getEd25519PublicKeyBase64(): Promise<string | null> {
  if (cachedPublicKeyBase64 !== null) return cachedPublicKeyBase64
  if (derivationFailed) return null

  const privateKeyBase64 = Deno.env.get('ED25519_PRIVATE_KEY')
  if (!privateKeyBase64) {
    logger.warn('[ED25519] ED25519_PRIVATE_KEY secret not configured — cannot derive public key')
    derivationFailed = true
    return null
  }

  try {
    // Clean PEM headers/whitespace and handle double-encoding
    let cleanBase64 = privateKeyBase64
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\s/g, '')

    // Detect double-encoding
    try {
      const decoded = atob(cleanBase64)
      if (decoded.includes('BEGIN') && decoded.includes('PRIVATE KEY')) {
        logger.info('[ED25519] Detected double-encoded PEM, unwrapping')
        cleanBase64 = decoded
          .replace(/-----BEGIN PRIVATE KEY-----/g, '')
          .replace(/-----END PRIVATE KEY-----/g, '')
          .replace(/\s/g, '')
      }
    } catch {
      // Not double-encoded, proceed normally
    }

    const privateKeyBytes = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0))

    // Import as Ed25519 private key (PKCS8)
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyBytes.buffer,
      { name: 'Ed25519' },
      true, // extractable — needed to derive public key
      ['sign'],
    )

    // Export as JWK to extract the public key component
    const jwk = await crypto.subtle.exportKey('jwk', privateKey)

    if (!jwk.x) {
      logger.error('[ED25519] Private key JWK missing "x" (public component)')
      return null
    }

    // Import as public key using the "x" component
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x },
      { name: 'Ed25519' },
      true,
      ['verify'],
    )

    // Export as SPKI and encode to Base64
    const spkiBytes = await crypto.subtle.exportKey('spki', publicKey)
    const spkiBase64 = btoa(String.fromCharCode(...new Uint8Array(spkiBytes)))

    cachedPublicKeyBase64 = spkiBase64
    logger.info('[ED25519] Public key derived successfully', {
      fingerprint: spkiBase64.substring(0, 16) + '...',
    })

    return cachedPublicKeyBase64
  } catch (err) {
    logger.error('[ED25519] Failed to derive public key from private key', {
      error: (err as Error).message,
    })
    return null
  }
}
