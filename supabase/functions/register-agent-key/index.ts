/**
 * P1: Register Agent Signing Key
 * 
 * Endpoint for agents to register their public keys for result signing.
 * Supports key rotation with N+N-1 policy (current and previous keys valid).
 * 
 * Security:
 * - Requires valid agent token + HMAC authentication
 * - Keys are immutable once registered (can only be revoked)
 * - Fingerprint ensures key uniqueness and integrity
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders, handleException } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts'
import { hashToken } from '../_shared/token-hash.ts'
import { logSecurityEvent } from '../_shared/security-log.ts'

interface RegisterKeyRequest {
  public_key: string           // PEM or Base64 encoded public key
  key_fingerprint: string      // SHA256 of the public key (hex)
  algorithm?: string           // 'ECDSA-P256-SHA256' (default) or 'Ed25519'
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  const methodError = validateHttpMethod(req, ['POST'])
  if (methodError) return methodError

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'

  try {
    // 1. Authenticate agent via token
    const agentToken = req.headers.get('X-Agent-Token')
    
    if (!agentToken) {
      await logSecurityEvent({
        supabase,
        ipAddress,
        endpoint: '/register-agent-key',
        attackType: 'unauthorized',
        severity: 'medium',
        blocked: true,
        details: { reason: 'Missing X-Agent-Token' }
      })
      return new Response(
        JSON.stringify({ error: 'X-Agent-Token header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Lookup agent by token hash
    const tokenHash = await hashToken(agentToken)
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, agent_name, tenant_id, hmac_secret)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .maybeSingle()

    if (tokenError || !tokenData?.agents) {
      await logSecurityEvent({
        supabase,
        ipAddress,
        endpoint: '/register-agent-key',
        attackType: 'unauthorized',
        severity: 'high',
        blocked: true,
        details: { token_prefix: agentToken.substring(0, 8) }
      })
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const agent = Array.isArray(tokenData.agents) ? tokenData.agents[0] : tokenData.agents

    // 3. Verify HMAC (mandatory)
    if (!agent.hmac_secret) {
      console.error('[register-agent-key] CRITICAL: Agent without HMAC secret:', agent.agent_name)
      return new Response(
        JSON.stringify({ error: 'HMAC secret not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret, {
      agentId: agent.id,
      tenantId: agent.tenant_id,
      endpoint: '/register-agent-key',
      ip: ipAddress,
    })
    if (!hmacResult.valid) {
      await logSecurityEvent({
        supabase,
        tenantId: agent.tenant_id,
        ipAddress,
        endpoint: '/register-agent-key',
        attackType: 'unauthorized',
        severity: 'high',
        blocked: true,
        details: {
          agent_name: agent.agent_name,
          reason: 'hmac_failure',
          error_code: hmacResult.errorCode
        }
      })
      return new Response(
        JSON.stringify({
          error: 'unauthorized',
          code: hmacResult.errorCode,
          message: hmacResult.errorMessage,
          transient: hmacResult.transient
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Parse request body
    const payload: RegisterKeyRequest = await req.json()

    // 5. Validate required fields
    if (!payload.public_key || typeof payload.public_key !== 'string') {
      return new Response(
        JSON.stringify({ error: 'public_key is required (string)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!payload.key_fingerprint || typeof payload.key_fingerprint !== 'string') {
      return new Response(
        JSON.stringify({ error: 'key_fingerprint is required (string, SHA256 hex)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate fingerprint format (64 hex chars)
    if (!/^[a-fA-F0-9]{64}$/.test(payload.key_fingerprint)) {
      return new Response(
        JSON.stringify({ error: 'key_fingerprint must be 64 hex characters (SHA256)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const algorithm = payload.algorithm || 'ECDSA-P256-SHA256'
    
    // Validate algorithm
    if (!['ECDSA-P256-SHA256', 'Ed25519', 'RSA-2048-SHA256', 'RSA-2048-XML'].includes(algorithm)) {
      return new Response(
        JSON.stringify({ error: 'algorithm must be ECDSA-P256-SHA256, Ed25519, RSA-2048-SHA256, or RSA-2048-XML' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[register-agent-key] Processing key registration:', {
      agent: agent.agent_name,
      agentId: agent.id,
      algorithm,
      fingerprintPreview: payload.key_fingerprint.substring(0, 16) + '...'
    })

    // 6. Verify the fingerprint matches the public key (multi-method)
    const computedFingerprints = await computeAllKeyFingerprints(payload.public_key)
    const providedFp = payload.key_fingerprint.toLowerCase()
    const matchedFingerprint = computedFingerprints.find(entry => entry.fingerprint === providedFp)
    
    if (!matchedFingerprint) {
      const computedPreview = computedFingerprints[0]?.fingerprint.substring(0, 16) || 'none'

      console.warn('[register-agent-key] Fingerprint mismatch (all methods failed):', {
        agent: agent.agent_name,
        provided_preview: providedFp.substring(0, 16),
        computed_preview: computedPreview,
        modes_tried: computedFingerprints.map(entry => entry.mode)
      })
      
      await logSecurityEvent({
        supabase,
        tenantId: agent.tenant_id,
        ipAddress,
        endpoint: '/register-agent-key',
        attackType: 'invalid_input',
        severity: 'high',
        blocked: true,
        details: {
          agent_name: agent.agent_name,
          reason: 'key_tampering',
          message: 'Fingerprint does not match public key',
          computed_preview: computedPreview,
          mode_used: 'none',
          modes_tried: computedFingerprints.map(entry => entry.mode)
        }
      })
      
      return new Response(
        JSON.stringify({ 
          error: 'Fingerprint does not match public key content',
          computed_preview: computedPreview,
          mode_used: 'none',
          modes_tried: computedFingerprints.map(entry => entry.mode)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('[register-agent-key] Fingerprint verified:', {
      agent: agent.agent_name,
      mode_used: matchedFingerprint.mode
    })

    // 7. Check if this exact key is already registered (by fingerprint)
    const { data: existingKey } = await supabase
      .from('agent_signing_keys')
      .select('id, version, revoked_at')
      .eq('agent_id', agent.id)
      .eq('key_fingerprint', payload.key_fingerprint.toLowerCase())
      .maybeSingle()

    if (existingKey) {
      if (existingKey.revoked_at) {
        return new Response(
          JSON.stringify({ 
            error: 'This key was previously registered and revoked',
            key_id: existingKey.id,
            version: existingKey.version
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Key already registered and active - return success with existing info
      console.log('[register-agent-key] Key already registered:', {
        agent: agent.agent_name,
        keyId: existingKey.id,
        version: existingKey.version
      })
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Key already registered',
          key_id: existingKey.id,
          version: existingKey.version,
          already_registered: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 8. Register new key using the RPC function
    const { data: registerResult, error: registerError } = await supabase
      .rpc('register_agent_signing_key', {
        p_agent_id: agent.id,
        p_public_key: payload.public_key,
        p_fingerprint: payload.key_fingerprint.toLowerCase(),
        p_algorithm: algorithm
      })

    if (registerError) {
      console.error('[register-agent-key] Error registering key:', registerError)
      return new Response(
        JSON.stringify({ error: 'Failed to register key', details: registerError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = registerResult[0] || registerResult

    console.log('[register-agent-key] Key registered successfully:', {
      agent: agent.agent_name,
      keyId: result.key_id,
      version: result.version
    })

    // 9. Log in audit_logs instead of security_logs (not an attack)
    console.log('[register-agent-key] Key registered - audit log:', {
      agent_name: agent.agent_name,
      key_id: result.key_id,
      key_version: result.version,
      algorithm
    })

    return new Response(
      JSON.stringify({
        success: true,
        key_id: result.key_id,
        version: result.version,
        valid_from: result.valid_from,
        algorithm
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[register-agent-key] Unexpected error:', error)
    return handleException(error, crypto.randomUUID(), 'register-agent-key')
  }
})

interface FingerprintCandidate {
  fingerprint: string
  mode: string
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function normalizeBase64(value: string): string {
  let normalized = value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const padLength = normalized.length % 4
  if (padLength > 0) {
    normalized = normalized.padEnd(normalized.length + (4 - padLength), '=')
  }
  return normalized
}

function extractPemPayload(publicKey: string): string {
  if (!publicKey.includes('-----BEGIN')) {
    return publicKey.trim()
  }

  return publicKey
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .trim()
}

function utf16LeBytes(input: string): Uint8Array {
  const bytes = new Uint8Array(input.length * 2)
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    bytes[i * 2] = code & 0xff
    bytes[i * 2 + 1] = code >> 8
  }
  return bytes
}

function dedupeCandidates(candidates: FingerprintCandidate[]): FingerprintCandidate[] {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = `${candidate.mode}:${candidate.fingerprint}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Computes SHA256 fingerprint candidates for the public key.
 * Matching order:
 * 1) SHA-256 dos bytes decodificados (Base64/PEM)
 * 2) SHA-256 da string normalizada (UTF-8)
 * 3) SHA-256 da string normalizada em UTF-16LE (compat .NET)
 * 4) Fallback para conteúdo bruto trimado
 */
