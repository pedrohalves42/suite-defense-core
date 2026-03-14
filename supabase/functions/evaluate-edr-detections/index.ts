/**
 * evaluate-edr-detections — Server-side detection engine.
 * 
 * Evaluates configurable detection rules from DB against recent telemetry.
 * Called via cron or on-demand to catch patterns the inline engine might miss.
 * 
 * Auth: Internal only (cron/service_role) via assertInternalCaller
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

const BATCH_SIZE = 500;

interface DetectionRule {
  id: string;
  tenant_id: string | null;
  rule_name: string;
  severity: string;
  confidence_base: number;
  mitre_technique_id: string;
  mitre_tactic: string;
  mitre_technique_name: string;
  event_type: string;
  rule_logic: {
    field: string;
    operator: 'contains' | 'equals' | 'regex' | 'not_contains' | 'starts_with';
    value: string;
    and?: Array<{ field: string; operator: string; value: string }>;
  };
}

// V-2007: Pre-compile regex cache to avoid repeated compilation
const regexCache = new Map<string, RegExp>();
function getCachedRegex(pattern: string): RegExp {
  let re = regexCache.get(pattern);
  if (!re) {
    re = new RegExp(pattern, 'i');
    regexCache.set(pattern, re);
  }
  return re;
}

function matchesCondition(event: any, condition: { field: string; operator: string; value: string }): boolean {
  const fieldValue = String(event[condition.field] || '').toLowerCase();
  const matchValue = condition.value.toLowerCase();

  switch (condition.operator) {
    case 'contains': return fieldValue.includes(matchValue);
    case 'equals': return fieldValue === matchValue;
    case 'not_contains': return !fieldValue.includes(matchValue);
    case 'starts_with': return fieldValue.startsWith(matchValue);
    case 'regex':
      try { return getCachedRegex(condition.value).test(fieldValue); }
      catch { return false; }
    default: return false;
  }
}

function evaluateRule(event: any, rule: DetectionRule): boolean {
  const logic = rule.rule_logic;
  if (!logic?.field) return false;

  const mainMatch = matchesCondition(event, logic);
  if (!mainMatch) return false;

  // Check AND conditions
  if (logic.and?.length) {
    return logic.and.every(cond => matchesCondition(event, cond));
  }

  return true;
}

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

  const lookbackMinutes = body.lookback_minutes || 15;
  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();

  // Fetch enabled rules
  const { data: rules, error: rulesErr } = await supabase
    .from('detection_rules')
    .select('*')
    .eq('is_enabled', true);

  if (rulesErr || !rules?.length) {
    return new Response(JSON.stringify({ message: 'No active rules', error: rulesErr?.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const stats = { evaluated: 0, detections: 0 };
  const eventTypes = [...new Set(rules.map(r => r.event_type))];

  // V-2009: Get distinct tenant_ids from rules to enforce tenant isolation
  const ruleTenantIds = [...new Set(rules.map(r => r.tenant_id).filter(Boolean))] as string[];
  // Also get tenants that have events (for global rules with tenant_id = null)
  // We iterate per tenant to ensure isolation
  const allTenantIds = new Set(ruleTenantIds);

  // If there are global rules (tenant_id = null), we need to find which tenants have data
  const hasGlobalRules = rules.some(r => !r.tenant_id);
  if (hasGlobalRules) {
    // V-9004 FIX: Get distinct tenants from recent events — use RPC or wider limit
    // to avoid missing tenants with data beyond the previous .limit(100)
    for (const eventType of eventTypes) {
      const table = `endpoint_${eventType}_events`;
      const { data: tenantRows } = await supabase
        .from(table)
        .select('tenant_id')
        .gte('event_time', since)
        .eq('is_suspicious', false)
        .limit(1000); // V-9004: Increased from 100 to 1000 to catch more tenants
      if (tenantRows) {
        const seen = new Set<string>();
        for (const row of tenantRows) {
          if (!seen.has(row.tenant_id)) {
            seen.add(row.tenant_id);
            allTenantIds.add(row.tenant_id);
          }
        }
      }
    }
  }

  // V-2009 FIX: Iterate per tenant to enforce strict isolation
  for (const tenantId of allTenantIds) {
    const tenantRules = rules.filter(r => !r.tenant_id || r.tenant_id === tenantId);

    for (const eventType of eventTypes) {
      const table = `endpoint_${eventType}_events`;
      const typeRules = tenantRules.filter(r => r.event_type === eventType);
      if (!typeRules.length) continue;

      // V-AUDIT: Pagination to avoid permanently missing events beyond BATCH_SIZE
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
      const { data: events } = await supabase
        .from(table)
        .select('*')
        .eq('tenant_id', tenantId) // V-2009: Enforce tenant isolation
        .gte('event_time', since)
        .eq('is_suspicious', false)
          .range(offset, offset + BATCH_SIZE - 1)
          .order('event_time', { ascending: true });

      if (!events?.length) { hasMore = false; break; }
        stats.evaluated += events.length;
        if (events.length < BATCH_SIZE) hasMore = false;

      const newDetections: any[] = [];
      const matchedEventIds: string[] = [];
      // V-2010: Track tags per event for merge instead of overwrite
      const eventTagsMap = new Map<string, string[]>();

      for (const event of events) {
        for (const rule of typeRules) {
          if (evaluateRule(event, rule)) {
            newDetections.push({
              tenant_id: tenantId,
              agent_id: event.agent_id,
              detection_name: rule.rule_name,
              severity: rule.severity,
              confidence_score: rule.confidence_base,
              mitre_technique_id: rule.mitre_technique_id,
              mitre_tactic: rule.mitre_tactic,
              mitre_technique_name: rule.mitre_technique_name,
              description: `Rule "${rule.rule_name}" matched on ${eventType} event`,
              source_event_type: eventType,
              // V-2008: Store minimal reference instead of full event
              source_event_data: {
                event_id: event.id,
                process_name: event.process_name,
                command_line: (event.command_line || '').substring(0, 500),
              },
              process_name: event.process_name,
              process_pid: event.pid || event.process_pid,
              command_line: event.command_line,
              file_path: event.file_path,
              remote_address: event.remote_address,
              event_time: event.event_time,
            });

            matchedEventIds.push(event.id);
            // V-2010: Accumulate tags for merge
            const existing = eventTagsMap.get(event.id) || (event.detection_tags || []);
            existing.push(rule.id);
            eventTagsMap.set(event.id, existing);
          }
        }
      }

      // V-2002: Batch UPDATE instead of N+1
      if (matchedEventIds.length > 0) {
        const uniqueIds = [...new Set(matchedEventIds)];
        await supabase
          .from(table)
          .update({ is_suspicious: true })
          .in('id', uniqueIds);

        // V-5004 FIX: Batch tags update - group events by identical tag sets
        const tagSetGroups = new Map<string, string[]>();
        for (const [eventId, tags] of eventTagsMap) {
          const uniqueTags = [...new Set(tags)].sort();
          const key = uniqueTags.join(',');
          if (!tagSetGroups.has(key)) tagSetGroups.set(key, []);
          tagSetGroups.get(key)!.push(eventId);
        }
        // One update per unique tag combination instead of per event
        for (const [tagKey, eventIds] of tagSetGroups) {
          await supabase
            .from(table)
            .update({ detection_tags: tagKey.split(',') })
            .in('id', eventIds);
        }
      }

      if (newDetections.length > 0) {
        const { error } = await supabase.from('endpoint_detection_events').insert(newDetections);
        if (error) console.error(`[evaluate-edr] Insert error:`, error.message);
        else stats.detections += newDetections.length;
      }
    }
  }

  console.log(`[evaluate-edr-detections] Evaluated=${stats.evaluated} Detections=${stats.detections}`);

  return new Response(JSON.stringify({ success: true, stats }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
