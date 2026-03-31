/**
 * SOAR Lite Engine — Migrated to serveInternal middleware
 * Automated Security Response
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface SOAREvent {
  tenant_id: string;
  agent_id: string;
  agent_name: string;
  event_type: string;
  severity: string;
  details: Record<string, unknown>;
}

interface SOARRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_conditions: Record<string, unknown>;
  action_type: string;
  action_params: Record<string, unknown>;
  severity_filter: string[];
  enabled: boolean;
  requires_approval: boolean;
  cooldown_minutes: number;
}

const BUILTIN_RULES: SOARRule[] = [
  { id: 'soar-builtin-001', name: 'Ransomware → Isolate Host', trigger_type: 'ransomware_detected', trigger_conditions: {}, action_type: 'isolate_host', action_params: {}, severity_filter: ['critical', 'high'], enabled: true, requires_approval: false, cooldown_minutes: 0 },
  { id: 'soar-builtin-002', name: 'Token Exfiltration → Revoke Token', trigger_type: 'token_exfiltration', trigger_conditions: {}, action_type: 'revoke_agent_token', action_params: {}, severity_filter: ['critical', 'high'], enabled: true, requires_approval: false, cooldown_minutes: 5 },
  { id: 'soar-builtin-003', name: 'AV Disabled → Re-enable AV', trigger_type: 'antivirus_disabled', trigger_conditions: {}, action_type: 'check_antivirus', action_params: {}, severity_filter: ['critical', 'high', 'medium'], enabled: true, requires_approval: false, cooldown_minutes: 30 },
  { id: 'soar-builtin-004', name: 'Firewall Disabled → Re-enable Firewall', trigger_type: 'firewall_disabled', trigger_conditions: {}, action_type: 'enable_firewall', action_params: {}, severity_filter: ['critical', 'high', 'medium'], enabled: true, requires_approval: false, cooldown_minutes: 30 },
  { id: 'soar-builtin-005', name: 'Suspicious Process → Kill Process', trigger_type: 'suspicious_process', trigger_conditions: {}, action_type: 'kill_process', action_params: {}, severity_filter: ['critical'], enabled: true, requires_approval: true, cooldown_minutes: 5 },
  { id: 'soar-builtin-006', name: 'C2 Communication → Block IP + Isolate', trigger_type: 'c2_communication', trigger_conditions: {}, action_type: 'isolate_host', action_params: { also_block_ip: true }, severity_filter: ['critical'], enabled: true, requires_approval: false, cooldown_minutes: 0 },
];

function mapEventToTrigger(eventType: string, _details: Record<string, unknown>): string {
  const mapping: Record<string, string> = {
    'ransomware': 'ransomware_detected', 'ransomware_detected': 'ransomware_detected',
    'token_leak': 'token_exfiltration', 'token_exfiltration': 'token_exfiltration',
    'antivirus_inactive': 'antivirus_disabled', 'antivirus_disabled': 'antivirus_disabled',
    'firewall_disabled': 'firewall_disabled', 'suspicious_process': 'suspicious_process',
    'c2_detected': 'c2_communication', 'c2_communication': 'c2_communication',
    'DET-015': 'c2_communication', 'DET-008': 'suspicious_process',
  };
  return mapping[eventType] || eventType;
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;

  const rawBody = body as SOAREvent | { events: SOAREvent[] };
  const events: SOAREvent[] = 'events' in rawBody ? rawBody.events : [rawBody as SOAREvent];

  if (!events.length) return { success: true, actions: 0 };

  const results: Array<{ event_type: string; rule: string; action: string; status: string }> = [];

  for (const event of events) {
    const triggerType = mapEventToTrigger(event.event_type, event.details);
    const matchedRules = BUILTIN_RULES.filter(r => r.enabled && r.trigger_type === triggerType && r.severity_filter.includes(event.severity));
    if (!matchedRules.length) continue;

    for (const rule of matchedRules) {
      if (rule.cooldown_minutes > 0) {
        const cooldownStart = new Date(Date.now() - rule.cooldown_minutes * 60 * 1000).toISOString();
        const { count } = await supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', event.tenant_id).eq('agent_name', event.agent_name).eq('type', rule.action_type).gte('created_at', cooldownStart);
        if ((count || 0) > 0) {
          logger.info(`[${requestId}] [SOAR] Cooldown active for ${rule.name} on ${event.agent_name}`);
          results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'cooldown' });
          continue;
        }
      }

      try {
        const { data: blastCheck } = await supabase.rpc('check_blast_radius', { p_tenant_id: event.tenant_id, p_action_type: rule.action_type, p_severity: event.severity });
        if (blastCheck && !blastCheck.allowed) {
          logger.warn(`[${requestId}] [SOAR] Blast radius exceeded for ${rule.name}: ${blastCheck.affected_percent}%`);
          results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'blast_radius_blocked' });
          continue;
        }
      } catch (e) {
        logger.error(`[${requestId}] [SOAR] Blast radius check failed - BLOCKING`, { error: e instanceof Error ? e.message : String(e) });
        results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'blast_radius_unavailable' });
        continue;
      }

      if (rule.requires_approval) {
        const { error: approvalError } = await supabase.from('playbook_executions').insert({
          tenant_id: event.tenant_id, playbook_id: null, agent_id: event.agent_id, status: 'pending',
          trigger_context: { soar_rule: rule.id, rule_name: rule.name, event_type: event.event_type, action_type: rule.action_type, action_params: rule.action_params, details: event.details },
        });
        if (approvalError) logger.error(`[${requestId}] [SOAR] Failed to create approval:`, approvalError);
        results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'pending_approval' });
      } else {
        try {
          const { error: remError } = await supabase.functions.invoke('auto-remediate', {
            body: { agent_id: event.agent_id, agent_name: event.agent_name, tenant_id: event.tenant_id, action_type: rule.action_type, source: 'soar-engine', soar_rule_id: rule.id, ...rule.action_params },
          });
          if (remError) {
            logger.error(`[${requestId}] [SOAR] Remediation failed for ${rule.name}:`, remError);
            results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'error' });
          } else {
            logger.info(`[${requestId}] [SOAR] Executed ${rule.name} on ${event.agent_name}`);
            results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'executed' });
          }
        } catch (execErr) {
          logger.error(`[${requestId}] [SOAR] Execution error:`, execErr);
          results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'error' });
        }
      }
    }
  }

  if (results.length > 0) {
    try {
      await supabase.from('audit_logs').insert(results.map(r => ({
        tenant_id: events[0].tenant_id, action: 'soar_engine_action', entity_type: 'soar_rule', entity_id: r.rule, details: r, performed_by: 'system',
      })));
    } catch (auditErr) { logger.warn(`[${requestId}] [SOAR] Failed to write audit logs:`, auditErr); }
  }

  return { success: true, actions: results.length, results, request_id: requestId };
});
