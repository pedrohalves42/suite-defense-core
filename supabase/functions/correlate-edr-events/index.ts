/**
 * correlate-edr-events — Multi-signal correlation engine.
 * 
 * Groups related detection events into correlated incidents
 * based on configurable correlation rules (time window, tactics, agents).
 * 
 * Auth: Internal only (cron/service_role)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const internalSecret = req.headers.get('X-Internal-Secret') || req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');

  const isInternal = (authHeader === `Bearer ${serviceRoleKey}`) ||
    (internalSecret && expectedSecret && internalSecret === expectedSecret);

  if (!isInternal) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const lookbackMinutes = body.lookback_minutes || 60;
  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();

  // Fetch correlation rules
  const { data: rules } = await supabase
    .from('correlation_rules')
    .select('*')
    .eq('is_enabled', true);

  if (!rules?.length) {
    return new Response(JSON.stringify({ message: 'No active correlation rules' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch recent uncorrelated detection events
  const { data: detections } = await supabase
    .from('endpoint_detection_events')
    .select('*')
    .gte('event_time', since)
    .eq('status', 'open')
    .order('event_time', { ascending: true })
    .limit(1000);

  if (!detections?.length) {
    return new Response(JSON.stringify({ message: 'No recent detections to correlate' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Group by agent + tenant
  const agentGroups = new Map<string, typeof detections>();
  for (const det of detections) {
    const key = `${det.tenant_id}::${det.agent_id}`;
    if (!agentGroups.has(key)) agentGroups.set(key, []);
    agentGroups.get(key)!.push(det);
  }

  let incidentsCreated = 0;

  for (const [key, agentDets] of agentGroups) {
    const [tenantId, agentId] = key.split('::');
    if (agentDets.length < 2) continue;

    for (const rule of rules) {
      if (rule.tenant_id && rule.tenant_id !== tenantId) continue;

      const windowMs = rule.time_window_minutes * 60 * 1000;
      const patterns = rule.event_patterns as any[];

      // Check "distinct_tactics" pattern
      const distinctTacticsRule = patterns.find((p: any) => p.distinct_tactics);
      if (distinctTacticsRule) {
        const tacticsInWindow = new Set<string>();
        const matchedDets: typeof agentDets = [];
        const windowStart = new Date(agentDets[0].event_time).getTime();

        for (const det of agentDets) {
          const t = new Date(det.event_time).getTime();
          if (t - windowStart <= windowMs) {
            if (det.mitre_tactic) {
              tacticsInWindow.add(det.mitre_tactic);
              matchedDets.push(det);
            }
          }
        }

        if (tacticsInWindow.size >= distinctTacticsRule.distinct_tactics && matchedDets.length >= rule.min_events) {
          await createIncident(supabase, tenantId, agentId, rule, matchedDets, Array.from(tacticsInWindow));
          incidentsCreated++;
          continue;
        }
      }

      // Check sequential pattern matching
      if (patterns.length >= 2 && !patterns.some((p: any) => p.distinct_tactics)) {
        const matched: typeof agentDets = [];
        let patternIdx = 0;

        for (const det of agentDets) {
          const pattern = patterns[patternIdx];
          if (!pattern) break;

          const matchesTactic = !pattern.mitre_tactic || det.mitre_tactic === pattern.mitre_tactic;
          const matchesTechnique = !pattern.mitre_technique_id || det.mitre_technique_id === pattern.mitre_technique_id;
          const matchesType = !pattern.event_type || pattern.event_type === 'any' || det.source_event_type === pattern.event_type;

          if (matchesTactic && matchesTechnique && matchesType) {
            if (matched.length === 0 || 
                (new Date(det.event_time).getTime() - new Date(matched[0].event_time).getTime()) <= windowMs) {
              matched.push(det);
              patternIdx++;
            }
          }
        }

        if (matched.length >= rule.min_events && patternIdx >= patterns.length) {
          const tactics = [...new Set(matched.map(m => m.mitre_tactic).filter(Boolean))];
          await createIncident(supabase, tenantId, agentId, rule, matched, tactics);
          incidentsCreated++;
        }
      }
    }
  }

  console.log(`[correlate-edr-events] Created ${incidentsCreated} incidents from ${detections.length} detections`);

  return new Response(JSON.stringify({ success: true, incidents_created: incidentsCreated }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

async function createIncident(
  supabase: any,
  tenantId: string,
  agentId: string,
  rule: any,
  matchedDets: any[],
  tactics: string[]
) {
  const techniques = [...new Set(matchedDets.map(m => m.mitre_technique_id).filter(Boolean))];
  const firstTime = matchedDets[0].event_time;
  const lastTime = matchedDets[matchedDets.length - 1].event_time;

  const { data: incident, error } = await supabase
    .from('correlated_incidents')
    .insert({
      tenant_id: tenantId,
      title: `${rule.rule_name} — ${matchedDets.length} events`,
      description: `Correlation rule "${rule.rule_name}" matched ${matchedDets.length} detection events on agent ${agentId}. Tactics: ${tactics.join(', ')}`,
      severity: rule.severity,
      confidence_score: Math.min(95, 50 + matchedDets.length * 10),
      mitre_tactics: tactics,
      mitre_techniques: techniques,
      affected_agents: [agentId],
      event_count: matchedDets.length,
      first_event_time: firstTime,
      last_event_time: lastTime,
      correlation_rule: rule.rule_name,
    })
    .select('id')
    .single();

  if (error || !incident) {
    console.error('[correlate-edr] Failed to create incident:', error?.message);
    return;
  }

  // Link events
  const eventLinks = matchedDets.map(det => ({
    incident_id: incident.id,
    tenant_id: tenantId,
    detection_event_id: det.id,
    event_type: det.source_event_type || 'detection',
    event_summary: `${det.detection_name} (${det.mitre_technique_id || 'N/A'})`,
    event_time: det.event_time,
    agent_id: agentId,
    severity: det.severity,
    event_data: { detection_name: det.detection_name, command_line: det.command_line, process_name: det.process_name },
  }));

  await supabase.from('correlated_incident_events').insert(eventLinks);

  // Update detection events status
  for (const det of matchedDets) {
    await supabase
      .from('endpoint_detection_events')
      .update({ status: 'investigating' })
      .eq('id', det.id)
      .eq('status', 'open');
  }

  // Create system alert for critical incidents
  if (rule.severity === 'critical') {
    await supabase.from('system_alerts').insert({
      tenant_id: tenantId,
      alert_type: 'correlated_incident',
      severity: 'critical',
      title: `[INCIDENT] ${rule.rule_name}`,
      description: `Multi-signal attack detected: ${tactics.join(' → ')}. ${matchedDets.length} events correlated.`,
      status: 'active',
      metadata: { incident_id: incident.id, affected_agents: [agentId], techniques },
    });
  }
}
