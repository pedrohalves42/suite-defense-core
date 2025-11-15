import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { AgentTokenSchema } from '../_shared/validation.ts'
import { corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { logger } from '../_shared/logger.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const agentToken = req.headers.get('X-Agent-Token')
    if (!agentToken) {
      return new Response(
        JSON.stringify({ 
          status: 'error',
          error: 'unauthorized',
          code: 'AUTH_MISSING_TOKEN',
          message: 'Token do agente necessário' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const tokenValidation = AgentTokenSchema.safeParse(agentToken)
    if (!tokenValidation.success) {
      return new Response(
        JSON.stringify({ 
          status: 'error',
          error: 'unauthorized',
          code: 'AUTH_INVALID_TOKEN_FORMAT',
          message: 'Formato de token inválido' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { data: token } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, agent_name, hmac_secret, status)')
      .eq('token', agentToken)
      .eq('is_active', true)
      .maybeSingle()

    if (!token?.agents) {
      return new Response(
        JSON.stringify({ 
          status: 'error',
          error: 'unauthorized',
          code: 'AUTH_INVALID_TOKEN',
          message: 'Token inválido ou expirado' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const agent = token.agents as unknown as { 
      id: string; 
      agent_name: string; 
      hmac_secret: string; 
      status: string;
    }

    if (!agent.hmac_secret) {
      logger.error('Agent without HMAC secret', { agentName: agent.agent_name })
      return new Response(
        JSON.stringify({ 
          status: 'error',
          error: 'configuration_error',
          code: 'AUTH_HMAC_NOT_CONFIGURED',
          message: 'HMAC secret não configurado para este agente' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret)
    if (!hmacResult.valid) {
      logger.warn('Health check HMAC failed', { 
        agentName: agent.agent_name, 
        errorCode: hmacResult.errorCode,
        ip: req.headers.get('x-forwarded-for')
      })
      
      return new Response(
        JSON.stringify({ 
          status: 'error',
          error: 'unauthorized',
          code: hmacResult.errorCode,
          message: hmacResult.errorMessage,
          transient: hmacResult.transient
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Health check success', { agentName: agent.agent_name })

    return new Response(
      JSON.stringify({ 
        status: 'ok',
        agent: {
          id: agent.id,
          name: agent.agent_name,
          status: agent.status
        },
        server: {
          timestamp: new Date().toISOString(),
          version: '3.0.0'
        },
        hmac: {
          valid: true,
          algorithm: 'HMAC-SHA256'
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error: any) {
    logger.error('Health check error', error)
    return new Response(
      JSON.stringify({ 
        status: 'error',
        error: 'internal_error',
        code: 'SERVER_ERROR',
        message: 'Erro interno do servidor' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
