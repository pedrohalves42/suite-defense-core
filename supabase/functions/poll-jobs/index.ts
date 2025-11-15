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
 
    // FASE 1.2: HMAC OBRIGATÓRIO - Agora hmac_secret é NOT NULL
    if (!agent.hmac_secret) {
      console.error('[poll-jobs] CRITICAL SECURITY: Agent without HMAC secret:', agent.agent_name)
      return new Response(
        JSON.stringify({ error: 'HMAC secret not configured for agent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Verificar HMAC (obrigatório)
    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret)
    if (!hmacResult.valid) {
      console.warn('[poll-jobs] HMAC verification failed:', {
        agent: agent.agent_name,
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
      // Em caso de erro, retornar array vazio em vez de lançar exceção
      return new Response(
        JSON.stringify([]),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // CRÍTICO: Filtrar jobs nulos, sem ID ou sem tipo (garantir array limpo)
    const validJobs = (jobs || []).filter(job => {
      if (!job) {
        console.warn('[poll-jobs] Null job found, filtering out')
        return false
      }
      if (!job.id) {
        console.warn('[poll-jobs] Job without ID found, filtering out', { job })
        return false
      }
      if (!job.type) {
        console.warn('[poll-jobs] Job without type found, filtering out', { jobId: job.id })
        return false
      }
      return true
    })

    console.log(`[poll-jobs] Found ${validJobs.length} valid jobs (filtered from ${jobs?.length || 0} total)`)

    // Marcar jobs como entregues
    if (validJobs.length > 0) {
      const jobIds = validJobs.map(j => j.id)
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
        // Não lançar erro, apenas logar - jobs já foram buscados
      } else {
        console.log('[poll-jobs] Jobs marked as delivered successfully')
      }
    }

    // Retornar jobs válidos
    const jobsResponse = validJobs.map(j => ({
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
