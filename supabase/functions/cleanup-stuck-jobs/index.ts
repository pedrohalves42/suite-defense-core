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
  const providedSecret = req.headers.get('X-Internal-Secret')
  
  // Allow scheduled execution (no auth) or internal secret
  const isScheduled = !providedSecret && req.headers.get('authorization') === null
  const isInternal = INTERNAL_SECRET && providedSecret === INTERNAL_SECRET
  
  if (!isScheduled && !isInternal) {
    console.warn(`[${requestId}] Unauthorized access attempt to cleanup-stuck-jobs`)
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

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

    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[cleanup-stuck-jobs] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
