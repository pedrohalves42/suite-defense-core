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
    // 1. Autenticacao via X-Agent-Token
    const agentToken = req.headers.get('X-Agent-Token')
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    
    if (!agentToken) {
      await logSecurityEvent({
        supabase,
        ipAddress,
        endpoint: '/submit-job-result',
        attackType: 'unauthorized',
        severity: 'medium',
        blocked: true,
        details: { reason: 'Missing X-Agent-Token' }
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
      await logSecurityEvent({
        supabase,
        ipAddress,
        endpoint: '/submit-job-result',
        attackType: 'unauthorized',
        severity: 'high',
        blocked: true,
        details: { token_prefix: agentToken.substring(0, 8) }
      })
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const agent = Array.isArray(token.agents) ? token.agents[0] : token.agents

    // 2. Verificar HMAC obrigatorio
    if (!agent.hmac_secret) {
      console.error('[submit-job-result] CRITICAL: Agent without HMAC secret:', agent.agent_name)
      return new Response(
        JSON.stringify({ error: 'HMAC secret not configured for agent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret)
    if (!hmacResult.valid) {
      // DEBUG LOGGING: Enhanced error details
      console.error('[submit-job-result] HMAC validation failed:', {
        agent: agent.agent_name,
        error_code: hmacResult.errorCode,
        error_message: hmacResult.errorMessage,
        transient: hmacResult.transient,
        headers: {
          timestamp: req.headers.get('X-Timestamp'),
          nonce: req.headers.get('X-Nonce'),
          has_signature: !!req.headers.get('X-HMAC-Signature')
        }
      });
      
      await logSecurityEvent({
        supabase,
        tenantId: agent.tenant_id,
        ipAddress,
        endpoint: '/submit-job-result',
        attackType: 'unauthorized',
        severity: 'high',
        blocked: true,
        details: {
          agent_name: agent.agent_name,
          error_code: hmacResult.errorCode,
          error_message: hmacResult.errorMessage
        }
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
    
    // DEBUG LOGGING: Log successful validation
    console.log('[submit-job-result] HMAC validation SUCCESS for agent:', agent.agent_name);

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

    // ? BUG FIX P1: Extrair TODOS os campos v3, incluindo timestamps
    const job_id = payload.job_id
    const status = payload.status
    const output = payload.output
    const error_message = payload.error_message
    const execution_time_seconds = payload.execution_time_seconds
    const started_at = payload.started_at
    const finished_at = payload.finished_at

    // Validacao de schema v3
    if (!job_id || typeof job_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid payload: job_id required (string)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validar status
    if (!status || !['completed', 'failed'].includes(status)) {
      return new Response(
        JSON.stringify({ error: 'status must be "completed" or "failed"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ? BUG FIX P1: Validar execution_time_seconds se fornecido
    if (execution_time_seconds !== undefined && execution_time_seconds !== null) {
      if (typeof execution_time_seconds !== 'number' || execution_time_seconds < 0) {
        return new Response(
          JSON.stringify({ error: 'execution_time_seconds must be a positive number' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // ? BUG FIX P1: Alertar se execution_time fornecido sem timestamps
      if (!started_at || !finished_at) {
        console.warn('[submit-job-result] execution_time_seconds provided without timestamps', {
          job_id,
          agent: agent.agent_name,
          execution_time_seconds,
          has_started_at: !!started_at,
          has_finished_at: !!finished_at
        })
      }
    }

    console.log('[submit-job-result] Processing job result:', {
      job_id,
      agent: agent.agent_name,
      status,
      has_output: !!output,
      output_type: output ? typeof output : 'null',
      has_error: !!error_message,
      execution_time: execution_time_seconds,
      has_started_at: !!started_at,
      has_finished_at: !!finished_at,
      started_at_value: started_at,
      finished_at_value: finished_at
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
        JSON.stringify({ error: 'Job nao encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validar que o job pertence ao agente
    if (job.agent_name !== agent.agent_name) {
      await logSecurityEvent({
        supabase,
        tenantId: agent.tenant_id,
        ipAddress,
        endpoint: '/submit-job-result',
        attackType: 'unauthorized',
        severity: 'high',
        blocked: true,
        details: {
          reason: 'Job ownership mismatch',
          job_id,
          job_agent: job.agent_name,
          requesting_agent: agent.agent_name
        }
      })
      
      console.error('[submit-job-result] Job ownership mismatch:', {
        job_id,
        job_agent: job.agent_name,
        requesting_agent: agent.agent_name
      })
      return new Response(
        JSON.stringify({ error: 'Este job nao pertence ao agente autenticado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validacao extra: evitar acesso cross-tenant
    if (job.tenant_id !== agent.tenant_id) {
      await logSecurityEvent({
        supabase,
        tenantId: agent.tenant_id,
        ipAddress,
        endpoint: '/submit-job-result',
        attackType: 'unauthorized',
        severity: 'critical',
        blocked: true,
        details: {
          reason: 'Cross-tenant job access attempt',
          job_tenant: job.tenant_id,
          agent_tenant: agent.tenant_id,
          job_id,
          agent_name: agent.agent_name
        }
      })
      
      console.error('[submit-job-result] Cross-tenant access blocked:', {
        job_id,
        job_tenant: job.tenant_id,
        agent_tenant: agent.tenant_id
      })
      return new Response(
        JSON.stringify({
          error: 'Cross-tenant access denied',
          details: 'Job pertence a outra organizacao'
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Impedir que job seja processado duas vezes
    if (['done', 'completed', 'failed'].includes(job.status)) {
      console.log('[submit-job-result] Job already done:', job_id)
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Job ja estava concluido',
          job_id
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

     // ? BUG FIX P1: Atualizar o job com TODOS os campos v3, incluindo timestamps
    const updateData: Record<string, unknown> = {
      status: status,
      finished_at: finished_at || new Date().toISOString(),
      completed_at: new Date().toISOString() // Compatibilidade legado
    }

    // ? BUG FIX P1: Incluir started_at explicitamente
    if (started_at) {
      updateData.started_at = started_at
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

    console.log('[submit-job-result] Updating job with data:', {
      job_id,
      updateData: JSON.stringify(updateData, null, 2),
      updateFields: Object.keys(updateData)
    })

    const { data: updateResult, error: updateError } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', job_id)
      .select()

    if (updateError) {
      console.error('[submit-job-result] Database update failed:', {
        job_id,
        error: updateError.message,
        error_code: updateError.code,
        error_details: updateError.details,
        error_hint: updateError.hint
      })
      return new Response(
        JSON.stringify({ error: 'Erro ao atualizar job', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[submit-job-result] Job updated successfully:', {
      job_id,
      agent: agent.agent_name,
      final_status: status,
      updated_record: updateResult ? JSON.stringify(updateResult[0]) : 'null',
      rows_affected: updateResult?.length || 0
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
