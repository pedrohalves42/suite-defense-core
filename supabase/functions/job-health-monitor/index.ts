/**
 * Job Health Monitor - Edge Function
 * 
 * Monitors scheduled job health and generates alerts for:
 * - Jobs that haven't run in expected timeframe
 * - High failure rates
 * - Stale/never-ran jobs
 * 
 * Designed to be called by pg_cron or manually
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'

interface JobHealthRecord {
  job_name: string
  last_run: string | null
  last_success: string | null
  failure_count_24h: number
  total_runs_24h: number
  health_status: 'healthy' | 'failing' | 'degraded' | 'stale' | 'never_ran'
  severity: 'ok' | 'warning' | 'critical'
}

interface MonitorResult {
  jobs_checked: number
  healthy_jobs: number
  failing_jobs: number
  stale_jobs: number
  alerts_created: number
  duration_ms: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  
  console.log(`[${requestId}] job-health-monitor started`)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch job health from view
    const { data: jobHealth, error: healthError } = await supabase
      .from('v_job_health')
      .select('*')

    if (healthError) {
      console.error(`[${requestId}] Error fetching job health:`, healthError)
      throw healthError
    }

    const jobs = (jobHealth || []) as JobHealthRecord[]
    console.log(`[${requestId}] Found ${jobs.length} jobs to check`)

    const result: MonitorResult = {
      jobs_checked: jobs.length,
      healthy_jobs: 0,
      failing_jobs: 0,
      stale_jobs: 0,
      alerts_created: 0,
      duration_ms: 0,
    }

    // Categorize jobs
    for (const job of jobs) {
      if (job.health_status === 'healthy') {
        result.healthy_jobs++
      } else if (job.health_status === 'failing' || job.health_status === 'degraded') {
        result.failing_jobs++
      } else if (job.health_status === 'stale' || job.health_status === 'never_ran') {
        result.stale_jobs++
      }

      // Create alerts for critical issues
      if (job.severity === 'critical') {
        const alertMessage = job.health_status === 'failing' 
          ? `Job "${job.job_name}" teve ${job.failure_count_24h} falhas nas últimas 24h`
          : `Job "${job.job_name}" não executou há mais de 2 horas (status: ${job.health_status})`

        // Check if similar alert exists recently
        const { data: existingAlert } = await supabase
          .from('system_alerts')
          .select('id')
          .eq('alert_type', 'job_health_issue')
          .eq('title', `Job ${job.job_name}`)
          .eq('resolved', false)
          .gte('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
          .limit(1)
          .maybeSingle()

        if (!existingAlert) {
          const { error: alertError } = await supabase
            .from('system_alerts')
            .insert({
              alert_type: 'job_health_issue',
              severity: job.severity === 'critical' ? 'high' : 'medium',
              title: `Job ${job.job_name}`,
              message: alertMessage,
              details: {
                job_name: job.job_name,
                health_status: job.health_status,
                last_run: job.last_run,
                last_success: job.last_success,
                failure_count_24h: job.failure_count_24h,
                total_runs_24h: job.total_runs_24h,
                source: 'job-health-monitor',
              },
              resolved: false,
            })

          if (!alertError) {
            result.alerts_created++
            console.log(`[${requestId}] Created alert for job: ${job.job_name}`)
          } else {
            console.error(`[${requestId}] Failed to create alert for ${job.job_name}:`, alertError)
          }
        }
      }
    }

    // Log this monitoring run
    const duration = Date.now() - startTime
    result.duration_ms = duration

    await supabase.rpc('log_scheduled_job_run', {
      p_job_name: 'job-health-monitor',
      p_success: true,
      p_duration_ms: duration,
      p_result: result,
      p_processed_count: jobs.length,
    })

    console.log(`[${requestId}] Completed in ${duration}ms:`, result)

    return new Response(
      JSON.stringify({
        success: true,
        request_id: requestId,
        ...result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`[${requestId}] Error after ${duration}ms:`, error)
    
    // Log failure
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)
      
      await supabase.rpc('log_scheduled_job_run', {
        p_job_name: 'job-health-monitor',
        p_success: false,
        p_duration_ms: duration,
        p_error: error instanceof Error ? error.message : 'Unknown error',
      })
    } catch (logError) {
      console.error(`[${requestId}] Failed to log error:`, logError)
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        request_id: requestId,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
