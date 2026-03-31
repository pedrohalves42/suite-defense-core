/**
 * evaluate-edr-detections → Migrated to serveInternal middleware
 * Server-side detection engine.
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

const BATCH_SIZE = 500;

interface DetectionRule {
  id: string; tenant_id: string | null; rule_name: string; severity: string;
  confidence_base: number; mitre_technique_id: string; mitre_tactic: string;
  mitre_technique_name: string; event_type: string;
  rule_logic: { field: string; operator: 'contains' | 'equals' | 'regex' | 'not_contains' | 'starts_with'; value: string; and?: Array<{ field: string; operator: string; value: string }>; };
}

const regexCache = new Map<string, RegExp>();
function getCachedRegex(pattern: string): RegExp {
  let re = regexCache.get(pattern);
  if (!re) { re = new RegExp(pattern, 'i'); regexCache.set(pattern, re); }
  return re;
}

function matchesCondition(event: Record<string, unknown>, condition: { field: string; operator: string; value: string }): boolean {
  const fieldValue = String(event[condition.field] || '').toLowerCase();
  const matchValue = condition.value.toLowerCase();
  switch (condition.operator) {
    case 'contains': return fieldValue.includes(matchValue);
    case 'equals': return fieldValue === matchValue;
    case 'not_contains': return !fieldValue.includes(matchValue);
    case 'starts_with': return fieldValue.startsWith(matchValue);
    case 'regex': try { return getCachedRegex(condition.value).test(fieldValue); } catch { return false; }
    default: return false;
  }
}

function evaluateRule(event: Record<string, unknown>, rule: DetectionRule): boolean {
  const logic = rule.rule_logic;
  if (!logic?.field) return false;
  const mainMatch = matchesCondition(event, logic);
  if (!mainMatch) return false;
  if (logic.and?.length) return logic.and.every(cond => matchesCondition(event, cond));
  return true;
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;
  const lookbackMinutes = (body as Record<string, unknown>)?.lookback_minutes || 15;
  const since = new Date(Date.now() - (lookbackMinutes as number) * 60 * 1000).toISOString();

  const { data: rules, error: rulesErr } = await supabase.from('detection_rules').select('*').eq('is_enabled', true);
  if (rulesErr || !rules?.length) return { message: 'No active rules', error: rulesErr?.message };

  const stats = { evaluated: 0, detections: 0 };
  const eventTypes = [...new Set(rules.map(r => r.event_type))];
  const allTenantIds = new Set([...new Set(rules.map(r => r.tenant_id).filter(Boolean))] as string[]);
  const hasGlobalRules = rules.some(r => !r.tenant_id);

  if (hasGlobalRules) {
    for (const eventType of eventTypes) {
      const table = `endpoint_${eventType}_events`;
      const { data: tenantRows } = await supabase.from(table).select('tenant_id').gte('event_time', since).limit(1000);
      if (tenantRows) { for (const row of tenantRows) allTenantIds.add(row.tenant_id); }
    }
  }

  for (const tenantId of allTenantIds) {
    const tenantRules = rules.filter(r => !r.tenant_id || r.tenant_id === tenantId);
    for (const eventType of eventTypes) {
      const table = `endpoint_${eventType}_events`;
      const typeRules = tenantRules.filter(r => r.event_type === eventType);
      if (!typeRules.length) continue;

      let offset = 0; let hasMore = true;
      while (hasMore) {
        const { data: events } = await supabase.from(table).select('*').eq('tenant_id', tenantId).gte('event_time', since).eq('is_suspicious', false).range(offset, offset + BATCH_SIZE - 1).order('event_time', { ascending: true });
        if (!events?.length) { hasMore = false; break; }
        stats.evaluated += events.length;
        if (events.length < BATCH_SIZE) hasMore = false;

        const newDetections: Array<Record<string, unknown>> = [];
        const matchedEventIds: string[] = [];
        const eventTagsMap = new Map<string, string[]>();

        for (const event of events) {
          for (const rule of typeRules) {
            if (evaluateRule(event, rule)) {
              newDetections.push({ tenant_id: tenantId, agent_id: event.agent_id, detection_name: rule.rule_name, severity: rule.severity, confidence_score: rule.confidence_base, mitre_technique_id: rule.mitre_technique_id, mitre_tactic: rule.mitre_tactic, mitre_technique_name: rule.mitre_technique_name, description: `Rule "${rule.rule_name}" matched on ${eventType} event`, source_event_type: eventType, source_event_data: { event_id: event.id, process_name: event.process_name, command_line: (event.command_line || '').substring(0, 500) }, process_name: event.process_name, process_pid: event.pid || event.process_pid, command_line: event.command_line, file_path: event.file_path, remote_address: event.remote_address, event_time: event.event_time });
              matchedEventIds.push(event.id);
              const existing = eventTagsMap.get(event.id) || (event.detection_tags || []);
              existing.push(rule.id);
              eventTagsMap.set(event.id, existing);
            }
          }
        }

        if (matchedEventIds.length > 0) {
          const uniqueIds = [...new Set(matchedEventIds)];
          await supabase.from(table).update({ is_suspicious: true }).in('id', uniqueIds);
          const tagSetGroups = new Map<string, string[]>();
          for (const [eventId, tags] of eventTagsMap) {
            const key = [...new Set(tags)].sort().join(',');
            if (!tagSetGroups.has(key)) tagSetGroups.set(key, []);
            tagSetGroups.get(key)!.push(eventId);
          }
          await Promise.all([...tagSetGroups.entries()].map(([tagKey, eventIds]) => supabase.from(table).update({ detection_tags: tagKey.split(',') }).in('id', eventIds)));
        }

        if (newDetections.length > 0) {
          const { error } = await supabase.from('endpoint_detection_events').insert(newDetections);
          if (error) logger.error(`[${requestId}] Insert error:`, error.message);
          else stats.detections += newDetections.length;
        }
        offset += BATCH_SIZE;
      }
    }
  }

  logger.info(`[${requestId}] Evaluated=${stats.evaluated} Detections=${stats.detections}`);
  return { success: true, stats };
});
