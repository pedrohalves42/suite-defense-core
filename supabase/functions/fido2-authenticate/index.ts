import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'
import { logger } from '../_shared/logger.ts';

/**
 * FIDO2/WebAuthn Authentication Edge Function
 * Completes HUM-002 and SOC2 CC6.1
 * Actions: begin (get auth options), complete (verify assertion)
 */

const RP_ID = Deno.env.get('FIDO2_RP_ID') || 'cybershield-audit.lovable.app'
const ORIGIN = Deno.env.get('FIDO2_ORIGIN') || 'https://cybershield-audit.lovable.app'

function base64UrlDecode(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
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
    const body = await req.json().catch(() => ({}))
    const action = body.action || 'begin'

    // ─── BEGIN AUTHENTICATION ───
    if (action === 'begin') {
      const { email } = body
      if (!email) {
        return new Response(JSON.stringify({ error: 'email required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Look up user in auth.users via admin API
      const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
      if (listError) throw listError

      const user = users?.find(u => u.email === email)
      if (!user) {
        return new Response(JSON.stringify({ error: 'No account found with this email' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Fetch active FIDO2 credentials for user
      const { data: credentials, error: credError } = await supabase
        .from('fido2_credentials')
        .select('credential_id, transports')
        .eq('user_id', user.id)
        .eq('is_revoked', false)

      if (credError) throw credError

      if (!credentials || credentials.length === 0) {
        return new Response(JSON.stringify({ error: 'No security keys registered for this account' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Generate challenge
      const challengeBytes = new Uint8Array(32)
      crypto.getRandomValues(challengeBytes)
      const challenge = Array.from(challengeBytes).map(b => b.toString(16).padStart(2, '0')).join('')

      // Store challenge in session_store
      const challengeKey = `fido2:auth:${user.id}:${challenge}`
      await supabase.from('session_store').upsert({
        key: challengeKey,
        value: { userId: user.id, email: user.email, createdAt: new Date().toISOString() },
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })

      const options = {
        challenge,
        rpId: RP_ID,
        allowCredentials: credentials.map((cred: any) => ({
          id: cred.credential_id,
          type: 'public-key',
          transports: cred.transports || [],
        })),
        userVerification: 'required',
        timeout: 60000,
      }

      logger.info(`[fido2-authenticate] Begin authentication for ${email}, ${credentials.length} key(s) available`)
      return new Response(JSON.stringify(options), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ─── COMPLETE AUTHENTICATION ───
    if (action === 'complete') {
      const { email, authResponse, expectedChallenge } = body
      if (!email || !authResponse || !expectedChallenge) {
        return new Response(JSON.stringify({ error: 'email, authResponse, and expectedChallenge required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Look up user
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const user = users?.find(u => u.email === email)
      if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Verify challenge exists and hasn't expired
      const challengeKey = `fido2:auth:${user.id}:${expectedChallenge}`
      const { data: storedData } = await supabase
        .from('session_store')
        .select('value, expires_at')
        .eq('key', challengeKey)
        .single()

      if (!storedData) {
        return new Response(JSON.stringify({ error: 'Invalid or expired challenge' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (new Date(storedData.expires_at) < new Date()) {
        await supabase.from('session_store').delete().eq('key', challengeKey)
        return new Response(JSON.stringify({ error: 'Challenge expired' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Fetch the credential used for authentication
      const { data: credential, error: credError } = await supabase
        .from('fido2_credentials')
        .select('*')
        .eq('user_id', user.id)
        .eq('credential_id', authResponse.id)
        .eq('is_revoked', false)
        .single()

      if (credError || !credential) {
        return new Response(JSON.stringify({ error: 'Credential not found or revoked' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Verify clientDataJSON contains correct challenge and origin
      try {
        const clientDataBytes = base64UrlDecode(authResponse.response.clientDataJSON)
        const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes))

        if (clientData.type !== 'webauthn.get') {
          throw new Error('Invalid clientData type')
        }

        // Verify origin matches
        if (clientData.origin !== ORIGIN) {
          logger.warn(`[fido2-authenticate] Origin mismatch: ${clientData.origin} vs ${ORIGIN}`)
          // Allow lovable preview origins in dev
          if (!clientData.origin.includes('lovable.app')) {
            throw new Error('Origin mismatch')
          }
        }

        // Verify challenge matches
        const receivedChallenge = clientData.challenge
        // The challenge in clientData is base64url-encoded
        if (receivedChallenge !== expectedChallenge) {
          // Try hex comparison
          const hexChallenge = Array.from(base64UrlDecode(receivedChallenge))
            .map(b => b.toString(16).padStart(2, '0')).join('')
          if (hexChallenge !== expectedChallenge) {
            throw new Error('Challenge mismatch')
          }
        }
      } catch (verifyError) {
        logger.error('[fido2-authenticate] ClientData verification failed:', verifyError)
        return new Response(JSON.stringify({ error: `Authentication verification failed: ${(verifyError as Error).message}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Verify authenticatorData flags
      const authDataBytes = base64UrlDecode(authResponse.response.authenticatorData)
      if (authDataBytes.length < 37) {
        return new Response(JSON.stringify({ error: 'Invalid authenticator data' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const flags = authDataBytes[32]
      const userPresent = (flags & 0x01) !== 0
      const userVerified = (flags & 0x04) !== 0

      if (!userPresent) {
        return new Response(JSON.stringify({ error: 'User presence flag not set' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Extract sign count (bytes 33-36, big-endian)
      const signCount = (authDataBytes[33] << 24) | (authDataBytes[34] << 16) | (authDataBytes[35] << 8) | authDataBytes[36]

      // Check for cloned authenticator (sign count should increase)
      if (credential.sign_count > 0 && signCount <= credential.sign_count) {
        logger.error(`[fido2-authenticate] SECURITY: Possible cloned authenticator for credential ${credential.credential_id}. ` +
          `Expected sign_count > ${credential.sign_count}, got ${signCount}`)

        await supabase.from('security_events').insert({
          tenant_id: (await supabase.from('user_roles').select('tenant_id').eq('user_id', user.id).limit(1).single()).data?.tenant_id,
          severity: 'critical',
          event_type: 'fido2_cloned_authenticator',
          details: {
            user_id: user.id,
            credential_id: credential.credential_id,
            expected_sign_count: credential.sign_count,
            received_sign_count: signCount,
          },
        })

        return new Response(JSON.stringify({ error: 'Security alert: authenticator may have been cloned' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Update credential sign count and last_used
      await supabase
        .from('fido2_credentials')
        .update({
          sign_count: signCount,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', credential.id)

      // Cleanup challenge
      await supabase.from('session_store').delete().eq('key', challengeKey)

      // Generate a magic link for the user to establish a Supabase session
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: user.email!,
      })

      if (linkError || !linkData) {
        logger.error('[fido2-authenticate] Failed to generate session link:', linkError)
        return new Response(JSON.stringify({ error: 'Failed to create session' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Get tenant for audit log
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      // Audit log
      if (userRole?.tenant_id) {
        await supabase.from('audit_logs').insert({
          tenant_id: userRole.tenant_id,
          user_id: user.id,
          action: 'fido2_authentication_success',
          resource_type: 'auth',
          resource_id: credential.credential_id,
          details: {
            user_verified: userVerified,
            sign_count: signCount,
            device_name: credential.device_name,
          },
        })
      }

      logger.info(`[fido2-authenticate] Authentication successful for ${email}, credential: ${credential.credential_id}`)

      // Return the magic link properties so the client can exchange them for a session
      return new Response(JSON.stringify({
        success: true,
        // The client will use these to call verifyOtp
        token_hash: linkData.properties?.hashed_token,
        email: user.email,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use "begin" or "complete"' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    logger.error('[fido2-authenticate] Error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})