async function computeAllKeyFingerprints(publicKey: string): Promise<FingerprintCandidate[]> {
  const candidates: FingerprintCandidate[] = []
  const rawTrimmed = publicKey.trim()
  const normalizedBase64 = normalizeBase64(extractPemPayload(publicKey))

  try {
    const decoded = atob(normalizedBase64)
    const decodedBytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0))
    candidates.push({
      fingerprint: await sha256Hex(decodedBytes),
      mode: 'decoded_bytes'
    })
  } catch {
    // ignore invalid base64, fallback methods below
  }

  candidates.push({
    fingerprint: await sha256Hex(new TextEncoder().encode(normalizedBase64)),
    mode: 'normalized_base64_utf8'
  })

  candidates.push({
    fingerprint: await sha256Hex(utf16LeBytes(normalizedBase64)),
    mode: 'normalized_base64_utf16le'
  })

  if (rawTrimmed !== normalizedBase64) {
    candidates.push({
      fingerprint: await sha256Hex(new TextEncoder().encode(rawTrimmed)),
      mode: 'raw_trimmed_utf8'
    })
    candidates.push({
      fingerprint: await sha256Hex(utf16LeBytes(rawTrimmed)),
      mode: 'raw_trimmed_utf16le'
    })
  }

  return dedupeCandidates(candidates)
}

