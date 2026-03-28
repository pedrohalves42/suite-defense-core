// FASE 2: Funcao de cleanup de jobs travados
// ZERO-GAP FIX: delivered→failed (not queued) to comply with FSM trigger
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'
import { logger } from '../_shared/logger.ts';

const MAX_DELIVERY_ATTEMPTS = 5
const STUCK_TIMEOUT_MINUTES = 10

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID()

  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET')
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  const providedSecret = req.headers.get('X-Internal-Secret')
  const authHeader = req.headers.get('authorization')
  
  const isCronCall = authHeader?.startsWith('Bearer ') && 
                     authHeader?.includes(SUPABASE_ANON_KEY?.substring(0, 20) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')
  
  const isScheduled = !providedSecret && !authHeader
  const isInternal = INTERNAL_SECRET && providedSecret === INTERNAL_SECRET
  
  if (!isScheduled && !isInternal && !isCronCall) {
    logger.warn(`[${requestId}] Unauthorized access attempt to cleanup-stuck-jobs`)
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  
  const callType = isCronCall ? 'cron' : isScheduled ? 'scheduled' : 'internal'
  logger.info(`[${requestId}] Authorized call type: ${callType}`)

  const startedAt = Date.now()
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const cutoffTime = new Date(Date.now() - STUCK_TIMEOUT_MINUTES * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    logger.info(`[cleanup-stuck-jobs] Starting cleanup at ${now}`)

    // FASE 1: Jobs delivered travados > timeout → FAILED (não queued!)
    // O trigger enforce_job_state_transitions bloqueia delivered→queued.
    // A transição legal é delivered→failed.
    const { data: stuckDelivered, error: stuckError } = await supabase
      .from('jobs')
      .select('id, agent_name, type, delivered_at, delivery_attempts, expires_at')
      .eq('status', 'delivered')
      .lt('delivered_at', cutoffTime)

    if (stuckError) {
      logger.error('[cleanup-stuck-jobs] Error fetching stuck delivered jobs:', stuckError)
    }

    let failedDeliveredCount = 0
    if (stuckDelivered && stuckDelivered.length > 0) {
      // Separate: retryable (can create a NEW job) vs exhausted
      const retryable: typeof stuckDelivered = []
      const exhausted: typeof stuckDelivered = []
      
      for (const job of stuckDelivered) {
        const attempts = job.delivery_attempts || 0
        const expired = job.expires_at && new Date(job.expires_at) < new Date(now)
        if (attempts >= MAX_DELIVERY_ATTEMPTS - 1 || expired) {
          exhausted.push(job)
        } else {
          retryable.push(job)
        }
      }

      // All stuck delivered jobs → failed (legal FSM transition)
      const allIds = stuckDelivered.map(j => j.id)
      if (allIds.length > 0) {
        const { error: failError } = await supabase
          .from('jobs')
          .update({
            status: 'failed',
            completed_at: now,
            error_message: '[CLEANUP] Job delivered but agent never submitted result',
            failure_class: 'AGENT_STALLED'
          })
          .in('id', allIds)

        if (failError) {
          logger.error('[cleanup-stuck-jobs] Error failing stuck delivered jobs:', failError)
        } else {
          failedDeliveredCount = allIds.length
        }
      }

      // For retryable jobs: create NEW replacement jobs (instead of illegal delivered→queued)
      let recreatedCount = 0
      for (const job of retryable) {
        // Fetch full job data to recreate
        const { data: fullJob } = await supabase
          .from('jobs')
          .select('tenant_id, agent_id, agent_name, type, payload, priority, expires_at')
          .eq('id', job.id)
          .single()

        if (fullJob && fullJob.type) {
          const newExpiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
          const { error: insertError } = await supabase
            .from('jobs')
            .insert({
              tenant_id: fullJob.tenant_id,
              agent_id: fullJob.agent_id,
              agent_name: fullJob.agent_name,
              type: fullJob.type,
              payload: fullJob.payload || {},
              status: 'queued',
              approved: true,
              priority: fullJob.priority,
              expires_at: newExpiresAt,
              delivery_attempts: (job.delivery_attempts || 0) + 1
            })

          if (!insertError) {
            recreatedCount++
          } else {
            // Dedup index may block — that's fine, means there's already an active job
            if (!insertError.message?.includes('idx_jobs_dedup_active')) {
              logger.error(`[cleanup-stuck-jobs] Error recreating job for ${job.agent_name}:`, insertError.message)
            }
          }
        }
      }

      logger.info(`[cleanup-stuck-jobs] Stuck delivered: ${failedDeliveredCount} failed, ${recreatedCount} recreated as new jobs, ${exhausted.length} exhausted`)
    }

    // FASE 2: Cleanup zombie job_executions (orphaned running)
    let zombieCleaned = { orphaned_cleaned: 0, stale_cleaned: 0, total: 0 }
    try {
      const { data: zombieResult } = await supabase.rpc('cleanup_zombie_executions')
      if (zombieResult) zombieCleaned = zombieResult as Record<string, unknown>
      logger.info(`[cleanup-stuck-jobs] Zombie executions cleaned: ${zombieCleaned.total}`)
    } catch (e) {
      logger.error('[cleanup-stuck-jobs] Error cleaning zombie executions:', e)
    }

    // FASE 3: Jobs expirados (TTL exceeded) — queued or delivered
    const { data: expiredJobs, error: expiredError } = await supabase
      .from('jobs')
      .select('id, agent_name, type')
      .in('status', ['queued', 'delivered', 'pending'])
      .lt('expires_at', now)

    if (expiredError) {
      logger.error('[cleanup-stuck-jobs] Error fetching expired jobs:', expiredError)
    }

    let expiredCount = 0
    if (expiredJobs && expiredJobs.length > 0) {
      const { error: expireError } = await supabase
        .from('jobs')
        .update({
          status: 'failed',
          error_message: '[DLQ:EXPIRED_TTL] Job expired (TTL exceeded)',
          completed_at: now,
          failure_class: 'EXPIRED'
        })
        .in('id', expiredJobs.map(j => j.id))

      if (expireError) {
        logger.error('[cleanup-stuck-jobs] Error failing expired jobs:', expireError)
      } else {
        expiredCount = expiredJobs.length
      }
    }

    const summary = {
      success: true,
      timestamp: now,
      stuck_delivered_failed: failedDeliveredCount,
      zombie_executions_cleaned: zombieCleaned.total,
      expired_failed: expiredCount,
      total_cleaned: failedDeliveredCount + expiredCount + zombieCleaned.total,
      config: {
        max_delivery_attempts: MAX_DELIVERY_ATTEMPTS,
        stuck_timeout_minutes: STUCK_TIMEOUT_MINUTES
      }
    }

    logger.info(`[cleanup-stuck-jobs] Summary: ${failedDeliveredCount} delivered→failed, ${zombieCleaned.total} zombie executions, ${expiredCount} expired→failed`)

    // Log observability
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'cleanup-stuck-jobs',
        p_success: true,
        p_duration_ms: Date.now() - startedAt,
        p_result: summary,
        p_processed_count: failedDeliveredCount + expiredCount,
        p_job_source: 'cron'
      })
    } catch (e) { logger.warn('[cleanup-stuck-jobs] Failed to log job run:', e); }

    // Report cron health
    try {
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'cleanup-stuck-jobs-every-15min',
        p_success: true,
        p_error_message: null
      })
    } catch (e) { logger.warn('[cleanup-stuck-jobs] Failed to update cron health:', e); }

    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    logger.error('[cleanup-stuck-jobs] Unexpected error:', error)
    
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'cleanup-stuck-jobs-every-15min',
        p_success: false,
        p_error_message: error instanceof Error ? error.message : 'Unknown error'
      })
    } catch (e) { logger.warn('[cleanup-stuck-jobs] Failed to update cron health on error:', e); }
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})