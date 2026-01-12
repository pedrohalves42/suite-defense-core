// FASE 2: Funcao de cleanup de jobs travados
// P1-03 FIX: Adicionada validação de autenticação
// HARDENING 2025-01-22: delivery_attempts limit + expires_at TTL
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'

const MAX_DELIVERY_ATTEMPTS = 5
const STUCK_TIMEOUT_MINUTES = 10

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID()

  // P1-03 FIX: Validate internal secret or scheduled execution
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET')
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  const providedSecret = req.headers.get('X-Internal-Secret')
  const authHeader = req.headers.get('authorization')
  
  // Detect cron call (sends anon key in Bearer token)
  const isCronCall = authHeader?.startsWith('Bearer ') && 
                     authHeader?.includes(SUPABASE_ANON_KEY?.substring(0, 20) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')
  
  // Allow scheduled execution (no auth headers), cron calls, or internal secret
  const isScheduled = !providedSecret && !authHeader
  const isInternal = INTERNAL_SECRET && providedSecret === INTERNAL_SECRET
  
  if (!isScheduled && !isInternal && !isCronCall) {
    console.warn(`[${requestId}] Unauthorized access attempt to cleanup-stuck-jobs`)
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  
  const callType = isCronCall ? 'cron' : isScheduled ? 'scheduled' : 'internal'
  console.log(`[${requestId}] Authorized call type: ${callType}`)

  const startedAt = Date.now()
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const cutoffTime = new Date(Date.now() - STUCK_TIMEOUT_MINUTES * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    console.log(`[cleanup-stuck-jobs] Starting cleanup at ${now}`)
    console.log(`[cleanup-stuck-jobs] Stuck timeout: ${STUCK_TIMEOUT_MINUTES}min, Max attempts: ${MAX_DELIVERY_ATTEMPTS}`)

    // FASE 1: Jobs travados que ainda podem ser retentados
    const { data: retryableJobs, error: retryError } = await supabase
      .from('jobs')
      .select('id, agent_name, type, delivered_at, delivery_attempts')
      .eq('status', 'delivered')
      .lt('delivered_at', cutoffTime)
      .lt('delivery_attempts', MAX_DELIVERY_ATTEMPTS - 1) // Ainda tem tentativas
      .gt('expires_at', now) // Não expirado

    if (retryError) {
      console.error('[cleanup-stuck-jobs] Error fetching retryable jobs:', retryError)
    }

    let retriedCount = 0
    if (retryableJobs && retryableJobs.length > 0) {
      console.log(`[cleanup-stuck-jobs] Found ${retryableJobs.length} retryable jobs`)
      
      // Incrementar delivery_attempts e voltar para queued
      for (const job of retryableJobs) {
        const { error: updateError } = await supabase
          .from('jobs')
          .update({
            status: 'queued',
            delivered_at: null,
            delivery_attempts: (job.delivery_attempts || 0) + 1
          })
          .eq('id', job.id)

        if (updateError) {
          console.error(`[cleanup-stuck-jobs] Error updating job ${job.id}:`, updateError)
        } else {
          retriedCount++
        }
      }
      console.log(`[cleanup-stuck-jobs] Reset ${retriedCount} jobs to queued (incremented attempts)`)
    }

    // FASE 2: Jobs que excederam tentativas máximas
    const { data: exhaustedJobs, error: exhaustedError } = await supabase
      .from('jobs')
      .select('id, agent_name, type, delivery_attempts')
      .eq('status', 'delivered')
      .lt('delivered_at', cutoffTime)
      .gte('delivery_attempts', MAX_DELIVERY_ATTEMPTS - 1)

    if (exhaustedError) {
      console.error('[cleanup-stuck-jobs] Error fetching exhausted jobs:', exhaustedError)
    }

    let exhaustedCount = 0
    if (exhaustedJobs && exhaustedJobs.length > 0) {
      console.log(`[cleanup-stuck-jobs] Found ${exhaustedJobs.length} exhausted jobs (max attempts reached)`)
      
      const { error: failError } = await supabase
        .from('jobs')
        .update({
          status: 'failed',
          error_message: `Max delivery attempts (${MAX_DELIVERY_ATTEMPTS}) exceeded - job never completed`,
          completed_at: now,
          delivery_attempts: MAX_DELIVERY_ATTEMPTS
        })
        .in('id', exhaustedJobs.map(j => j.id))

      if (failError) {
        console.error('[cleanup-stuck-jobs] Error failing exhausted jobs:', failError)
      } else {
        exhaustedCount = exhaustedJobs.length
        console.log(`[cleanup-stuck-jobs] Marked ${exhaustedCount} jobs as failed (max attempts)`)
      }
    }

    // FASE 3: Jobs expirados (TTL exceeded)
    const { data: expiredJobs, error: expiredError } = await supabase
      .from('jobs')
      .select('id, agent_name, type, created_at, expires_at')
      .in('status', ['queued', 'delivered'])
      .lt('expires_at', now)

    if (expiredError) {
      console.error('[cleanup-stuck-jobs] Error fetching expired jobs:', expiredError)
    }

    let expiredCount = 0
    if (expiredJobs && expiredJobs.length > 0) {
      console.log(`[cleanup-stuck-jobs] Found ${expiredJobs.length} expired jobs (TTL exceeded)`)
      
      const { error: expireError } = await supabase
        .from('jobs')
        .update({
          status: 'failed',
          error_message: 'Job expired (TTL exceeded)',
          completed_at: now
        })
        .in('id', expiredJobs.map(j => j.id))

      if (expireError) {
        console.error('[cleanup-stuck-jobs] Error failing expired jobs:', expireError)
      } else {
        expiredCount = expiredJobs.length
        console.log(`[cleanup-stuck-jobs] Marked ${expiredCount} jobs as failed (expired)`)
      }
    }

    const summary = {
      success: true,
      timestamp: now,
      retried: {
        count: retriedCount,
        jobs: retryableJobs?.map(j => ({ id: j.id, agent: j.agent_name, type: j.type, attempts: (j.delivery_attempts || 0) + 1 })) || []
      },
      exhausted: {
        count: exhaustedCount,
        jobs: exhaustedJobs?.map(j => ({ id: j.id, agent: j.agent_name, type: j.type })) || []
      },
      expired: {
        count: expiredCount,
        jobs: expiredJobs?.map(j => ({ id: j.id, agent: j.agent_name, type: j.type })) || []
      },
      config: {
        max_delivery_attempts: MAX_DELIVERY_ATTEMPTS,
        stuck_timeout_minutes: STUCK_TIMEOUT_MINUTES
      }
    }

    console.log(`[cleanup-stuck-jobs] Summary: ${retriedCount} retried, ${exhaustedCount} exhausted, ${expiredCount} expired`)

    // Log observability
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'cleanup-stuck-jobs',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: summary,
      p_processed_count: retriedCount + exhaustedCount + expiredCount,
      p_job_source: 'cron'
    })

    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[cleanup-stuck-jobs] Unexpected error:', error)
    
    // Log error observability
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'cleanup-stuck-jobs',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: error instanceof Error ? error.message : 'Unknown error',
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      })
    } catch {}
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
