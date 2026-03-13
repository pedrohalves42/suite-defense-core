/**
 * evaluate-edr-detections — Server-side detection engine.
 * 
 * Evaluates configurable detection rules from DB against recent telemetry.
 * Called via cron or on-demand to catch patterns the inline engine might miss.
 * 
 * Auth: Internal only (cron/service_role)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

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

function matchesCondition(event: any, condition: { field: string; operator: string; value: string }): boolean {
  const fieldValue = String(event[condition.field] || '').toLowerCase();
  const matchValue = condition.value.toLowerCase();

  switch (condition.operator) {
    case 'contains': return fieldValue.includes(matchValue);
    case 'equals': return fieldValue === matchValue;
    case 'not_contains': return !fieldValue.includes(matchValue);
    case 'starts_with': return fieldValue.startsWith(matchValue);
    case 'regex':
      try { return new RegExp(condition.value, 'i').test(fieldValue); }
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

  // Verify internal caller
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

  for (const eventType of eventTypes) {
    const table = `endpoint_${eventType}_events`;
    const typeRules = rules.filter(r => r.event_type === eventType);

    const { data: events } = await supabase
      .from(table)
      .select('*')
      .gte('event_time', since)
      .eq('is_suspicious', false) // Only check events not already flagged
      .limit(BATCH_SIZE);

    if (!events?.length) continue;
    stats.evaluated += events.length;

    const newDetections: any[] = [];

    for (const event of events) {
      for (const rule of typeRules) {
        // Check tenant scope
        if (rule.tenant_id && rule.tenant_id !== event.tenant_id) continue;

        if (evaluateRule(event, rule)) {
          newDetections.push({
            tenant_id: event.tenant_id,
            agent_id: event.agent_id,
            detection_name: rule.rule_name,
            severity: rule.severity,
            confidence_score: rule.confidence_base,
            mitre_technique_id: rule.mitre_technique_id,
            mitre_tactic: rule.mitre_tactic,
            mitre_technique_name: rule.mitre_technique_name,
            description: `Rule "${rule.rule_name}" matched on ${eventType} event`,
            source_event_type: eventType,
            source_event_data: event,
            process_name: event.process_name,
            process_pid: event.pid || event.process_pid,
            command_line: event.command_line,
            file_path: event.file_path,
            remote_address: event.remote_address,
            event_time: event.event_time,
          });

          // Mark source event as suspicious
          await supabase
            .from(table)
            .update({ is_suspicious: true, detection_tags: [rule.id] })
            .eq('id', event.id);
        }
      }
    }

    if (newDetections.length > 0) {
      const { error } = await supabase.from('endpoint_detection_events').insert(newDetections);
      if (error) console.error(`[evaluate-edr] Insert error:`, error.message);
      else stats.detections += newDetections.length;
    }
  }

  console.log(`[evaluate-edr-detections] Evaluated=${stats.evaluated} Detections=${stats.detections}`);

  return new Response(JSON.stringify({ success: true, stats }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
