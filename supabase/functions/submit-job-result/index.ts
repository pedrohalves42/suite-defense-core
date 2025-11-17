import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logSecurityEvent } from '../_shared/security-log.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // 1. Autenticação via X-Agent-Token
    const agentToken = req.headers.get('X-Agent-Token')
    if (!agentToken) {
      await logSecurityEvent(supabase, {
        attack_type: 'unauthorized_access',
        severity: 'medium',
        endpoint: '/submit-job-result',
        blocked: true,
        details: { reason: 'Missing X-Agent-Token' },
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
      })
      return new Response(
        JSON.stringify({ error: 'X-Agent-Token header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Buscar agente via token
    const { data: token, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, agent_name, tenant_id, hmac_secret)')
      .eq('token', agentToken)
      .eq('is_active', true)
      .maybeSingle()

    if (tokenError || !token?.agents) {
      await logSecurityEvent(supabase, {
        attack_type: 'invalid_token',
        severity: 'high',
        endpoint: '/submit-job-result',
        blocked: true,
        details: { token_prefix: agentToken.substring(0, 8) },
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
      })
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const agent = Array.isArray(token.agents) ? token.agents[0] : token.agents

    // 2. Verificar HMAC obrigatório
    if (!agent.hmac_secret) {
      console.error('[submit-job-result] CRITICAL: Agent without HMAC secret:', agent.agent_name)
      return new Response(
        JSON.stringify({ error: 'HMAC secret not configured for agent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret)
    if (!hmacResult.valid) {
      await logSecurityEvent(supabase, {
        attack_type: 'hmac_validation_failure',
        severity: 'high',
        endpoint: '/submit-job-result',
        blocked: true,
        details: {
          agent_name: agent.agent_name,
          tenant_id: agent.tenant_id,
          error_code: hmacResult.errorCode
        },
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
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

    // 3. Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, agent.agent_name, 'submit-job-result', {
      maxRequests: 100,
      windowMinutes: 1,
      blockMinutes: 5
    })

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          resetAt: rateLimitResult.resetAt
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Parse payload
    const payload = await req.json()

    // Validação de schema v3
    if (!payload.job_id || typeof payload.job_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid payload: job_id required (string)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const jobIdValidation = JobIdSchema.safeParse(job_id)
    if (!jobIdValidation.success) {
      return new Response(
        JSON.stringify({ error: 'Formato de job_id inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validar status
    if (!status || !['completed', 'failed'].includes(status)) {
      return new Response(
        JSON.stringify({ error: 'status deve ser "completed" ou "failed"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[submit-job-result] Processing:', {
      job_id,
      agent: agent.agent_name,
      status,
      has_output: !!output,
      has_error: !!error_message,
      execution_time: execution_time_seconds
    })

    // Buscar o job
    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('id, agent_name, tenant_id, status')
      .eq('id', job_id)
      .single()

    if (fetchError || !job) {
      console.error('[submit-job-result] Job not found:', job_id)
      return new Response(
        JSON.stringify({ error: 'Job não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validar que o job pertence ao agente
    if (job.agent_name !== agent.agent_name) {
      console.error('[submit-job-result] Job ownership mismatch:', {
        job_id,
        job_agent: job.agent_name,
        requesting_agent: agent.agent_name
      })
      return new Response(
        JSON.stringify({ error: 'Este job não pertence ao agente autenticado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validar tenant
    if (job.tenant_id !== agent.tenant_id) {
      console.error('[submit-job-result] Tenant mismatch:', {
        job_id,
        job_tenant: job.tenant_id,
        agent_tenant: agent.tenant_id
      })
      return new Response(
        JSON.stringify({ error: 'Tenant mismatch' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar se já está concluído (idempotência)
    if (['done', 'completed', 'failed'].includes(job.status)) {
      console.log('[submit-job-result] Job already done:', job_id)
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Job já estava concluído',
          job_id
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Atualizar o job
    const updateData: Record<string, any> = {
      status: status,
      completed_at: new Date().toISOString()
    }

    // Adicionar campos extras se existirem
    if (output !== undefined) {
      updateData.output = output
    }
    if (error_message) {
      updateData.error_message = error_message
    }
    if (execution_time_seconds !== undefined) {
      updateData.execution_time_seconds = execution_time_seconds
    }

    const { error: updateError } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', job_id)

    if (updateError) {
      console.error('[submit-job-result] Error updating job:', updateError)
      return new Response(
        JSON.stringify({ error: 'Erro ao atualizar job', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[submit-job-result] Job completed successfully:', {
      job_id,
      agent: agent.agent_name,
      final_status: status
    })

    return new Response(
      JSON.stringify({ 
        success: true,
        job_id,
        message: `Job marcado como ${status}`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'submit-job-result')
  }
})
