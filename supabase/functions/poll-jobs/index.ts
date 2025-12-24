import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { AgentTokenSchema } from '../_shared/validation.ts'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logger } from '../_shared/logger.ts'
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts'
import { hashToken } from '../_shared/token-hash.ts'
import { signJob } from '../_shared/crypto-utils.ts'
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
    
    // SSA-026: Verificar backlog do agente antes de entregar mais jobs
    const MAX_PENDING_JOBS = 50
    const { count: pendingCount, error: countError } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', token.agent_id)
      .in('status', ['queued', 'delivered'])

    if (!countError && (pendingCount || 0) >= MAX_PENDING_JOBS) {
      logger.warn('SSA-026: Agent hit job limit, not delivering new jobs', { 
        agentName: agent.agent_name, 
        pendingCount, 
        maxLimit: MAX_PENDING_JOBS 
      })
      return new Response(
        JSON.stringify([]),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }
    
    // P0-003: Usar RPC claim_jobs_for_agent para claiming atômico com locking
    // Isso previne race conditions e garante que apenas um processo pode reclamar cada job
    // A RPC já filtra por expires_at > NOW() e já marca como 'delivered' atomicamente
    interface ClaimedJob {
      id: string
      type: string
      payload: Record<string, unknown>
      approved: boolean
      agent_id: string | null
      agent_name: string | null
      priority: number
      created_at: string
      expires_at: string
    }
    
    const { data: jobs, error: jobsError } = await supabase
      .rpc('claim_jobs_for_agent', {
        p_agent_id: token.agent_id,
        p_agent_name: agent.agent_name,
        p_limit: 3
      }) as { data: ClaimedJob[] | null, error: { message: string } | null }

    if (jobsError) {
      logger.error('Error claiming jobs', { error: jobsError.message, agentName: agent.agent_name })
      return new Response(
        JSON.stringify([]),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // LOG CRÍTICO: mostrar jobs reclamados atomicamente
    logger.info('Jobs claimed atomically', { 
      agentName: agent.agent_name,
      jobCount: jobs?.length ?? 0,
      jobIds: jobs?.map((j: ClaimedJob) => j.id) ?? [],
      jobTypes: jobs?.map((j: ClaimedJob) => j.type) ?? []
    })

    // Filtro de validação (null, ID, type, payload)
    const validJobs = (jobs || []).filter((job: ClaimedJob) => {
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
      validJobIds: validJobs.map((j: ClaimedJob) => j.id)
    })

    // Se não há jobs válidos, retornar array vazio imediatamente
    if (validJobs.length === 0) {
      logger.debug('No valid jobs to return', { agentName: agent.agent_name })
      return new Response(
        JSON.stringify([]),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // SSA-004: Sign jobs with Ed25519 for RCE prevention
    const privateKey = Deno.env.get('ED25519_PRIVATE_KEY')
    const signingEnabled = !!privateKey
    
    if (!signingEnabled) {
      logger.warn('ED25519_PRIVATE_KEY not configured - jobs will be unsigned', { agentName: agent.agent_name })
    }

    // Preparar resposta - jobs já foram marcados como delivered pela RPC
    const jobsResponse = await Promise.all(validJobs.map(async (j: ClaimedJob) => {
      const jobPayload = j.payload || {}
      
      // Sign the job if private key is available
      let signatureInfo: { payload_signature?: string; signing_alg?: string } = {}
      
      if (signingEnabled && privateKey) {
        try {
          const signed = await signJob(j.id, j.type, jobPayload, privateKey)
          signatureInfo = {
            payload_signature: signed.signature,
            signing_alg: signed.algorithm
          }
          logger.debug('Job signed successfully', { jobId: j.id, algorithm: signed.algorithm })
        } catch (signError) {
          logger.error('Failed to sign job', { 
            jobId: j.id, 
            error: signError instanceof Error ? signError.message : 'Unknown error'
          })
          // Continue without signature - agents should handle this based on their config
        }
      }
      
      return {
        id: j.id,
        type: j.type,
        payload: jobPayload,
        approved: j.approved ?? true,
        agent_id: j.agent_id || token.agent_id,
        expires_at: j.expires_at, // P1: Incluir expires_at no payload para validação client-side
        ...signatureInfo
      }
    }))

    // LOG CRÍTICO: mostrar exatamente o que será retornado
    logger.info('Jobs to return to agent', { 
      agentName: agent.agent_name,
      responseCount: jobsResponse.length,
      signingEnabled,
      response: JSON.stringify(jobsResponse)
    })

    // Jobs já foram marcados como 'delivered' atomicamente pela RPC claim_jobs_for_agent
    logger.success('Jobs delivered via atomic claim', { 
      jobIds: validJobs.map((j: ClaimedJob) => j.id), 
      count: validJobs.length 
    })

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
