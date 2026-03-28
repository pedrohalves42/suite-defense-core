/**
 * Auto Cleanup Jobs - Edge Function
 * 
 * Executa limpeza automática de jobs órfãos:
 * - Jobs em 'queued' há mais de 24 horas -> cancelled
 * - Jobs em 'delivered' há mais de 1 hora -> failed
 * 
 * Pode ser executada via:
 * - CRON job (pg_cron)
 * - Chamada manual (com autenticação)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts'
import { logger } from '../_shared/logger.ts';

interface CleanupResult {
  queued_cancelled: number
  delivered_failed: number
  total_cleaned: number
  retried?: number
  tenants_affected: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // V-1113: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req)
  if (authError) return authError

  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  
  logger.info(`[${requestId}] auto-cleanup-jobs started`)

  // Validate authorization (internal secret, scheduled, or admin)
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET')
  const providedSecret = req.headers.get('X-Internal-Secret')
  const authHeader = req.headers.get('authorization')
  
  // Allow: scheduled execution (no auth), internal secret, or bearer token
  const isScheduled = !providedSecret && !authHeader
  const isInternal = INTERNAL_SECRET && providedSecret === INTERNAL_SECRET
  const hasBearer = authHeader?.startsWith('Bearer ')
  
  if (!isScheduled && !isInternal && !hasBearer) {
    logger.warn(`[${requestId}] Unauthorized access attempt`)
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // KILL SWITCH CHECK (ADR-FINAL) - Halt all automation if system is in halt_jobs mode
    const { data: systemMode } = await supabase.rpc('get_system_mode_safe')
    if (systemMode === 'halt_jobs') {
      logger.info(`[${requestId}] SYSTEM_HALTED: Kill switch active, skipping cleanup`)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SYSTEM_HALTED', 
          message: 'Kill switch is active. Set system_state.mode to normal to resume.' 
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse optional request body for custom thresholds
    // REDUZIDO: timeout de delivered de 1h para 30min para jobs mais responsivos
    let queuedThresholdHours = 2 // Reduzido de 24h para 2h
    let deliveredThresholdHours = 0.5 // Reduzido de 1h para 30min
    let targetTenantId: string | null = null
    let enableRetry = true // Nova opção para re-agendar jobs falhos

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        queuedThresholdHours = body.queued_threshold_hours ?? 2
        deliveredThresholdHours = body.delivered_threshold_hours ?? 0.5
        targetTenantId = body.tenant_id ?? null
        enableRetry = body.enable_retry ?? true
      } catch {
        // Use defaults if body parsing fails
      }
    }

    logger.info(`[${requestId}] Thresholds: queued=${queuedThresholdHours}h, delivered=${deliveredThresholdHours}h`)
    if (targetTenantId) {
      logger.info(`[${requestId}] Target tenant: ${targetTenantId}`)
    }

    const queuedCutoff = new Date(Date.now() - queuedThresholdHours * 60 * 60 * 1000).toISOString()
    const deliveredCutoff = new Date(Date.now() - deliveredThresholdHours * 60 * 60 * 1000).toISOString()

    // ADR-VELLUM V-311: Blast radius governance for tenant-scoped cleanup
    // Only enforced when an explicit tenant_id is provided (manual/targeted cleanup).
    // Scheduled/global cleanup remains governed by kill switch + backend automation controls.
    if (targetTenantId) {
      const { count: queuedCount, error: queuedCountError } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'queued')
        .lt('created_at', queuedCutoff)
        .eq('tenant_id', targetTenantId)

      if (queuedCountError) throw queuedCountError

      const { count: deliveredCount, error: deliveredCountError } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'delivered')
        .lt('delivered_at', deliveredCutoff)
        .eq('tenant_id', targetTenantId)

      if (deliveredCountError) throw deliveredCountError

      const totalAffected = (queuedCount ?? 0) + (deliveredCount ?? 0)
      if (totalAffected > 0) {
        const { data: blastCheck, error: blastError } = await supabase.rpc('check_blast_radius' as never, {
          p_tenant_id: targetTenantId,
          p_action_type: 'cancel_jobs',
          p_affected_count: totalAffected,
        })

        if (blastError) {
          logger.error(`[${requestId}] Blast radius check failed:`, blastError)
          return new Response(
            JSON.stringify({ error: 'BLAST_RADIUS_CHECK_FAILED', message: blastError.message, request_id: requestId }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (!blastCheck?.allowed) {
          logger.warn(`[${requestId}] [V-311] Blast radius exceeded for tenant cleanup`, {
            tenant_id: targetTenantId,
            requested: totalAffected,
            affected_percent: blastCheck?.affected_percent,
            requires_approval: blastCheck?.requires_approval,
            message: blastCheck?.message,
          })
          return new Response(
            JSON.stringify({
              error: 'BLAST_RADIUS_EXCEEDED',
              requested: totalAffected,
              affected_percent: blastCheck?.affected_percent,
              max_allowed_percent: blastCheck?.max_allowed_percent,
              requires_approval: blastCheck?.requires_approval,
              message: blastCheck?.message || 'Blast radius exceeded',
              request_id: requestId,
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    // Step 1: Cancel old queued jobs
    let queuedQuery = supabase
      .from('jobs')
      .update({
        status: 'cancelled',
        error_message: `Auto-cancelled: agent did not collect job within ${queuedThresholdHours}h`,
        completed_at: new Date().toISOString()
      })
      .eq('status', 'queued')
      .lt('created_at', queuedCutoff)

    if (targetTenantId) {
      queuedQuery = queuedQuery.eq('tenant_id', targetTenantId)
    }

    const { data: cancelledJobs, error: cancelError } = await queuedQuery.select('id, tenant_id')

    if (cancelError) {
      logger.error(`[${requestId}] Error cancelling queued jobs:`, cancelError)
      throw cancelError
    }

    const queuedCancelled = cancelledJobs?.length ?? 0
    logger.info(`[${requestId}] Cancelled ${queuedCancelled} old queued jobs`)

    // Step 2: Fail old delivered jobs (timeout)
    let deliveredQuery = supabase
      .from('jobs')
      .update({
        status: 'failed',
        error_message: `Timeout: agent did not report result within ${deliveredThresholdHours}h`,
        completed_at: new Date().toISOString()
      })
      .eq('status', 'delivered')
      .lt('delivered_at', deliveredCutoff)

    if (targetTenantId) {
      deliveredQuery = deliveredQuery.eq('tenant_id', targetTenantId)
    }

    const { data: failedJobs, error: failError } = await deliveredQuery.select('id, tenant_id')

    if (failError) {
      logger.error(`[${requestId}] Error failing delivered jobs:`, failError)
      throw failError
    }

    const deliveredFailed = failedJobs?.length ?? 0
    logger.info(`[${requestId}] Failed ${deliveredFailed} timed out delivered jobs`)

    // Calculate affected tenants
    const allJobs = [...(cancelledJobs ?? []), ...(failedJobs ?? [])]
    const tenantsAffected = [...new Set(allJobs.map(j => j.tenant_id))]

    // Step 3: Re-agendar jobs falhos para retry automático (apenas jobs recorrentes)
    let retriedCount = 0
    if (enableRetry && failedJobs && failedJobs.length > 0) {
      for (const failedJob of failedJobs) {
        const { data: originalJob } = await supabase
          .from('jobs')
          .select('type, agent_id, agent_name, tenant_id, payload, is_recurring')
          .eq('id', failedJob.id)
          .single()

        // Só re-agendar jobs recorrentes
        if (originalJob?.is_recurring && originalJob?.agent_id) {
          const { error: retryError } = await supabase
            .from('jobs')
            .insert({
              type: originalJob.type,
              agent_id: originalJob.agent_id,
              agent_name: originalJob.agent_name,
              tenant_id: originalJob.tenant_id,
              status: 'queued',
              approved: true,
              payload: {
                ...originalJob.payload,
                retry_of: failedJob.id,
                retry_count: (originalJob.payload?.retry_count || 0) + 1
              },
              is_recurring: true,
              parent_job_id: failedJob.id
            })

          if (!retryError) {
            retriedCount++
          }
        }
      }
      logger.info(`[${requestId}] Re-scheduled ${retriedCount} recurring jobs for retry`)
    }

    const result: CleanupResult = {
      queued_cancelled: queuedCancelled,
      delivered_failed: deliveredFailed,
      total_cleaned: queuedCancelled + deliveredFailed,
      retried: retriedCount,
      tenants_affected: tenantsAffected
    }

    const duration = Date.now() - startTime
    logger.info(`[${requestId}] Cleanup completed in ${duration}ms:`, result)

    // Log observability
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'auto-cleanup-jobs',
      p_success: true,
      p_duration_ms: duration,
      p_result: result,
      p_processed_count: result.total_cleaned,
      p_job_source: 'cron'
    })

    return new Response(
      JSON.stringify({
        success: true,
        request_id: requestId,
        duration_ms: duration,
        ...result
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const duration = Date.now() - startTime
    logger.error(`[${requestId}] Error after ${duration}ms:`, error)
    
    // Log error observability
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'auto-cleanup-jobs',
        p_success: false,
        p_duration_ms: duration,
        p_error: error instanceof Error ? error.message : 'Internal server error',
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      })
    } catch (e) { logger.warn('[auto-cleanup-jobs] Failed to log job run:', e); }
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        request_id: requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
