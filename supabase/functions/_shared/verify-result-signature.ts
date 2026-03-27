/**
 * P1: Result Signature Verification with N+N-1 Key Rotation
 * 
 * This module verifies signatures on job results submitted by agents
 * using their registered public keys from agent_signing_keys table.
 * 
 * Security Model:
 * - Agents register their public keys via register-agent-key endpoint
 * - Keys follow N+N-1 rotation: current (N) and previous (N-1) are both valid
 * - Signatures use ECDSA P-256 with SHA-256 (agent-side compatible)
 * - Immutable audit trail: signed results cannot be repudiated
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { logger } from './logger.ts';

export interface SignatureVerificationResult {
  valid: boolean
  keyId?: string
  keyVersion?: number
  algorithm?: string
  isCurrent?: boolean
  errorCode?: string
  errorMessage?: string
}

/**
 * Verifies a result signature using the agent's registered public key
 * Supports N+N-1 key rotation for zero-downtime key updates
 */
export async function verifyResultSignature(
  supabase: SupabaseClient,
  agentId: string,
  payload: {
    jobId: string
    executionId: string
    nonce: string
    outputHash: string
    status: string
    // v4.1.9: Hash chain field
    executionHash?: string
  },
  signatureBase64: string,
  signatureAlgorithm: string = 'ECDSA-P256-SHA256'
): Promise<SignatureVerificationResult> {
  try {
    // 1. Build canonical payload for verification
    // Must match exactly what the agent signed
    const canonicalPayload = buildCanonicalPayload(payload)
    
    logger.info('[verify-result-signature] Starting verification:', {
      agentId,
      jobId: payload.jobId,
      executionId: payload.executionId,
      algorithm: signatureAlgorithm,
      hasExecutionHash: !!payload.executionHash,
      payloadPreview: canonicalPayload.substring(0, 100) + '...'
    })

    // 2. Get valid signing keys for this agent (N and N-1)
    const { data: keyResult, error: keyError } = await supabase
      .rpc('get_valid_agent_signing_key_by_agent', {
        p_agent_id: agentId
      })

    if (keyError) {
      logger.error('[verify-result-signature] Error fetching agent keys:', keyError)
      return {
        valid: false,
        errorCode: 'KEY_FETCH_ERROR',
        errorMessage: `Failed to fetch agent signing keys: ${keyError.message}`
      }
    }

    if (!keyResult || keyResult.length === 0) {
      logger.warn('[verify-result-signature] No valid signing keys found for agent:', agentId)
      return {
        valid: false,
        errorCode: 'NO_VALID_KEY',
        errorMessage: 'No valid signing key registered for this agent'
      }
    }

    // 3. Try to verify with each valid key (N first, then N-1)
    for (const key of keyResult) {
      const verifyResult = await tryVerifyWithKey(
        canonicalPayload,
        signatureBase64,
        key.public_key,
        signatureAlgorithm
      )

      if (verifyResult.valid) {
        logger.info('[verify-result-signature] Signature verified successfully:', {
          agentId,
          keyId: key.key_id,
          keyVersion: key.version,
          isCurrent: key.is_current
        })
        
        return {
          valid: true,
          keyId: key.key_id,
          keyVersion: key.version,
          algorithm: key.algorithm,
          isCurrent: key.is_current
        }
      }
    }

    // 4. No key could verify the signature
    logger.warn('[verify-result-signature] Signature verification failed for all keys:', {
      agentId,
      keysAttempted: keyResult.length,
      keyVersions: keyResult.map((k: { version: number }) => k.version)
    })

    return {
      valid: false,
      errorCode: 'INVALID_SIGNATURE',
      errorMessage: 'Signature does not match any valid key'
    }

  } catch (error) {
    logger.error('[verify-result-signature] Unexpected error:', error)
    return {
      valid: false,
      errorCode: 'VERIFICATION_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Unknown verification error'
    }
  }
}

/**
 * Builds the canonical payload string that the agent should have signed
 * Format: JSON with sorted keys for deterministic serialization
 * v4.1.9: Now includes execution_hash for hash chain support
 */
