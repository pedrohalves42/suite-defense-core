/**
 * correlate-edr-events → Migrated to serveInternal middleware
 * Multi-signal correlation engine.
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { z } from 'https://esm.sh/zod@3.23.8';

const EdrCorrelationSchema = z.object({
  lookback_minutes: z.number().int().min(1).max(1440).default(60),
});

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;
  const parsed = EdrCorrelationSchema.safeParse(body ?? {});
  const lookbackMinutes = parsed.success ? parsed.data.lookback_minutes : 60;
  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();

  const { data: rules } = await supabase.from('correlation_rules').select('*').eq('is_enabled', true);
  if (!rules?.length) return { message: 'No active correlation rules' };

  const ruleTenantIds = [...new Set(rules.map(r => r.tenant_id).filter(Boolean))] as string[];
  const hasGlobalRules = rules.some(r => !r.tenant_id);
  let allTenantIds: string[] = ruleTenantIds;

  if (hasGlobalRules) {
    const { data: tenantRows } = await supabase.from('endpoint_detection_events').select('tenant_id').gte('event_time', since).eq('status', 'open').limit(2000);
    const fromEvents = [...new Set((tenantRows || []).map(r => r.tenant_id))];
    allTenantIds = [...new Set([...ruleTenantIds, ...fromEvents])];
  }

  if (!allTenantIds.length) return { message: 'No tenants with active rules/detections' };

  let incidentsCreated = 0;

  for (const tenantId of allTenantIds) {
    const { data: detections } = await supabase.from('endpoint_detection_events')
      .select('id, tenant_id, agent_id, mitre_technique_id, mitre_tactic, detection_name, severity, event_time, source_event_type, status, command_line, process_name')
      .eq('tenant_id', tenantId).gte('event_time', since).eq('status', 'open').order('event_time', { ascending: true }).limit(1000);
    if (!detections?.length) continue;

    const agentGroups = new Map<string, typeof detections>();
    for (const det of detections) {
      if (!agentGroups.has(det.agent_id)) agentGroups.set(det.agent_id, []);
      agentGroups.get(det.agent_id)!.push(det);
    }

    for (const [agentId, agentDets] of agentGroups) {
      if (agentDets.length < 2) continue;
      const tenantRules = rules.filter(r => !r.tenant_id || r.tenant_id === tenantId);

      for (const rule of tenantRules) {
        const windowMs = rule.time_window_minutes * 60 * 1000;
        const patterns = rule.event_patterns as Array<Record<string, unknown>>;

        const distinctTacticsRule = patterns.find((p: Record<string, unknown>) => p.distinct_tactics);
        if (distinctTacticsRule) {
          let bestMatch: { tactics: Set<string>; dets: typeof agentDets } | null = null;
          for (let i = 0; i < agentDets.length; i++) {
            const windowStartTime = new Date(agentDets[i].event_time).getTime();
            const tacticsInWindow = new Set<string>();
            const matchedDets: typeof agentDets = [];
            for (let j = i; j < agentDets.length; j++) {
              if (new Date(agentDets[j].event_time).getTime() - windowStartTime > windowMs) break;
              if (agentDets[j].mitre_tactic) { tacticsInWindow.add(agentDets[j].mitre_tactic); matchedDets.push(agentDets[j]); }
            }
            if (tacticsInWindow.size >= (distinctTacticsRule.distinct_tactics as number) && matchedDets.length >= rule.min_events) {
              if (!bestMatch || tacticsInWindow.size > bestMatch.tactics.size) bestMatch = { tactics: tacticsInWindow, dets: matchedDets };
            }
          }
          if (bestMatch) { await createIncident(supabase, tenantId, agentId, rule, bestMatch.dets, Array.from(bestMatch.tactics)); incidentsCreated++; continue; }
        }

        if (patterns.length >= 2 && !patterns.some((p: Record<string, unknown>) => p.distinct_tactics)) {
          const matched: typeof agentDets = [];
          let patternIdx = 0;
          for (const det of agentDets) {
            const pattern = patterns[patternIdx];
            if (!pattern) break;
            if ((!pattern.mitre_tactic || det.mitre_tactic === pattern.mitre_tactic) && (!pattern.mitre_technique_id || det.mitre_technique_id === pattern.mitre_technique_id) && (!pattern.event_type || pattern.event_type === 'any' || det.source_event_type === pattern.event_type)) {
              if (matched.length === 0 || (new Date(det.event_time).getTime() - new Date(matched[0].event_time).getTime()) <= windowMs) { matched.push(det); patternIdx++; }
            }
          }
          if (matched.length >= rule.min_events && patternIdx >= patterns.length) {
            await createIncident(supabase, tenantId, agentId, rule, matched, [...new Set(matched.map(m => m.mitre_tactic).filter(Boolean))]);
            incidentsCreated++;
          }
        }
      }
    }
  }

  logger.info(`[${requestId}] Created ${incidentsCreated} incidents`);
  return { success: true, incidents_created: incidentsCreated };
});

async function createIncident(supabase: SupabaseClient, tenantId: string, agentId: string, rule: Record<string, unknown>, matchedDets: Array<Record<string, unknown>>, tactics: string[]) {
  const techniques = [...new Set(matchedDets.map(m => m.mitre_technique_id).filter(Boolean))];
  const firstTime = matchedDets[0].event_time;
  const lastTime = matchedDets[matchedDets.length - 1].event_time;

  const { data: existingIncident } = await supabase.from('correlated_incidents').select('id').eq('tenant_id', tenantId).eq('correlation_rule', rule.rule_name).contains('affected_agents', [agentId]).gte('last_event_time', firstTime).maybeSingle();
  if (existingIncident) return;

  const { data: incident, error } = await supabase.from('correlated_incidents').insert({
    tenant_id: tenantId, title: `${rule.rule_name} — ${matchedDets.length} events`,
    description: `Correlation rule "${rule.rule_name}" matched ${matchedDets.length} events on agent ${agentId}. Tactics: ${tactics.join(', ')}`,
    severity: rule.severity, confidence_score: Math.min(95, 50 + matchedDets.length * 10),
    mitre_tactics: tactics, mitre_techniques: techniques, affected_agents: [agentId],
    event_count: matchedDets.length, first_event_time: firstTime, last_event_time: lastTime, correlation_rule: rule.rule_name,
  }).select('id').single();

  if (error || !incident) return;

  const eventLinks = matchedDets.map(det => ({ incident_id: incident.id, tenant_id: tenantId, detection_event_id: det.id, event_type: det.source_event_type || 'detection', event_summary: `${det.detection_name} (${det.mitre_technique_id || 'N/A'})`, event_time: det.event_time, agent_id: agentId, severity: det.severity, event_data: { detection_name: det.detection_name, command_line: det.command_line, process_name: det.process_name } }));
  const detIds = matchedDets.map(d => d.id);

  // deno-lint-ignore no-explicit-any
  const postOps: Promise<any>[] = [
    supabase.from('correlated_incident_events').insert(eventLinks),
    supabase.from('endpoint_detection_events').update({ status: 'investigating' }).in('id', detIds).eq('status', 'open'),
  ];
  if (rule.severity === 'critical') {
    postOps.push(supabase.from('system_alerts').insert({ tenant_id: tenantId, alert_type: 'correlated_incident', severity: 'critical', title: `[INCIDENT] ${rule.rule_name}`, description: `Multi-signal attack detected: ${tactics.join(' → ')}`, status: 'active', metadata: { incident_id: incident.id, affected_agents: [agentId], techniques } }));
  }
  await Promise.all(postOps);
}
