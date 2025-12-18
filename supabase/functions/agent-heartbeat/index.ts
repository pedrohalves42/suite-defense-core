/**
 * Agent Heartbeat Proxy - v4.0.7 Compatibility
 * 
 * This Edge Function acts as a proxy/alias for the main heartbeat endpoint.
 * Purpose: Allow agents with v4.0.6 (which incorrectly call /agent-heartbeat) 
 * to send heartbeats and receive update jobs.
 * 
 * Once all agents are updated to v4.0.7+, this proxy can be removed.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { AgentTokenSchema } from '../_shared/validation.ts'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logger } from '../_shared/logger.ts'
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts'
import { hashToken } from '../_shared/token-hash.ts'

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }
  
  const methodError = validateHttpMethod(req, ['POST'])
  if (methodError) return methodError

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Log that this is a legacy request
    logger.info('[PROXY] agent-heartbeat called - forwarding to heartbeat endpoint')

    // Get agent token
    const agentToken = req.headers.get('X-Agent-Token')
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Token do agente necessario' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Interface for OS info
    interface OSInfo {
      os_type?: string;
      platform?: string;
      os_version?: string;
      hostname?: string;
      agent_version?: string;
    }

    // Validate token format
    const tokenValidation = AgentTokenSchema.safeParse(agentToken)
    if (!tokenValidation.success) {
      return new Response(
        JSON.stringify({ error: 'Formato de token invalido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Fetch agent by token hash
    const tokenHash = await hashToken(agentToken)
    const { data: token } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, agent_name, hmac_secret, status)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!token?.agents) {
      return new Response(
        JSON.stringify({ error: 'Token invalido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const agent = token.agents as unknown as { 
      id: string; 
      agent_name: string; 
      hmac_secret: string; 
      status: string;
    }
    
    // HMAC verification
    if (!agent.hmac_secret) {
      logger.error('[PROXY] Agent without HMAC secret', { agentName: agent.agent_name })
      return new Response(
        JSON.stringify({ error: 'HMAC secret not configured for agent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret)
    if (!hmacResult.valid) {
      logger.warn('[PROXY] HMAC verification failed', { 
        agentName: agent.agent_name, 
        errorCode: hmacResult.errorCode
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

    // Parse body after HMAC verification
    let osInfo: OSInfo = {}
    if (hmacResult.rawBody) {
      try {
        const parsedBody = JSON.parse(hmacResult.rawBody)
        osInfo = parsedBody || {}
      } catch {
        // Empty or invalid body is OK for legacy heartbeats
      }
    }

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, agent.agent_name, 'heartbeat', {
      maxRequests: 3,
      windowMinutes: 1,
      blockMinutes: 5,
    })

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit excedido',
          resetAt: rateLimitResult.resetAt 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    logger.info('[PROXY] Heartbeat received via legacy endpoint', { agentName: agent.agent_name })

    // Build update data
    interface AgentUpdate {
      last_heartbeat: string;
      status: string;
      os_type?: string;
      os_version?: string;
      hostname?: string;
      agent_version?: string;
    }

    const updateData: AgentUpdate = { 
      last_heartbeat: new Date().toISOString(),
      status: 'active'
    }
    
    if (osInfo.os_type || osInfo.platform) {
      // Normalize os_type to lowercase (Windows -> windows, Linux -> linux, macOS -> macos)
      const rawOsType = osInfo.os_type || osInfo.platform || ''
      updateData.os_type = rawOsType.toLowerCase()
    }
    if (osInfo.os_version) {
      updateData.os_version = osInfo.os_version
    }
    if (osInfo.hostname) {
      updateData.hostname = osInfo.hostname
    }
    if (osInfo.agent_version) {
      updateData.agent_version = osInfo.agent_version
    }

    // Update agent
    const { error: updateError } = await supabase
      .from('agents')
      .update(updateData)
      .eq('id', agent.id)

    if (updateError) {
      logger.error('[PROXY] Failed to update agent heartbeat', {
        error: updateError,
        agentId: agent.id,
        agentName: agent.agent_name
      })
    } else {
      logger.success('[PROXY] Agent heartbeat updated successfully', { agentName: agent.agent_name })
    }

    // Update token last_used_at
    await supabase
      .from('agent_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)

    return new Response(
      JSON.stringify({ 
        ok: true,
        agent: agent.agent_name,
        timestamp: new Date().toISOString(),
        proxy: true,
        message: 'Heartbeat received via legacy endpoint - please update agent to v4.0.7+'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'agent-heartbeat-proxy')
  }
})
