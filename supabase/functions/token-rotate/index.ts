import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * Token Rotation Service — SEC-008
 * Hash-only storage, 30-day TTL, 7-day rotation window
 */

const TOKEN_TTL_DAYS = 30
const ROTATION_WINDOW_DAYS = 7

async function generateSecureToken(): Promise<string> {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hash = await crypto.subtle.digest('SHA-256', data)
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

  const headers = { ...corsHeaders, 'Content-Type': 'application/json' }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers })
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const action = body.action || new URL(req.url).pathname.split('/').pop()

    // ─── NEEDS ROTATION ───
    if (action === 'needs-rotation' || req.method === 'GET') {
      const { data: tokens, error } = await supabase
        .from('agent_tokens')
        .select('agent_id, token_id, created_at, expires_at')
        .eq('is_revoked', false)
        .eq('is_active', true)
        .lt('expires_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())

      if (error) throw error

      return new Response(JSON.stringify({
        needs_rotation: tokens?.length || 0,
        tokens: tokens?.map(t => ({ agentId: t.agent_id, expiresAt: t.expires_at, createdAt: t.created_at })),
      }), { headers })
    }

    // ─── GENERATE ───
    if (action === 'generate') {
      const { agentId, tenantId } = body
      if (!agentId || !tenantId) {
        return new Response(JSON.stringify({ error: 'agentId and tenantId required' }), { status: 400, headers })
      }

      const agentToken = await generateSecureToken()
      const hmacSecret = await generateSecureToken()
      const tokenHash = await hashToken(agentToken)
      const hmacHash = await hashToken(hmacSecret)
      const tokenId = crypto.randomUUID()

      const { error: insertError } = await supabase
        .from('agent_tokens')
        .insert({
          token_id: tokenId,
          agent_id: agentId,
          tenant_id: tenantId,
          token_hash: tokenHash,
          hmac_secret_hash: hmacHash,
          expires_at: new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
          is_active: true,
          is_revoked: false,
        })

      if (insertError) throw insertError

      console.log(`[token-rotate] Token generated for agent ${agentId} by user ${user.id}`)

      return new Response(JSON.stringify({
        token: agentToken,
        hmac_secret: hmacSecret,
        token_id: tokenId,
        expires_at: new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      }), { headers })
    }

    // ─── VALIDATE ───
    if (action === 'validate') {
      const { agentId, token: agentToken, hmacSecret } = body
      if (!agentId || !agentToken) {
        return new Response(JSON.stringify({ valid: false, error: 'agentId and token required' }), { headers })
      }

      const tokenHash = await hashToken(agentToken)

      const query = supabase
        .from('agent_tokens')
        .select('*')
        .eq('agent_id', agentId)
        .eq('token_hash', tokenHash)

      if (hmacSecret) {
        const hmacHash = await hashToken(hmacSecret)
        query.eq('hmac_secret_hash', hmacHash)
      }

      const { data: storedToken, error } = await query.single()

      if (error || !storedToken) {
        return new Response(JSON.stringify({ valid: false, error: 'Invalid token' }), { headers })
      }

      if (storedToken.is_revoked) {
        console.warn(`[SECURITY] Revoked token used for agent ${agentId}`)
        return new Response(JSON.stringify({ valid: false, error: 'Token revoked' }), { headers })
      }

      if (new Date(storedToken.expires_at) < new Date()) {
        return new Response(JSON.stringify({ valid: false, error: 'Token expired' }), { headers })
      }

      await supabase.from('agent_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', storedToken.id)

      const age = Date.now() - new Date(storedToken.created_at).getTime()
      const needsRotation = age > (TOKEN_TTL_DAYS - ROTATION_WINDOW_DAYS) * 24 * 60 * 60 * 1000

      return new Response(JSON.stringify({
        valid: true,
        needs_rotation: needsRotation,
      }), { headers })
    }

    // ─── REVOKE ───
    if (action === 'revoke') {
      const { agentId, reason } = body
      if (!agentId) {
        return new Response(JSON.stringify({ error: 'agentId required' }), { status: 400, headers })
      }

      const { error } = await supabase
        .from('agent_tokens')
        .update({ is_revoked: true, revoked_at: new Date().toISOString(), is_active: false })
        .eq('agent_id', agentId)
        .eq('is_revoked', false)

      if (error) throw error

      console.log(`[token-rotate] Tokens revoked for agent ${agentId} by user ${user.id}, reason: ${reason}`)

      return new Response(JSON.stringify({ success: true }), { headers })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers })
  } catch (error) {
    console.error('[token-rotate] Error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers })
  }
})