function buildCanonicalPayload(payload: {
  jobId: string
  executionId: string
  nonce: string
  outputHash: string
  status: string
  executionHash?: string
}): string {
  // Create a deterministic JSON representation
  // v4.1.9: Include execution_hash in canonical payload (alphabetically sorted)
  const canonicalObj = {
    execution_hash: payload.executionHash || '',
    execution_id: payload.executionId,
    job_id: payload.jobId,
    nonce: payload.nonce,
    output_hash: payload.outputHash,
    status: payload.status
  }
  
  // Sorted keys ensure consistent serialization
  return JSON.stringify(canonicalObj, Object.keys(canonicalObj).sort())
}

/**
 * Attempts to verify a signature with a specific public key
 */
async function tryVerifyWithKey(
  payload: string,
  signatureBase64: string,
  publicKeyPem: string,
  algorithm: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Decode signature from Base64
    const signatureBytes = base64ToArrayBuffer(signatureBase64)
    
    // Parse the public key based on algorithm
    let cryptoKey: CryptoKey
    
    if (algorithm === 'ECDSA-P256-SHA256' || algorithm === 'ECDSA') {
      cryptoKey = await importEcdsaPublicKey(publicKeyPem)
    } else if (algorithm === 'Ed25519') {
      cryptoKey = await importEd25519PublicKey(publicKeyPem)
    } else if (algorithm === 'RSA-2048-SHA256' || algorithm === 'RSA' || algorithm === 'RSA-2048-CSP') {
      cryptoKey = await importRsaPublicKey(publicKeyPem, algorithm === 'RSA-2048-CSP')
    } else {
      return { valid: false, error: `Unsupported algorithm: ${algorithm}` }
    }
    
    // Encode payload as UTF-8
    const payloadBytes = new TextEncoder().encode(payload)
    
    // Verify signature
    let isValid: boolean
    
    if (algorithm === 'ECDSA-P256-SHA256' || algorithm === 'ECDSA') {
      isValid = await crypto.subtle.verify(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' }
        },
        cryptoKey,
        signatureBytes,
        payloadBytes
      )
    } else if (algorithm === 'RSA-2048-SHA256' || algorithm === 'RSA' || algorithm === 'RSA-2048-CSP') {
      isValid = await crypto.subtle.verify(
        {
          name: 'RSASSA-PKCS1-v1_5'
        },
        cryptoKey,
        signatureBytes,
        payloadBytes
      )
    } else {
      isValid = await crypto.subtle.verify(
        'Ed25519',
        cryptoKey,
        signatureBytes,
        payloadBytes
      )
    }
    
    return { valid: isValid }
    
  } catch (error) {
    logger.warn('[verify-result-signature] Key verification attempt failed:', error)
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Verification failed' 
    }
  }
}

/**
 * Imports an ECDSA P-256 public key from PEM or raw format
 */
async function importEcdsaPublicKey(keyData: string): Promise<CryptoKey> {
  // Handle PEM format
  let keyBytes: ArrayBuffer
  
  if (keyData.includes('-----BEGIN PUBLIC KEY-----')) {
    // PEM format - extract base64 content
    const pemContent = keyData
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s/g, '')
    keyBytes = base64ToArrayBuffer(pemContent)
  } else {
    // Assume raw Base64
    keyBytes = base64ToArrayBuffer(keyData)
  }
  
  return await crypto.subtle.importKey(
    'spki',
    keyBytes,
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    false,
    ['verify']
  )
}

/**
 * Imports an Ed25519 public key from PEM or raw format
 */
async function importEd25519PublicKey(keyData: string): Promise<CryptoKey> {
  let keyBytes: ArrayBuffer
  
  if (keyData.includes('-----BEGIN PUBLIC KEY-----')) {
    const pemContent = keyData
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s/g, '')
    keyBytes = base64ToArrayBuffer(pemContent)
  } else {
    keyBytes = base64ToArrayBuffer(keyData)
  }
  
  return await crypto.subtle.importKey(
    'spki',
    keyBytes,
    {
      name: 'Ed25519'
    },
    false,
    ['verify']
  )
}

/**
 * Imports an RSA public key from PEM, SPKI Base64, or CSP blob format
 * CSP blob: Microsoft CryptoAPI format from ExportCspBlob($false) — needs conversion to SPKI
 */
