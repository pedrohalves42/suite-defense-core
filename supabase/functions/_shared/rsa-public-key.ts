/**
 * RSA-2048 Public Key Derivation & Signing Utility
 * 
 * Provides RSA-2048 fallback for agents on PowerShell 5.1 / .NET 4.x
 * that cannot use Ed25519. Uses RSASSA-PKCS1-v1_5 + SHA-256 for
 * compatibility with .NET Framework's RSACryptoServiceProvider.
 * 
 * Cost: zero DB queries — pure in-memory crypto derivation.
 * Failure caching: derivation is attempted once per cold start;
 * subsequent calls return null instantly if the first attempt failed.
 */

import { logger } from './logger.ts'

let cachedPublicKeyBase64: string | null = null
/** true = derivation was attempted and failed; skip future attempts this cold start */
let derivationFailed = false
/** Cached imported private key for signing (avoids double import per request) */
let cachedPrivateKey: CryptoKey | null = null

function getRawPrivateKeyBase64(): string | null {
  const raw = Deno.env.get('RSA_PRIVATE_KEY')
  if (!raw) return null

  // Strip PEM headers/whitespace if present
  let cleaned = raw
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')

  // Detect double-encoding: if decoding base64 yields PEM text, decode again
  try {
    const decoded = atob(cleaned)
    if (decoded.includes('BEGIN') && decoded.includes('PRIVATE KEY')) {
      logger.info('[RSA] Detected double-encoded PEM, unwrapping')
      cleaned = decoded
        .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, '')
        .replace(/-----END (RSA )?PRIVATE KEY-----/g, '')
        .replace(/\s/g, '')
    }
  } catch {
    // Not double-encoded, proceed normally
  }

  return cleaned
}

/**
 * Import the RSA private key from env. Caches result for the cold start lifetime.
 * Returns null and sets derivationFailed on any error.
 */
async function importPrivateKey(): Promise<CryptoKey | null> {
  if (cachedPrivateKey) return cachedPrivateKey
  if (derivationFailed) return null

  const cleanBase64 = getRawPrivateKeyBase64()
  if (!cleanBase64) {
    derivationFailed = true
    return null
  }

  try {
    const privateKeyBytes = Uint8Array.from(atob(cleanBase64), c => c.charCodeAt(0))
    cachedPrivateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyBytes.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true,
      ['sign'],
    )
    return cachedPrivateKey
  } catch (err) {
    logger.warn('[RSA] RSA_PRIVATE_KEY is invalid PKCS8 — RSA fallback disabled this cold start', {
      error: (err as Error).message,
    })
    derivationFailed = true
    return null
  }
}

/**
 * Derive the RSA-2048 public key (SPKI, Base64) from the private key secret.
 * Returns null if the secret is not configured or derivation fails.
 * Result is cached in memory (one derivation per cold start).
 */
export async function getRsaPublicKeyBase64(): Promise<string | null> {
  if (cachedPublicKeyBase64 !== null) return cachedPublicKeyBase64
  if (derivationFailed) return null

  const privateKey = await importPrivateKey()
  if (!privateKey) return null

  try {
    const jwk = await crypto.subtle.exportKey('jwk', privateKey)
    if (!jwk.n || !jwk.e) {
      derivationFailed = true
      return null
    }

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256' },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true,
      ['verify'],
    )

    const spkiBytes = await crypto.subtle.exportKey('spki', publicKey)
    const spkiBase64 = btoa(String.fromCharCode(...new Uint8Array(spkiBytes)))

    cachedPublicKeyBase64 = spkiBase64
    logger.info('[RSA] Public key derived successfully', {
      fingerprint: spkiBase64.substring(0, 16) + '...',
    })

    return cachedPublicKeyBase64
  } catch (err) {
    logger.warn('[RSA] Failed to derive public key', { error: (err as Error).message })
    derivationFailed = true
    return null
  }
}

/**
 * Sign content with RSA-2048 (RSASSA-PKCS1-v1_5 + SHA-256).
 * Returns Base64-encoded signature or null if key is unavailable.
 * Reuses the cached private key from importPrivateKey() — no double import.
 */
export async function signWithRsa(content: string): Promise<string | null> {
  if (derivationFailed) return null

  const privateKey = await importPrivateKey()
  if (!privateKey) return null

  try {
    const encoder = new TextEncoder()
    const signatureBuffer = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      encoder.encode(content),
    )

    return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
  } catch (err) {
    logger.warn('[RSA] Failed to sign content', { error: (err as Error).message })
    derivationFailed = true
    return null
  }
}
