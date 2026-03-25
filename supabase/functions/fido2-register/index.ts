import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * FIDO2/WebAuthn Registration Edge Function
 * Endpoints: begin, complete, keys (list), revoke
 * Uses Deno.serve() per project standard
 */

const RP_ID = Deno.env.get('FIDO2_RP_ID') || 'cybershield-audit.lovable.app'
const RP_NAME = 'CyberShield Security Platform'
const ORIGIN = Deno.env.get('FIDO2_ORIGIN') || 'https://cybershield-audit.lovable.app'

function generateChallenge(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  try {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = req.method !== 'GET' ? await req.json().catch(() => ({})) : {}
    const action = body.action || 'begin'

    // ─── LIST KEYS ───
    if (action === 'keys' && req.method !== 'DELETE') {
      const { data: credentials, error } = await supabase
        .from('fido2_credentials')
        .select('credential_id, device_name, created_at, last_used_at, aaguid, backed_up')
        .eq('user_id', user.id)
        .eq('is_revoked', false)
        .order('created_at', { ascending: false })

      if (error) throw error
      return new Response(JSON.stringify(credentials || []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ─── REVOKE KEY ───
    if (action === 'keys' && (req.method === 'DELETE' || body.credentialId)) {
      const credentialId = body.credentialId
      if (!credentialId) {
        return new Response(JSON.stringify({ error: 'credentialId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { error } = await supabase
        .from('fido2_credentials')
        .update({ is_revoked: true, revoked_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('credential_id', credentialId)

      if (error) throw error

      console.log(`[fido2-register] Credential revoked: ${credentialId} by user ${user.id}`)
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ─── BEGIN REGISTRATION ───
    if (action === 'begin') {
      const { deviceName } = body
      if (!deviceName) {
        return new Response(JSON.stringify({ error: 'deviceName required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const challenge = generateChallenge()

      // Store challenge temporarily
      const challengeKey = `fido2:register:${user.id}:${challenge}`
      await supabase.from('session_store').upsert({
        key: challengeKey,
        value: { userId: user.id, deviceName, createdAt: new Date().toISOString() },
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })

      const options = {
        challenge,
        rp: { id: RP_ID, name: RP_NAME },
        user: {
          id: user.id,
          name: user.email || user.id,
          displayName: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 },  // RS256
        ],
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
          authenticatorAttachment: 'cross-platform',
        },
        attestation: 'none',
        timeout: 60000,
      }

      console.log(`[fido2-register] Registration started for user ${user.id}, device: ${deviceName}`)
      return new Response(JSON.stringify(options), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ─── COMPLETE REGISTRATION ───
    if (action === 'complete') {
      const { registrationResponse, expectedChallenge } = body
      if (!registrationResponse || !expectedChallenge) {
        return new Response(JSON.stringify({ error: 'registrationResponse and expectedChallenge required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Verify challenge exists
      const challengeKey = `fido2:register:${user.id}:${expectedChallenge}`
      const { data: storedData } = await supabase
        .from('session_store')
        .select('value')
        .eq('key', challengeKey)
        .single()

      if (!storedData) {
        return new Response(JSON.stringify({ error: 'Invalid or expired challenge' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const stored = storedData.value as { userId: string; deviceName: string }

      // Store credential (server-side verification would use @simplewebauthn/server in production)
      // For now, store the credential data for future verification
      const credentialHash = await hashData(registrationResponse.id)

      const { error: insertError } = await supabase
        .from('fido2_credentials')
        .insert({
          user_id: user.id,
          credential_id: registrationResponse.id,
          public_key: new TextEncoder().encode(registrationResponse.response.clientDataJSON),
          sign_count: 0,
          device_name: stored.deviceName,
          transports: registrationResponse.response.transports || [],
          aaguid: credentialHash.slice(0, 36),
          attestation_type: 'none',
          backed_up: false,
        })

      if (insertError) throw insertError

      // Cleanup challenge
      await supabase.from('session_store').delete().eq('key', challengeKey)

      console.log(`[fido2-register] Registration completed for user ${user.id}, credentialId: ${registrationResponse.id}`)
      return new Response(JSON.stringify({ success: true, credentialId: registrationResponse.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('[fido2-register] Error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
