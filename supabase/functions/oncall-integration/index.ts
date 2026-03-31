/**
 * oncall-integration — Migrated to serveInternal middleware
 * On-Call Rotation / PagerDuty Integration
 * Actions: alert, who-is-oncall, escalate, schedule, alerts
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const OncallSchema = z.object({
  action: z.enum(['alert', 'who-is-oncall', 'escalate', 'schedule', 'alerts']).default('who-is-oncall'),
  summary: z.string().min(1).max(1000).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  source: z.string().max(255).optional(),
  details: z.record(z.unknown()).optional(),
  tenantId: z.string().uuid().optional(),
  incidentId: z.string().max(255).optional(),
  name: z.string().max(255).optional(),
  timezone: z.string().max(100).optional(),
  rotation: z.array(z.unknown()).optional(),
}).passthrough();

serveInternal(async (req, ctx) => {
  const { supabase, body } = ctx;
  const origin = req.headers.get('origin');

  const PAGERDUTY_API_KEY = Deno.env.get('PAGERDUTY_API_KEY') || '';
  const PAGERDUTY_ROUTING_KEY = Deno.env.get('PAGERDUTY_ROUTING_KEY') || '';
  const PAGERDUTY_SCHEDULE_ID = Deno.env.get('PAGERDUTY_SCHEDULE_ID') || '';

  const parsed = OncallSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), {
      status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }
    });
  }
  const data = parsed.data;
  const action = data.action;

  if (action === 'alert') {
    const { summary, severity, source, details, tenantId } = data;
    if (!summary) {
      return new Response(JSON.stringify({ error: 'summary required' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }
    const sevMap: Record<string, string> = { critical: 'critical', high: 'error', medium: 'warning', low: 'info' };
    const dedupKey = `cybershield-${tenantId || 'global'}-${Date.now()}`;

    let pagerResult: Record<string, unknown> = { dedup_key: dedupKey };
    if (PAGERDUTY_ROUTING_KEY) {
      const pdResponse = await fetchWithTimeout('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: { summary, severity: sevMap[severity || 'medium'] || 'error', source: source || 'CyberShield', component: 'CyberShield Platform', group: tenantId ? `Tenant: ${tenantId}` : 'Global', class: 'Security Incident', custom_details: details || {} },
          routing_key: PAGERDUTY_ROUTING_KEY, event_action: 'trigger', dedup_key: dedupKey, client: 'CyberShield', client_url: Deno.env.get('DASHBOARD_URL') || 'https://cybershield-audit.lovable.app',
        }),
      });
      pagerResult = await pdResponse.json().catch(() => pagerResult);
    }

    await supabase.from('oncall_alerts').insert({ incident_id: pagerResult.dedup_key || dedupKey, tenant_id: tenantId || null, summary, severity: severity || 'medium', details: details || {}, status: 'triggered' });
    logger.info(`[oncall] Alert created: ${summary} (${severity})`);
    return { success: true, incident_id: dedupKey };
  }

  if (action === 'who-is-oncall') {
    let oncallUsers: Array<Record<string, unknown>> = [];
    if (PAGERDUTY_API_KEY && PAGERDUTY_SCHEDULE_ID) {
      try {
        const now = new Date().toISOString();
        const pdRes = await fetchWithTimeout(`https://api.pagerduty.com/oncalls?schedule_ids[]=${PAGERDUTY_SCHEDULE_ID}&since=${now}&until=${now}`, {
          headers: { Authorization: `Token token=${PAGERDUTY_API_KEY}`, Accept: 'application/vnd.pagerduty+json;version=2' },
        });
        const pdData = await pdRes.json();
        oncallUsers = pdData.oncalls?.map((oc: Record<string, unknown>) => ({
          id: (oc.user as Record<string, unknown>)?.id, name: (oc.user as Record<string, unknown>)?.name,
          email: (oc.user as Record<string, unknown>)?.email, escalationLevel: oc.escalation_level,
        })) || [];
      } catch (e) { logger.warn('[oncall] PagerDuty API error:', (e as Error).message); }
    }
    if (oncallUsers.length === 0) {
      const { data: schedules } = await supabase.from('oncall_schedules').select('rotation').order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (schedules?.rotation) oncallUsers = Array.isArray(schedules.rotation) ? schedules.rotation as Array<Record<string, unknown>> : [];
    }
    return { oncall: oncallUsers, timestamp: new Date().toISOString(), source: PAGERDUTY_API_KEY ? 'pagerduty' : 'local' };
  }

  if (action === 'escalate') {
    const { incidentId } = data;
    if (!incidentId) return new Response(JSON.stringify({ error: 'incidentId required' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    await supabase.from('oncall_alerts').update({ status: 'escalated', escalated_at: new Date().toISOString() }).eq('incident_id', incidentId);
    logger.info(`[oncall] Incident ${incidentId} escalated`);
    return { success: true };
  }

  if (action === 'schedule') {
    const { name, timezone, rotation } = data;
    if (!name || !rotation) return new Response(JSON.stringify({ error: 'name and rotation required' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    await supabase.from('oncall_schedules').upsert({ name, timezone: timezone || 'UTC', rotation, updated_at: new Date().toISOString() });
    return { success: true };
  }

  if (action === 'alerts') {
    const { data: alerts } = await supabase.from('oncall_alerts').select('*').in('status', ['triggered', 'acknowledged', 'escalated']).order('triggered_at', { ascending: false }).limit(50);
    return { alerts: alerts || [] };
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
});
