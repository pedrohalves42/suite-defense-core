/**
 * RSA-2048 Public Key Derivation & Signing Utility
 * 
 * Provides RSA-2048 fallback for agents on PowerShell 5.1 / .NET 4.x
 * that cannot use Ed25519. Uses RSASSA-PKCS1-v1_5 + SHA-256 for
 * compatibility with .NET Framework's RSACryptoServiceProvider.
 * 
 * Cost: zero DB queries — pure in-memory crypto derivation.
 */

import { logger } from './logger.ts'

let cachedPublicKeyBase64: string | null = null

/**
 * Derive the RSA-2048 public key (SPKI, Base64) from the private key secret.
 * Returns null if the secret is not configured or derivation fails.
 * Result is cached in memory (one derivation per cold start).
 */
export async function getRsaPublicKeyBase64(): Promise<string | null> {
  if (cachedPublicKeyBase64 !== null) return cachedPublicKeyBase64

  const privateKeyBase64 = Deno.env.get('RSA_PRIVATE_KEY')
  if (!privateKeyBase64) {
    logger.warn('[RSA] RSA_PRIVATE_KEY secret not configured — RSA fallback unavailable')
    return null
  }

  try {
    const cleanBase64 = privateKeyBase64
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\s/g, '')

    const privateKeyBytes = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0))

    // Import as RSA private key (PKCS8) — RSASSA-PKCS1-v1_5 for .NET 4.x compat
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyBytes.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true, // extractable — needed to derive public key
      ['sign'],
    )

    // Export as JWK to extract public components (n, e)
    const jwk = await crypto.subtle.exportKey('jwk', privateKey)
    if (!jwk.n || !jwk.e) {
      logger.error('[RSA] Private key JWK missing "n" or "e" (public components)')
      return null
    }

    // Import as public key using n + e
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256' },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true,
      ['verify'],
    )

    // Export as SPKI and encode to Base64
    const spkiBytes = await crypto.subtle.exportKey('spki', publicKey)
    const spkiBase64 = btoa(String.fromCharCode(...new Uint8Array(spkiBytes)))

    cachedPublicKeyBase64 = spkiBase64
    logger.info('[RSA] Public key derived successfully', {
      fingerprint: spkiBase64.substring(0, 16) + '...',
    })

    return cachedPublicKeyBase64
  } catch (err) {
    logger.error('[RSA] Failed to derive public key from private key', {
      error: (err as Error).message,
    })
    return null
  }
}

/**
 * Sign content with RSA-2048 (RSASSA-PKCS1-v1_5 + SHA-256).
 * Returns Base64-encoded signature or null if key is unavailable.
 */
export async function signWithRsa(content: string): Promise<string | null> {
  const privateKeyBase64 = Deno.env.get('RSA_PRIVATE_KEY')
  if (!privateKeyBase64) return null

  try {
    const cleanBase64 = privateKeyBase64
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\s/g, '')

    const privateKeyBytes = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0))

    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyBytes.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const encoder = new TextEncoder()
    const signatureBuffer = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      encoder.encode(content),
    )

    return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
  } catch (err) {
    logger.error('[RSA] Failed to sign content', { error: (err as Error).message })
    return null
  }
}
