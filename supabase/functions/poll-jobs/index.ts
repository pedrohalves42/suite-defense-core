import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { normalizeVersion } from '../_shared/hexagonal/update-decision-service.ts'
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
      .select('agent_id, agents!inner(agent_name, hmac_secret, agent_version)')
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
 
    // DIAGNOSTIC: Log HTTP method and HMAC header presence for fleet analysis
    const httpMethod = req.method
    const hasHmacSignature = !!req.headers.get('X-HMAC-Signature')
    const hasHmacTimestamp = !!(req.headers.get('X-HMAC-Timestamp') || req.headers.get('X-Timestamp'))
    const hasHmacNonce = !!(req.headers.get('X-HMAC-Nonce') || req.headers.get('X-Nonce'))
    const hasAnyHmacHeader = hasHmacSignature || hasHmacTimestamp || hasHmacNonce
    
    if (httpMethod === 'GET') {
      logger.warn('DIAGNOSTIC: Agent using GET method (pre-hotfix script)', {
        agentName: agent.agent_name,
        method: httpMethod,
        hasHmacHeaders: hasAnyHmacHeader,
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
      })
    }
    
    if (!hasAnyHmacHeader) {
      logger.warn('DIAGNOSTIC: Agent poll-jobs request WITHOUT HMAC headers', {
        agentName: agent.agent_name,
        method: httpMethod,
        hasSignature: hasHmacSignature,
        hasTimestamp: hasHmacTimestamp,
        hasNonce: hasHmacNonce,
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
      })
    }

    // V-702 FIX: HMAC enforcement for modern agents (v5.0.12+)
    const HMAC_REQUIRED_MIN_VERSION = '5.0.12'
    const agentVersionStr = (agent as any).agent_version || ''
    const currentNormV = normalizeVersion(agentVersionStr)
    const hmacMinNormV = normalizeVersion(HMAC_REQUIRED_MIN_VERSION)
    const isModernAgent = !!(currentNormV && hmacMinNormV && currentNormV >= hmacMinNormV)

    if (hasAnyHmacHeader) {
      const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret, {
        agentId: token.agent_id,
        tenantId: undefined,
        endpoint: 'poll-jobs',
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined
      })
      if (!hmacResult.valid) {
        if (isModernAgent) {
          // V-702: BLOCK modern agents with invalid HMAC
          logger.error('SECURITY: HMAC verification FAILED for modern agent poll-jobs - BLOCKED', {
            agent: agent.agent_name,
            agentVersion: agentVersionStr,
            errorCode: hmacResult.errorCode,
            ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
          })
          return new Response(
            JSON.stringify({ error: 'HMAC verification failed', code: 'HMAC_INVALID' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        logger.warn('HMAC verification failed - accepting legacy agent poll-jobs', {
          agent: agent.agent_name,
          agentVersion: agentVersionStr,
          errorCode: hmacResult.errorCode,
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
        })
      } else {
        logger.debug('HMAC verified for poll-jobs', { agent: agent.agent_name })
      }
    } else {
      if (isModernAgent) {
        // V-702: BLOCK modern agents without HMAC headers
        logger.error('SECURITY: Modern agent poll-jobs WITHOUT HMAC headers - BLOCKED', {
          agent: agent.agent_name,
          agentVersion: agentVersionStr,
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
        })
        return new Response(
          JSON.stringify({ error: 'HMAC headers required', code: 'HMAC_MISSING' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      logger.warn('Poll-jobs accepted without HMAC (legacy agent)', {
        agent: agent.agent_name,
        agentVersion: agentVersionStr,
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
      })
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
    // Buscar dados completos do agente incluindo last_heartbeat e agent_version
    const { data: agentData, error: agentError } = await supabase
      .from('agents')
      .select('id, last_heartbeat, status, agent_version')
      .eq('id', token.agent_id)
      .single()

    if (agentError || !agentData) {
      logger.error('Error fetching agent data', { error: agentError?.message, agentId: token.agent_id })
      return new Response(
        JSON.stringify({ error: 'Agent not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // COMPAT: Detectar versão do agente para formato de resposta
    const agentVersionForCompat = agentData.agent_version || 'v0.0.0'
    const parseVersion = (v: string): number[] => {
      const m = v.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/)
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0]
    }
    const agentVer = parseVersion(agentVersionForCompat)
    // Agentes <= v5.0.11 esperam array plano; >= v5.0.12 suportam formato encapsulado
    const isLegacyAgent = agentVer[0] < 5 || (agentVer[0] === 5 && agentVer[1] === 0 && agentVer[2] <= 11)
    
    if (isLegacyAgent) {
      logger.warn('COMPAT: Legacy agent detected, will use flat array response', {
        agentName: agent.agent_name,
        agentVersion: agentVersionStr,
      })
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
        JSON.stringify(isLegacyAgent ? [] : { jobs: [], poll_interval_seconds: 600 }), // offline recovery - very slow poll
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // COST-OPT v4.1: Removido update de last_heartbeat aqui — já feito pelo heartbeat dedicado (10min)
    // Apenas atualizar last_used_at do token para tracking de uso
    await supabase
      .from('agent_tokens')
      .update({ last_used_at: now.toISOString() })
      .eq('token_hash', tokenHash)

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
        JSON.stringify(isLegacyAgent ? [] : { jobs: [], poll_interval_seconds: 600 }), // backlog limit - slow poll
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }
    
    // P0-003: Usar RPC claim_jobs_for_agent para claiming atômico com locking
    // Isso previne race conditions e garante que apenas um processo pode reclamar cada job
    // A RPC já filtra por expires_at > NOW() e já marca como 'delivered' atomicamente
    // FASE 4: Agora também cria job_executions para trilha de auditoria imutável
    interface ClaimedJob {
      job_id: string
      job_type: string
      payload: Record<string, unknown>
      execution_id: string    // ID da execução (job_executions)
      nonce: string           // Nonce único para esta execução
      payload_hash: string    // SHA256 do payload para verificação
      expires_at: string
      // Hash Chain fields (P1.5)
      execution_index: number | null
      previous_execution_hash: string | null
    }
    
    // Buscar tenant_id do agente para a RPC
    const { data: agentFullData } = await supabase
      .from('agents')
      .select('tenant_id')
      .eq('id', token.agent_id)
      .single()
    
    const { data: jobs, error: jobsError } = await supabase
      .rpc('claim_jobs_for_agent', {
        p_agent_id: token.agent_id,
        p_limit: 3
      }) as { data: ClaimedJob[] | null, error: { message: string } | null }

    if (jobsError) {
      logger.error('Error claiming jobs', { 
        error: jobsError.message, 
        errorFull: JSON.stringify(jobsError),
        agentName: agent.agent_name,
        agentId: token.agent_id
      })
      return new Response(
        JSON.stringify(isLegacyAgent ? [] : { jobs: [], poll_interval_seconds: 300 }), // claim error - normal poll
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // LOG CRÍTICO: mostrar jobs reclamados atomicamente (com execution_id)
    logger.info('Jobs claimed atomically with executions', { 
      agentName: agent.agent_name,
      jobCount: jobs?.length ?? 0,
      jobIds: jobs?.map((j: ClaimedJob) => j.job_id) ?? [],
      jobTypes: jobs?.map((j: ClaimedJob) => j.job_type) ?? [],
      executionIds: jobs?.map((j: ClaimedJob) => j.execution_id) ?? []
    })

    // Filtro de validação (null, ID, type, payload, execution_id)
    const validJobs = (jobs || []).filter((job: ClaimedJob) => {
      if (!job) {
        logger.warn('NULL job detected, filtering out')
        return false
      }
      if (!job.job_id || typeof job.job_id !== 'string') {
        logger.warn('Job without valid job_id', { job })
        return false
      }
      if (!job.job_type || typeof job.job_type !== 'string') {
        logger.warn('Job without valid job_type', { jobId: job.job_id })
        return false
      }
      // Payload pode ser {} mas não null/undefined
      if (job.payload === undefined || job.payload === null) {
        logger.warn('Job without payload', { jobId: job.job_id })
        return false
      }
      // Execution ID é obrigatório na nova arquitetura
      if (!job.execution_id || typeof job.execution_id !== 'string') {
        logger.warn('Job without execution_id', { jobId: job.job_id })
        return false
      }
      return true
    })

    logger.info('Valid jobs after filtering', { 
      count: validJobs.length,
      validJobIds: validJobs.map((j: ClaimedJob) => j.job_id)
    })

    // Se não há jobs válidos, retornar array vazio imediatamente
    if (validJobs.length === 0) {
      logger.debug('No valid jobs to return', { agentName: agent.agent_name })
      return new Response(
        JSON.stringify(isLegacyAgent ? [] : { jobs: [], poll_interval_seconds: 600 }), // no jobs - slow poll (COST-OPT v4: 10min backoff when idle)
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
    // Agora inclui execution_id, nonce e payload_hash para trilha de auditoria
    const jobsResponse = await Promise.all(validJobs.map(async (j: ClaimedJob) => {
      const jobPayload = j.payload || {}
      
      // Sign the job - MANDATORY when key is configured (SSA-004)
      let signatureInfo: { payload_signature?: string; signing_alg?: string } = {}
      
      if (signingEnabled && privateKey) {
        try {
          const signed = await signJob(j.job_id, j.job_type, jobPayload, privateKey)
          signatureInfo = {
            payload_signature: signed.signature,
            signing_alg: signed.algorithm
          }
          logger.debug('Job signed successfully', { jobId: j.job_id, algorithm: signed.algorithm })
        } catch (signError) {
          logger.error('CRITICAL: Failed to sign job - SKIPPING delivery to prevent unsigned job', { 
            jobId: j.job_id, 
            jobType: j.job_type,
            error: signError instanceof Error ? signError.message : 'Unknown error'
          })
          // Return null to filter out this job - never deliver unsigned jobs
          return null
        }
      }
      
      return {
        id: j.job_id,
        type: j.job_type,
        job_type: j.job_type,  // V-ZEROGAP: compat with v5 agents that read job_type
        payload: jobPayload,
        approved: true,
        agent_id: token.agent_id,
        expires_at: j.expires_at,
        // FASE 4: Trilha de auditoria imutável
        execution_id: j.execution_id,
        nonce: j.nonce,
        payload_hash: j.payload_hash,
        // P1.5: Hash Chain context for agent
        execution_index: j.execution_index,
        previous_execution_hash: j.previous_execution_hash,
        ...signatureInfo
      }
    })).then(results => results.filter(Boolean))

    // LOG CRÍTICO: mostrar exatamente o que será retornado (com execution tracking)
    logger.info('Jobs to return to agent with execution tracking', { 
      agentName: agent.agent_name,
      responseCount: jobsResponse.length,
      signingEnabled,
      executionIds: jobsResponse.map(j => j!.execution_id),
      response: JSON.stringify(jobsResponse)
    })

    // Jobs já foram marcados como 'delivered' atomicamente pela RPC claim_jobs_for_agent
    // E job_executions criadas para trilha de auditoria
    logger.success('Jobs delivered via atomic claim with audit trail', { 
      jobIds: validJobs.map((j: ClaimedJob) => j.job_id), 
      executionIds: validJobs.map((j: ClaimedJob) => j.execution_id),
      count: validJobs.length 
    })

    // Retornar jobs ao agente
    // COMPAT: Legacy agents (<= v5.0.11) recebem array plano
    // Novos agentes (>= v5.0.12) recebem { jobs, poll_interval_seconds }
    if (isLegacyAgent) {
      logger.info('COMPAT: Returning flat array for legacy agent', {
        agentName: agent.agent_name,
        agentVersion: agentVersionStr,
        jobCount: jobsResponse.length,
      })
      // PROTEÇÃO: Para agentes legacy, entregar APENAS jobs de recuperação
      // Jobs operacionais serão desperdiçados (agente não consegue parseá-los corretamente)
      const recoveryTypes = ['update_agent', 'reinstall_agent', 'force_update']
      const recoveryJobs = jobsResponse.filter(j => j && recoveryTypes.includes(j.type || j.job_type || ''))
      const blockedCount = jobsResponse.length - recoveryJobs.length
      
      if (blockedCount > 0) {
        logger.warn('COMPAT: Blocked operational jobs for legacy agent (would waste cycles)', {
          agentName: agent.agent_name,
          agentVersion: agentVersionStr,
          blocked: blockedCount,
          delivered: recoveryJobs.length,
          blockedTypes: jobsResponse
            .filter(j => j && !recoveryTypes.includes(j.type || j.job_type || ''))
            .map(j => j!.type || j!.job_type),
        })
        
        // Cancelar os jobs bloqueados para liberar a fila de dedup
        const blockedJobIds = jobsResponse
          .filter(j => j && !recoveryTypes.includes(j.type || j.job_type || ''))
          .map(j => j!.id)
          .filter(Boolean)
        
        if (blockedJobIds.length > 0) {
          await supabase
            .from('jobs')
            .update({ 
              status: 'cancelled', 
              error_message: `Blocked: agent ${agentVersionStr} is legacy and cannot process this job type. Update required.`
            })
            .in('id', blockedJobIds)
        }
      }
      
      return new Response(
        JSON.stringify(recoveryJobs),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    // Novo formato encapsulado para agentes modernos
    const responsePayload = {
      jobs: jobsResponse,
      poll_interval_seconds: 300, // COST-OPT v4: 120s → 300s (5min when jobs exist)
    };
    return new Response(
      JSON.stringify(responsePayload),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'poll-jobs')
  }
})
