import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { AgentTokenSchema } from '../_shared/validation.ts'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logger } from '../_shared/logger.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verificar token do agente
    const agentToken = req.headers.get('X-Agent-Token')
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Token do agente necessário' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // CORREÇÃO: Interface explícita para OS info
    interface OSInfo {
      os_type?: string;
      os_version?: string;
      hostname?: string;
    }

    let osInfo: OSInfo = {}
    try {
      const body = await req.json()
      osInfo = body || {}
    } catch {
      // Body vazio é OK para heartbeats legacy
    }

    // Validar formato do token
    const tokenValidation = AgentTokenSchema.safeParse(agentToken)
    if (!tokenValidation.success) {
      return new Response(
        JSON.stringify({ error: 'Formato de token inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Buscar agente pelo token
    const { data: token } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, agent_name, hmac_secret, status)')
      .eq('token', agentToken)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!token?.agents) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // CORREÇÃO: Schema garante agents como objeto único com tipagem explícita
    const agent = token.agents as unknown as { 
      id: string; 
      agent_name: string; 
      hmac_secret: string; 
      status: string;
    }
    
    // FASE 1.2: HMAC OBRIGATÓRIO - Agora hmac_secret é NOT NULL
    if (!agent.hmac_secret) {
      logger.error('CRITICAL SECURITY: Agent without HMAC secret', { agentName: agent.agent_name })
      return new Response(
        JSON.stringify({ error: 'HMAC secret not configured for agent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Verificar HMAC (obrigatório)
    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret)
    if (!hmacResult.valid) {
      logger.warn('HMAC verification failed', { 
        agentName: agent.agent_name, 
        errorCode: hmacResult.errorCode,
        errorMessage: hmacResult.errorMessage,
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
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

    // Rate limiting: 3 req/min (heartbeat a cada 60s + margem para retry)
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
    
    logger.debug('Heartbeat received', { agentName: agent.agent_name })
    logger.info('Heartbeat received successfully')

    // CORREÇÃO: Interface explícita em vez de any
    interface AgentUpdate {
      last_heartbeat: string;
      status: string;
      os_type?: string;
      os_version?: string;
      hostname?: string;
    }

    const updateData: AgentUpdate = { 
      last_heartbeat: new Date().toISOString(),
      status: 'active'
    }
    
    if (osInfo.os_type) {
      updateData.os_type = osInfo.os_type
    }
    if (osInfo.os_version) {
      updateData.os_version = osInfo.os_version
    }
    if (osInfo.hostname) {
      updateData.hostname = osInfo.hostname
    }

    const { error: updateError } = await supabase
      .from('agents')
      .update(updateData)
      .eq('id', agent.id)

    if (updateError) {
      logger.error('Failed to update agent heartbeat', updateError)
      return new Response(
        JSON.stringify({ error: 'Erro ao atualizar heartbeat' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Atualizar last_used_at do token
    await supabase
      .from('agent_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', agentToken)

    logger.success('Agent heartbeat updated successfully')

    return new Response(
      JSON.stringify({ 
        ok: true,
        agent: agent.agent_name,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'heartbeat')
  }
})
