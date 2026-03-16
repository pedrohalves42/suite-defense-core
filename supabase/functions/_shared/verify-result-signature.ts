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
    
    console.log('[verify-result-signature] Starting verification:', {
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
      console.error('[verify-result-signature] Error fetching agent keys:', keyError)
      return {
        valid: false,
        errorCode: 'KEY_FETCH_ERROR',
        errorMessage: `Failed to fetch agent signing keys: ${keyError.message}`
      }
    }

    if (!keyResult || keyResult.length === 0) {
      console.warn('[verify-result-signature] No valid signing keys found for agent:', agentId)
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
        console.log('[verify-result-signature] Signature verified successfully:', {
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
    console.warn('[verify-result-signature] Signature verification failed for all keys:', {
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
    console.error('[verify-result-signature] Unexpected error:', error)
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
    console.warn('[verify-result-signature] Key verification attempt failed:', error)
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
 * Imports an RSA public key from PEM or raw Base64 format
 * Used for PS 5.1 agents that fall back to RSA-2048 when ECDSA PKCS8 export is unavailable
 */
async function importRsaPublicKey(keyData: string): Promise<CryptoKey> {
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
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['verify']
  )
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
