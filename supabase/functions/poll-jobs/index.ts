import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { AgentTokenSchema } from '../_shared/validation.ts'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'

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

    // Validar formato do token
    const tokenValidation = AgentTokenSchema.safeParse(agentToken)
    if (!tokenValidation.success) {
      return new Response(
        JSON.stringify({ error: 'Formato de token inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Buscar agente pelo token na tabela dedicada
    const { data: token } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(agent_name, hmac_secret)')
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

    const agent = Array.isArray(token.agents) ? token.agents[0] : token.agents

    // Verificar HMAC se configurado
    if (agent.hmac_secret) {
      const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret)
      if (!hmacResult.valid) {
        return new Response(
          JSON.stringify({ error: hmacResult.error }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, agent.agent_name, 'poll-jobs', {
      maxRequests: 120,
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

    console.log('[poll-jobs] Agente polling:', agent.agent_name)

    // Atualizar heartbeat e last_used_at do token
    await Promise.all([
      supabase
        .from('agents')
        .update({ last_heartbeat: new Date().toISOString() })
        .eq('agent_name', agent.agent_name),
      supabase
        .from('agent_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('token', agentToken)
    ])

    console.log('[poll-jobs] Fetching jobs for agent:', agent.agent_name)
    // Buscar jobs pendentes (máx 3)
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('*')
      .eq('agent_name', agent.agent_name)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(3)

    if (jobsError) {
      console.error('[poll-jobs] Error fetching jobs:', jobsError)
      throw jobsError
    }

    console.log(`[poll-jobs] Found ${jobs?.length || 0} jobs`)

    // Marcar jobs como entregues
    if (jobs && jobs.length > 0) {
      const jobIds = jobs.map(j => j.id)
      console.log('[poll-jobs] Marking jobs as delivered:', jobIds)
      
      const { error: updateError } = await supabase
        .from('jobs')
        .update({ 
          status: 'delivered',
          delivered_at: new Date().toISOString()
        })
        .in('id', jobIds)

      if (updateError) {
        console.error('[poll-jobs] Error updating job status:', updateError)
        throw updateError
      }
      
      console.log('[poll-jobs] Jobs marked as delivered successfully')
    }

    // Retornar jobs
    const jobsResponse = (jobs || []).map(j => ({
      id: j.id,
      type: j.type,
      payload: j.payload,
      approved: j.approved
    }))

    return new Response(
      JSON.stringify(jobsResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'poll-jobs')
  }
})
