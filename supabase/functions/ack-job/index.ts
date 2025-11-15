import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { JobIdSchema, AgentTokenSchema } from '../_shared/validation.ts'
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
      console.error('[ack-job] CRITICAL SECURITY: Agent without HMAC secret:', agent.agent_name)
      return new Response(
        JSON.stringify({ error: 'HMAC secret not configured for agent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Verificar HMAC (obrigatório)
    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret)
    if (!hmacResult.valid) {
      console.warn('[ack-job] HMAC verification failed:', {
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
    const rateLimitResult = await checkRateLimit(supabase, agent.agent_name, 'ack-job', {
      maxRequests: 60,
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
    
    // Atualizar last_used_at do token
    await supabase
      .from('agent_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', agentToken)

    // Extrair job_id da URL ou do body (prioridade: URL para compatibilidade)
    const url = new URL(req.url)
    const jobIdFromUrl = url.pathname.split('/').pop()

    let jobId: string | null = null

    // Prioridade 1: job_id na URL (para compatibilidade com clientes existentes)
    if (jobIdFromUrl && jobIdFromUrl !== 'ack-job') {
      jobId = jobIdFromUrl
    }

    // Prioridade 2: job_id no body (para consistência com upload-report)
    if (!jobId) {
      try {
        const body = await req.json()
        jobId = body.job_id
      } catch {
        // Ignore parse errors, será tratado abaixo
      }
    }

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'job_id ausente (esperado na URL ou body)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Validar formato do job ID
    const jobIdValidation = JobIdSchema.safeParse(jobId)
    if (!jobIdValidation.success) {
      return new Response(
        JSON.stringify({ error: 'Formato de job ID inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const validatedJobId = jobIdValidation.data

    console.log('[ACK] Job:', validatedJobId, 'por agente:', agent.agent_name)

    // Buscar job primeiro para validar
    const { data: existingJob, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', validatedJobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError || !existingJob) {
      console.error('[ACK] Job não encontrado:', validatedJobId, fetchError)
      return new Response(
        JSON.stringify({ error: 'Job não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Verificar se job pertence ao agente
    if (existingJob.agent_name !== agent.agent_name) {
      console.error('[ACK] Job pertence a outro agente:', existingJob.agent_name, '!=', agent.agent_name)
      return new Response(
        JSON.stringify({ error: 'Job pertence a outro agente' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // Idempotência: se já está done, retornar sucesso
    if (existingJob.status === 'done') {
      console.log('[ACK] Job já estava confirmado (idempotente):', validatedJobId)
      return new Response(
        JSON.stringify({ ok: true, message: 'Job já estava confirmado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Atualizar status do job
    const { error: updateError, data: updatedJob } = await supabase
      .from('jobs')
      .update({ 
        status: 'done',
        completed_at: new Date().toISOString()
      })
      .eq('id', validatedJobId)
      .eq('agent_name', agent.agent_name)
      .select()
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (updateError) {
      console.error('[ACK] Erro ao atualizar job:', updateError)
      return new Response(
        JSON.stringify({ error: 'Erro ao atualizar job' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    console.log('[ACK] Job confirmado com sucesso:', validatedJobId, updatedJob)

    return new Response(
      JSON.stringify({ ok: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'ack-job')
  }
})
