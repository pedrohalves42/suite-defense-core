/**
 * correlate-edr-events — Multi-signal correlation engine.
 * 
 * Groups related detection events into correlated incidents
 * based on configurable correlation rules (time window, tactics, agents).
 * 
 * Auth: Internal only (cron/service_role) via assertInternalCaller
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-2001: Use standardized assertInternalCaller
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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

  // V-5003 FIX: Get distinct tenants from rules to iterate per-tenant
  // instead of fetching ALL detections across ALL tenants in a single query
  const ruleTenantIds = [...new Set(rules.map(r => r.tenant_id).filter(Boolean))] as string[];
  const hasGlobalRules = rules.some(r => !r.tenant_id);
  
  let allTenantIds: string[] = ruleTenantIds;
  if (hasGlobalRules) {
    // Get all tenants that have recent detections
    const { data: tenantRows } = await supabase
      .from('endpoint_detection_events')
      .select('tenant_id')
      .gte('event_time', since)
      .eq('status', 'open')
      .limit(200);
    const fromEvents = [...new Set((tenantRows || []).map(r => r.tenant_id))];
    allTenantIds = [...new Set([...ruleTenantIds, ...fromEvents])];
  }

  if (!allTenantIds.length) {
    return new Response(JSON.stringify({ message: 'No tenants with active rules/detections' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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
        // V-2003 FIX: True sliding window with two pointers
        let bestMatch: { tactics: Set<string>; dets: typeof agentDets } | null = null;
        
        for (let i = 0; i < agentDets.length; i++) {
          const windowStartTime = new Date(agentDets[i].event_time).getTime();
          const tacticsInWindow = new Set<string>();
          const matchedDets: typeof agentDets = [];

          for (let j = i; j < agentDets.length; j++) {
            const t = new Date(agentDets[j].event_time).getTime();
            if (t - windowStartTime > windowMs) break;
            
            if (agentDets[j].mitre_tactic) {
              tacticsInWindow.add(agentDets[j].mitre_tactic);
              matchedDets.push(agentDets[j]);
            }
          }

          if (tacticsInWindow.size >= distinctTacticsRule.distinct_tactics && 
              matchedDets.length >= rule.min_events) {
            if (!bestMatch || tacticsInWindow.size > bestMatch.tactics.size) {
              bestMatch = { tactics: tacticsInWindow, dets: matchedDets };
            }
          }
        }

        if (bestMatch) {
          await createIncident(supabase, tenantId, agentId, rule, bestMatch.dets, Array.from(bestMatch.tactics));
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

  // V-2004: Deduplication check — skip if an incident already exists for this rule + agent in the same time window
  const { data: existingIncident } = await supabase
    .from('correlated_incidents')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('correlation_rule', rule.rule_name)
    .contains('affected_agents', [agentId])
    .gte('last_event_time', firstTime)
    .maybeSingle();

  if (existingIncident) {
    console.log(`[correlate-edr] Skipping duplicate incident for rule "${rule.rule_name}" on agent ${agentId}`);
    return;
  }

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

  // V-2002 FIX: Batch UPDATE instead of N+1
  const detIds = matchedDets.map(d => d.id);
  await supabase
    .from('endpoint_detection_events')
    .update({ status: 'investigating' })
    .in('id', detIds)
    .eq('status', 'open');

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
