import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { AgentTokenSchema } from '../_shared/validation.ts'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logger } from '../_shared/logger.ts'
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts'
import { hashToken } from '../_shared/token-hash.ts'

Deno.serve(async (req) => {
  // QUAL-01: Proper HTTP method validation
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }
  
  const methodError = validateHttpMethod(req, ['POST', 'GET'])
  if (methodError) return methodError

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verificar token do agente
    const agentToken = req.headers.get('X-Agent-Token')
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Token do agente necessario' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Validar formato do token
    const tokenValidation = AgentTokenSchema.safeParse(agentToken)
    if (!tokenValidation.success) {
      return new Response(
        JSON.stringify({ error: 'Formato de token invalido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // FASE 2: Buscar agente pelo hash do token
    const tokenHash = await hashToken(agentToken)
    const { data: token } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(agent_name, hmac_secret)')
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

    const agent = Array.isArray(token.agents) ? token.agents[0] : token.agents
 
    // FASE 1.2: HMAC OBRIGATORIO - Agora hmac_secret e NOT NULL
    if (!agent.hmac_secret) {
      logger.error('CRITICAL SECURITY: Agent without HMAC secret', { agentName: agent.agent_name })
      return new Response(
        JSON.stringify({ error: 'HMAC secret not configured for agent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Verificar HMAC (obrigatorio)
    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret)
    if (!hmacResult.valid) {
      logger.warn('HMAC verification failed', {
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

    logger.debug('Agent polling', { agentName: agent.agent_name })

    // FASE CORRECAO: Verificar se agente está online antes de entregar jobs
    // Buscar dados completos do agente incluindo last_heartbeat
    const { data: agentData, error: agentError } = await supabase
      .from('agents')
      .select('id, last_heartbeat, status')
      .eq('id', token.agent_id)
      .single()

    if (agentError || !agentData) {
      logger.error('Error fetching agent data', { error: agentError?.message, agentId: token.agent_id })
      return new Response(
        JSON.stringify({ error: 'Agent not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // VALIDACAO CRITICA: Não entregar jobs para agentes que estavam offline >24h
    // (exceto se este poll está "ressuscitando" o agente)
    const now = new Date()
    const lastHeartbeat = agentData.last_heartbeat ? new Date(agentData.last_heartbeat) : null
    const hoursSinceHeartbeat = lastHeartbeat 
      ? (now.getTime() - lastHeartbeat.getTime()) / (1000 * 60 * 60)
      : Infinity

    // Se estava offline >24h, primeiro apenas atualizar heartbeat e retornar vazio
    // Na próxima poll (após heartbeat atualizado), jobs serão entregues normalmente
    if (hoursSinceHeartbeat > 24) {
      logger.warn('Agent was offline >24h, updating heartbeat but not delivering jobs yet', {
        agentName: agent.agent_name,
        hoursSinceHeartbeat: hoursSinceHeartbeat.toFixed(2),
        lastHeartbeat: agentData.last_heartbeat
      })
      
      // Atualizar apenas heartbeat (sem entregar jobs)
      await supabase
        .from('agents')
        .update({ last_heartbeat: now.toISOString(), status: 'active' })
        .eq('id', token.agent_id)
      
      await supabase
        .from('agent_tokens')
        .update({ last_used_at: now.toISOString() })
        .eq('token_hash', tokenHash)
      
      return new Response(
        JSON.stringify([]),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Atualizar heartbeat e last_used_at do token (usando hash)
    await Promise.all([
      supabase
        .from('agents')
        .update({ last_heartbeat: now.toISOString() })
        .eq('agent_name', agent.agent_name),
      supabase
        .from('agent_tokens')
        .update({ last_used_at: now.toISOString() })
        .eq('token_hash', tokenHash)
    ])

    logger.info('Fetching jobs for agent', { agentName: agent.agent_name, agentId: token.agent_id })
    
    // Buscar jobs pendentes (max 3) - usando agent_name OU agent_id
    // P1: Ordenar por prioridade (1=critical, 2=standard, 3=heavy) e depois por created_at
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id, type, payload, approved, agent_id, agent_name, status, created_at, priority')
      .or(`agent_name.eq.${agent.agent_name},agent_id.eq.${token.agent_id}`)
      .eq('status', 'queued')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(3)

    if (jobsError) {
      logger.error('Error fetching jobs', { error: jobsError.message, agentName: agent.agent_name })
      return new Response(
        JSON.stringify([]),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // LOG CRÍTICO: mostrar jobs encontrados antes de qualquer filtro
    logger.info('Jobs found in database', { 
      agentName: agent.agent_name,
      jobCount: jobs?.length ?? 0,
      jobIds: jobs?.map(j => j.id) ?? [],
      jobTypes: jobs?.map(j => j.type) ?? []
    })

    // Filtro de validação (null, ID, type, payload)
    const validJobs = (jobs || []).filter(job => {
      if (!job) {
        logger.warn('NULL job detected, filtering out')
        return false
      }
      if (!job.id || typeof job.id !== 'string') {
        logger.warn('Job without valid ID', { job })
        return false
      }
      if (!job.type || typeof job.type !== 'string') {
        logger.warn('Job without valid type', { jobId: job.id })
        return false
      }
      // Payload pode ser {} mas não null/undefined
      if (job.payload === undefined || job.payload === null) {
        logger.warn('Job without payload', { jobId: job.id })
        return false
      }
      return true
    })

    logger.info('Valid jobs after filtering', { 
      count: validJobs.length,
      validJobIds: validJobs.map(j => j.id)
    })

    // Se não há jobs válidos, retornar array vazio imediatamente
    if (validJobs.length === 0) {
      logger.debug('No valid jobs to return', { agentName: agent.agent_name })
      return new Response(
        JSON.stringify([]),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Preparar resposta ANTES de marcar como delivered
    const jobsResponse = validJobs.map(j => ({
      id: j.id,
      type: j.type,
      payload: j.payload || {},
      approved: j.approved ?? true,
      agent_id: j.agent_id || token.agent_id
    }))

    // LOG CRÍTICO: mostrar exatamente o que será retornado
    logger.info('Jobs to return to agent', { 
      agentName: agent.agent_name,
      responseCount: jobsResponse.length,
      response: JSON.stringify(jobsResponse)
    })

    // AGORA marcar jobs como entregues (apenas após preparar resposta)
    const jobIds = validJobs.map(j => j.id)
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ 
        status: 'delivered',
        delivered_at: new Date().toISOString()
      })
      .in('id', jobIds)

    if (updateError) {
      logger.error('Error updating job status to delivered', { error: updateError.message, jobIds })
      // Ainda retorna os jobs - agente deve processá-los
    } else {
      logger.success('Jobs marked as delivered', { jobIds, count: jobIds.length })
    }

    // Retornar jobs ao agente
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
