import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'
import { getTenantIdForUser } from '../_shared/tenant.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's tenant using helper (handles multiple roles)
    const tenantId = await getTenantIdForUser(supabase, user.id)

    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'User not associated with any tenant' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { agentName } = await req.json()

    if (!agentName) {
      return new Response(
        JSON.stringify({ error: 'Agent name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get agent details
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('agent_name', agentName)
      .eq('tenant_id', tenantId)
      .single()

    if (agentError || !agent) {
      return new Response(
        JSON.stringify({ 
          healthy: false,
          error: 'Agent not found',
          checks: {}
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check heartbeat (should be < 5 minutes old)
    const lastHeartbeat = agent.last_heartbeat ? new Date(agent.last_heartbeat) : null
    const heartbeatHealthy = lastHeartbeat 
      ? (Date.now() - lastHeartbeat.getTime()) < 5 * 60 * 1000 
      : false

    // Get latest metrics (should be < 10 minutes old)
    const { data: metrics } = await supabase
      .from('agent_system_metrics')
      .select('*')
      .eq('agent_id', agent.id)
      .order('collected_at', { ascending: false })
      .limit(1)
      .single()

    const lastMetrics = metrics?.collected_at ? new Date(metrics.collected_at) : null
    const metricsHealthy = lastMetrics
      ? (Date.now() - lastMetrics.getTime()) < 10 * 60 * 1000
      : false

    // Check for recent alerts
    const { data: alerts, count: alertCount } = await supabase
      .from('system_alerts')
      .select('*', { count: 'exact' })
      .eq('agent_id', agent.id)
      .eq('acknowledged', false)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    const healthChecks = {
      heartbeat: {
        healthy: heartbeatHealthy,
        lastSeen: lastHeartbeat?.toISOString() || null,
        ageMinutes: lastHeartbeat ? Math.round((Date.now() - lastHeartbeat.getTime()) / 60000) : null
      },
      metrics: {
        healthy: metricsHealthy,
        lastSeen: lastMetrics?.toISOString() || null,
        ageMinutes: lastMetrics ? Math.round((Date.now() - lastMetrics.getTime()) / 60000) : null,
        latest: metrics ? {
          cpu: metrics.cpu_usage_percent,
          memory: metrics.memory_usage_percent,
          disk: metrics.disk_usage_percent
        } : null
      },
      alerts: {
        healthy: (alertCount || 0) === 0,
        unacknowledgedCount: alertCount || 0,
        recent: alerts?.slice(0, 3) || []
      },
      agent: {
        status: agent.status,
        osType: agent.os_type,
        osVersion: agent.os_version,
        hostname: agent.hostname,
        enrolledAt: agent.enrolled_at
      }
    }

    const overallHealthy = heartbeatHealthy && metricsHealthy && (alertCount || 0) === 0

    return new Response(
      JSON.stringify({
        healthy: overallHealthy,
        agentName: agent.agent_name,
        checks: healthChecks,
        score: calculateHealthScore(healthChecks)
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('[validate-agent-health] Error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function calculateHealthScore(checks: any): number {
  let score = 0
  let maxScore = 0

  // Heartbeat (40 points)
  maxScore += 40
  if (checks.heartbeat.healthy) score += 40
  else if (checks.heartbeat.ageMinutes && checks.heartbeat.ageMinutes < 15) score += 20

  // Metrics (40 points)
  maxScore += 40
  if (checks.metrics.healthy) score += 40
  else if (checks.metrics.ageMinutes && checks.metrics.ageMinutes < 30) score += 20

  // Alerts (20 points)
  maxScore += 20
  if (checks.alerts.healthy) score += 20
  else if (checks.alerts.unacknowledgedCount < 3) score += 10

  return Math.round((score / maxScore) * 100)
}