async function importRsaPublicKey(keyData: string, isCspBlob = false): Promise<CryptoKey> {
  let keyBytes: ArrayBuffer
  
  if (keyData.includes('-----BEGIN PUBLIC KEY-----')) {
    const pemContent = keyData
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s/g, '')
    keyBytes = base64ToArrayBuffer(pemContent)
  } else {
    keyBytes = base64ToArrayBuffer(keyData)
  }

  // CSP blob: convert to SPKI format for Web Crypto API
  if (isCspBlob) {
    keyBytes = cspBlobToSpki(new Uint8Array(keyBytes))
  }
  
  return await crypto.subtle.importKey(
    'spki',
    keyBytes,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['verify']
  )
}

/**
 * Converts a Microsoft CSP PUBLICKEYBLOB to SPKI DER format
 * CSP format: BLOBHEADER(8) + RSAPUBKEY(12) + modulus(n) + exponent(already in RSAPUBKEY)
 * Reference: https://docs.microsoft.com/en-us/windows/win32/seccrypto/base-provider-key-blobs
 */
function cspBlobToSpki(cspBlob: Uint8Array): ArrayBuffer {
  // BLOBHEADER: 8 bytes (bType, bVersion, reserved, aiKeyAlg)
  // RSAPUBKEY: 12 bytes (magic "RSA1", bitlen, pubexp)
  const bitLen = new DataView(cspBlob.buffer, cspBlob.byteOffset + 12, 4).getUint32(0, true)
  const modulusLen = bitLen / 8
  
  // Public exponent: 4 bytes at offset 16 (little-endian)
  const pubExpLE = cspBlob.slice(16, 20)
  // Convert to big-endian and trim leading zeros
  const pubExpBE: number[] = []
  for (let i = pubExpLE.length - 1; i >= 0; i--) {
    if (pubExpBE.length > 0 || pubExpLE[i] !== 0) pubExpBE.push(pubExpLE[i])
  }
  if (pubExpBE.length === 0) pubExpBE.push(0)
  
  // Modulus: modulusLen bytes at offset 20 (little-endian) → reverse to big-endian
  const modulusLE = cspBlob.slice(20, 20 + modulusLen)
  const modulusBE = new Uint8Array(modulusLen)
  for (let i = 0; i < modulusLen; i++) {
    modulusBE[i] = modulusLE[modulusLen - 1 - i]
  }
  
  // Prepend 0x00 if high bit is set (to ensure positive integer in DER)
  const modPadded = modulusBE[0] & 0x80 ? new Uint8Array([0, ...modulusBE]) : modulusBE
  const expBytes = new Uint8Array(pubExpBE)
  
  // Build DER RSAPublicKey SEQUENCE { modulus INTEGER, exponent INTEGER }
  const modInteger = derInteger(modPadded)
  const expInteger = derInteger(expBytes)
  const rsaPublicKey = derSequence(new Uint8Array([...modInteger, ...expInteger]))
  
  // Wrap in BIT STRING (prepend 0x00 unused bits)
  const bitString = new Uint8Array([0, ...rsaPublicKey])
  
  // AlgorithmIdentifier for RSA: OID 1.2.840.113549.1.1.1 + NULL
  const rsaOid = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01])
  const nullParam = new Uint8Array([0x05, 0x00])
  const algorithmId = derSequence(new Uint8Array([...rsaOid, ...nullParam]))
  
  // SubjectPublicKeyInfo SEQUENCE { algorithmId, BIT STRING }
  const bitStringDer = derTag(0x03, bitString)
  const spki = derSequence(new Uint8Array([...algorithmId, ...bitStringDer]))
  
  return spki.buffer
}

function derTag(tag: number, content: Uint8Array): Uint8Array {
  const lenBytes = derLength(content.length)
  const result = new Uint8Array(1 + lenBytes.length + content.length)
  result[0] = tag
  result.set(lenBytes, 1)
  result.set(content, 1 + lenBytes.length)
  return result
}

function derInteger(value: Uint8Array): Uint8Array {
  return derTag(0x02, value)
}

function derSequence(content: Uint8Array): Uint8Array {
  return derTag(0x30, content)
}

function derLength(len: number): Uint8Array {
  if (len < 128) return new Uint8Array([len])
  if (len < 256) return new Uint8Array([0x81, len])
  return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff])
}

/**
 * Computes SHA-256 hash of output for signing verification
 */
export async function computeOutputHash(output: unknown): Promise<string> {
  const outputString = output ? JSON.stringify(output) : ''
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(outputString)
  )
  return arrayBufferToHex(hash)
}

// Utility functions
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
