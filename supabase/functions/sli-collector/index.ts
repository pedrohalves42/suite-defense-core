import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'
import { logger } from '../_shared/logger.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

/**
 * SLI/SLO Collection Service
 * Collects availability, latency, throughput, error rate metrics
 * Actions: record, sli, slo, dashboard
 */

const SLI_TARGETS = {
  availability: { target: 99.9, warning: 99.5 },
  latency: { target: 500, warning: 1000 },   // ms
  throughput: { target: 10000, warning: 8000 }, // rpm
  errorRate: { target: 0.1, warning: 0.5 },   // %
}

Deno.serve(async (req) => {
  // Auth guard: reject unauthenticated calls
  const authError = await assertInternalCaller(req);
  if (authError) return authError;

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  try {
    const body = await req.json().catch(() => ({}))
    const action = body.action || 'dashboard'

    // ??? RECORD METRIC ???
    if (action === 'record') {
      const { tenantId, endpoint, statusCode, latencyMs } = body
      if (!endpoint || statusCode === undefined) {
        return new Response(JSON.stringify({ error: 'endpoint and statusCode required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const tid = tenantId || 'global'
      const now = new Date()
      const hourStart = new Date(now)
      hourStart.setMinutes(0, 0, 0)
      const hourStr = hourStart.toISOString()

      const isSuccess = statusCode >= 200 && statusCode < 400
      const isError = statusCode >= 500

      // Upsert hourly aggregate
      const { data: existing } = await supabase
        .from('sli_metrics_hourly')
        .select('id, total_requests, success_requests, error_requests, total_latency_ms, max_latency_ms, min_latency_ms')
        .eq('tenant_id', tid)
        .eq('endpoint', endpoint)
        .eq('hour', hourStr)
        .maybeSingle()

      if (existing) {
        await supabase.from('sli_metrics_hourly').update({
          total_requests: existing.total_requests + 1,
          success_requests: existing.success_requests + (isSuccess ? 1 : 0),
          error_requests: existing.error_requests + (isError ? 1 : 0),
          total_latency_ms: existing.total_latency_ms + (latencyMs || 0),
          max_latency_ms: Math.max(existing.max_latency_ms, latencyMs || 0),
          min_latency_ms: Math.min(existing.min_latency_ms || 999999, latencyMs || 0),
          updated_at: now.toISOString(),
        }).eq('id', existing.id)
      } else {
        await supabase.from('sli_metrics_hourly').insert({
          tenant_id: tid,
          endpoint,
          hour: hourStr,
          total_requests: 1,
          success_requests: isSuccess ? 1 : 0,
          error_requests: isError ? 1 : 0,
          total_latency_ms: latencyMs || 0,
          max_latency_ms: latencyMs || 0,
          min_latency_ms: latencyMs || 0,
        })
      }

      if (isError) {
        await supabase.from('slo_error_budget_events').insert({
          tenant_id: tid,
          endpoint,
          status_code: statusCode,
          error_budget_consumed: 1,
          timestamp: now.toISOString(),
        })
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ??? GET SLI ???
    if (action === 'sli') {
      const tid = body.tenantId || 'global'
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)

      const { data: metrics } = await supabase
        .from('sli_metrics_hourly')
        .select('total_requests, success_requests, error_requests, total_latency_ms, max_latency_ms')
        .eq('tenant_id', tid)
        .gte('hour', startOfDay.toISOString())

      const m = metrics || []
      const totalReqs = m.reduce((s, r) => s + r.total_requests, 0)
      const successReqs = m.reduce((s, r) => s + r.success_requests, 0)
      const errorReqs = m.reduce((s, r) => s + r.error_requests, 0)
      const totalLatency = m.reduce((s, r) => s + r.total_latency_ms, 0)

      const availability = totalReqs > 0 ? (successReqs / totalReqs) * 100 : 100
      const avgLatency = totalReqs > 0 ? totalLatency / totalReqs : 0
      const errorRate = totalReqs > 0 ? (errorReqs / totalReqs) * 100 : 0
      const hourCount = Math.max(m.length, 1)
      const throughput = totalReqs / hourCount

      const status = (val: number, target: number, warning: number, higherIsBetter = true) => {
        if (higherIsBetter) return val >= target ? 'healthy' : val >= warning ? 'warning' : 'critical'
        return val <= target ? 'healthy' : val <= warning ? 'warning' : 'critical'
      }

      return new Response(JSON.stringify({
        availability: { current: +availability.toFixed(2), target: SLI_TARGETS.availability.target, status: status(availability, 99.9, 99.5) },
        latency: { current: Math.round(avgLatency), target: SLI_TARGETS.latency.target, status: status(avgLatency, 500, 1000, false) },
        throughput: { current: Math.round(throughput), target: SLI_TARGETS.throughput.target, status: status(throughput, 10000, 8000) },
        errorRate: { current: +errorRate.toFixed(2), target: SLI_TARGETS.errorRate.target, status: status(errorRate, 0.1, 0.5, false) },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ??? GET SLO ???
    if (action === 'slo') {
      const tid = body.tenantId || 'global'
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      const { data: events } = await supabase
        .from('slo_error_budget_events')
        .select('timestamp')
        .eq('tenant_id', tid)
        .gte('timestamp', thirtyDaysAgo)

      const { data: metricsSummary } = await supabase
        .from('sli_metrics_hourly')
        .select('total_requests')
        .eq('tenant_id', tid)
        .gte('hour', thirtyDaysAgo)

      const totalReqs = metricsSummary?.reduce((s, r) => s + r.total_requests, 0) || 0
      const totalErrors = events?.length || 0

      const errorBudgetPercent = SLI_TARGETS.errorRate.target // 0.1%
      const maxAllowedErrors = totalReqs * (errorBudgetPercent / 100)
      const spent = maxAllowedErrors > 0 ? (totalErrors / maxAllowedErrors) * 100 : 0
      const remaining = Math.max(0, 100 - spent)

      // Burn rate (last hour vs daily average)
      const now = Date.now()
      const hourEvents = events?.filter(e => new Date(e.timestamp).getTime() > now - 3600000).length || 0
      const dailyAvg = totalErrors / 30
      const burnRate = dailyAvg > 0 ? (hourEvents * 24) / dailyAvg : 0

      // Time to exhaustion
      const errorsRemaining = maxAllowedErrors - totalErrors
      const hourlyRate = totalErrors / (30 * 24)
      const hoursToExhaustion = hourlyRate > 0 ? Math.floor(errorsRemaining / hourlyRate) : null

      return new Response(JSON.stringify({
        errorBudget: {
          total: errorBudgetPercent,
          spent: +spent.toFixed(1),
          remaining: +remaining.toFixed(1),
          status: remaining > 50 ? 'healthy' : remaining > 20 ? 'warning' : 'critical',
        },
        burnRate: +burnRate.toFixed(2),
        estimatedTimeToExhaustion: hoursToExhaustion,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ??? DASHBOARD ???
    if (action === 'dashboard') {
      const tid = body.tenantId || 'global'

      const { data: recentMetrics } = await supabase
        .from('sli_metrics_hourly')
        .select('*')
        .eq('tenant_id', tid)
        .order('hour', { ascending: false })
        .limit(168) // 7 days

      return new Response(JSON.stringify({
        recentMetrics: recentMetrics || [],
        timestamp: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    logger.error('[sli-collector] Error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
