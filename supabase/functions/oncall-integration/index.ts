import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { buildCorsHeaders } from '../_shared/cors.ts'
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

/**
 * On-Call Rotation / PagerDuty Integration
 * Actions: alert, who-is-oncall, escalate, schedule
 */

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin), status: 204 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  const PAGERDUTY_API_KEY = Deno.env.get('PAGERDUTY_API_KEY') || ''
  const PAGERDUTY_ROUTING_KEY = Deno.env.get('PAGERDUTY_ROUTING_KEY') || ''
  const PAGERDUTY_SCHEDULE_ID = Deno.env.get('PAGERDUTY_SCHEDULE_ID') || ''

  try {
    const body = await req.json().catch(() => ({}))
    const action = body.action || 'who-is-oncall'

    // ??? CREATE ALERT ???
    if (action === 'alert') {
      const { summary, severity, source, details, tenantId } = body
      if (!summary) {
        return new Response(JSON.stringify({ error: 'summary required' }), {
          status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }

      const sevMap: Record<string, string> = { critical: 'critical', high: 'error', medium: 'warning', low: 'info' }
      const dedupKey = `cybershield-${tenantId || 'global'}-${Date.now()}`

      // If PagerDuty is configured, send alert
      let pagerResult: Record<string, unknown> = { dedup_key: dedupKey }
      if (PAGERDUTY_ROUTING_KEY) {
        const pdResponse = await fetchWithTimeout('https://events.pagerduty.com/v2/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload: {
              summary,
              severity: sevMap[severity] || 'error',
              source: source || 'CyberShield',
              component: 'CyberShield Platform',
              group: tenantId ? `Tenant: ${tenantId}` : 'Global',
              class: 'Security Incident',
              custom_details: details || {},
            },
            routing_key: PAGERDUTY_ROUTING_KEY,
            event_action: 'trigger',
            dedup_key: dedupKey,
            client: 'CyberShield',
            client_url: Deno.env.get('DASHBOARD_URL') || 'https://cybershield-audit.lovable.app',
          }),
        })
        pagerResult = await pdResponse.json().catch(() => pagerResult)
      }

      // Store in DB regardless
      await supabase.from('oncall_alerts').insert({
        incident_id: pagerResult.dedup_key || dedupKey,
        tenant_id: tenantId || null,
        summary,
        severity: severity || 'medium',
        details: details || {},
        status: 'triggered',
      })

      logger.info(`[oncall] Alert created: ${summary} (${severity})`)
      return new Response(JSON.stringify({ success: true, incident_id: dedupKey }), {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
      })
    }

    // ??? WHO IS ON-CALL ???
    if (action === 'who-is-oncall') {
      let oncallUsers: Array<Record<string, unknown>> = []

      if (PAGERDUTY_API_KEY && PAGERDUTY_SCHEDULE_ID) {
        try {
          const now = new Date().toISOString()
          const pdRes = await fetchWithTimeout(
            `https://api.pagerduty.com/oncalls?schedule_ids[]=${PAGERDUTY_SCHEDULE_ID}&since=${now}&until=${now}`,
            {
              headers: {
                Authorization: `Token token=${PAGERDUTY_API_KEY}`,
                Accept: 'application/vnd.pagerduty+json;version=2',
              },
            }
          )
          const pdData = await pdRes.json()
          oncallUsers = pdData.oncalls?.map((oc: Record<string, unknown>) => ({
            id: oc.user?.id,
            name: oc.user?.name,
            email: oc.user?.email,
            escalationLevel: oc.escalation_level,
          })) || []
        } catch (e) {
          logger.warn('[oncall] PagerDuty API error:', (e as Error).message)
        }
      }

      // Fallback: check local schedule
      if (oncallUsers.length === 0) {
        const { data: schedules } = await supabase
          .from('oncall_schedules')
          .select('rotation')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (schedules?.rotation) {
          oncallUsers = Array.isArray(schedules.rotation) ? schedules.rotation : []
        }
      }

      return new Response(JSON.stringify({
        oncall: oncallUsers,
        timestamp: new Date().toISOString(),
        source: PAGERDUTY_API_KEY ? 'pagerduty' : 'local',
      }), {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
      })
    }

    // ??? ESCALATE ???
    if (action === 'escalate') {
      const { incidentId } = body
      if (!incidentId) {
        return new Response(JSON.stringify({ error: 'incidentId required' }), {
          status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }

      await supabase.from('oncall_alerts').update({
        status: 'escalated',
        escalated_at: new Date().toISOString(),
      }).eq('incident_id', incidentId)

      logger.info(`[oncall] Incident ${incidentId} escalated`)
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
      })
    }

    // ??? UPDATE SCHEDULE ???
    if (action === 'schedule') {
      const { name, timezone, rotation } = body
      if (!name || !rotation) {
        return new Response(JSON.stringify({ error: 'name and rotation required' }), {
          status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }

      await supabase.from('oncall_schedules').upsert({
        name,
        timezone: timezone || 'UTC',
        rotation,
        updated_at: new Date().toISOString(),
      })

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
      })
    }

    // ??? GET ALERTS ???
    if (action === 'alerts') {
      const { data: alerts } = await supabase
        .from('oncall_alerts')
        .select('*')
        .in('status', ['triggered', 'acknowledged', 'escalated'])
        .order('triggered_at', { ascending: false })
        .limit(50)

      return new Response(JSON.stringify({ alerts: alerts || [] }), {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
    })
  } catch (error) {
    logger.error('[oncall-integration] Error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
    })
  }
})
