/**
 * Playbook Automation Handlers — Phase 1C
 * Inlined from: soar-engine, auto-execute-ai-actions, oncall-integration, create-itsm-ticket
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { fetchWithTimeout } from '../../_shared/fetch-with-timeout.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

// ── soar-engine ─────────────────────────────────────────────────────────

interface SOAREvent {
  tenant_id: string;
  agent_id: string;
  agent_name: string;
  event_type: string;
  severity: string;
  details: Record<string, unknown>;
}

interface SOARRule {
  id: string; name: string; trigger_type: string; trigger_conditions: Record<string, unknown>;
  action_type: string; action_params: Record<string, unknown>; severity_filter: string[];
  enabled: boolean; requires_approval: boolean; cooldown_minutes: number;
}

const BUILTIN_RULES: SOARRule[] = [
  { id: 'soar-builtin-001', name: 'Ransomware → Isolate Host', trigger_type: 'ransomware_detected', trigger_conditions: {}, action_type: 'isolate_host', action_params: {}, severity_filter: ['critical', 'high'], enabled: true, requires_approval: false, cooldown_minutes: 0 },
  { id: 'soar-builtin-002', name: 'Token Exfiltration → Revoke Token', trigger_type: 'token_exfiltration', trigger_conditions: {}, action_type: 'revoke_agent_token', action_params: {}, severity_filter: ['critical', 'high'], enabled: true, requires_approval: false, cooldown_minutes: 5 },
  { id: 'soar-builtin-003', name: 'AV Disabled → Re-enable AV', trigger_type: 'antivirus_disabled', trigger_conditions: {}, action_type: 'check_antivirus', action_params: {}, severity_filter: ['critical', 'high', 'medium'], enabled: true, requires_approval: false, cooldown_minutes: 30 },
  { id: 'soar-builtin-004', name: 'Firewall Disabled → Re-enable Firewall', trigger_type: 'firewall_disabled', trigger_conditions: {}, action_type: 'enable_firewall', action_params: {}, severity_filter: ['critical', 'high', 'medium'], enabled: true, requires_approval: false, cooldown_minutes: 30 },
  { id: 'soar-builtin-005', name: 'Suspicious Process → Kill Process', trigger_type: 'suspicious_process', trigger_conditions: {}, action_type: 'kill_process', action_params: {}, severity_filter: ['critical'], enabled: true, requires_approval: true, cooldown_minutes: 5 },
  { id: 'soar-builtin-006', name: 'C2 Communication → Block IP + Isolate', trigger_type: 'c2_communication', trigger_conditions: {}, action_type: 'isolate_host', action_params: { also_block_ip: true }, severity_filter: ['critical'], enabled: true, requires_approval: false, cooldown_minutes: 0 },
];

const EVENT_TRIGGER_MAP: Record<string, string> = {
  'ransomware': 'ransomware_detected', 'ransomware_detected': 'ransomware_detected',
  'token_leak': 'token_exfiltration', 'token_exfiltration': 'token_exfiltration',
  'antivirus_inactive': 'antivirus_disabled', 'antivirus_disabled': 'antivirus_disabled',
  'firewall_disabled': 'firewall_disabled', 'suspicious_process': 'suspicious_process',
  'c2_detected': 'c2_communication', 'c2_communication': 'c2_communication',
  'DET-015': 'c2_communication', 'DET-008': 'suspicious_process',
};

export async function handleSoarEngine(supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>): Promise<unknown> {
  const rawBody = payload as SOAREvent | { events: SOAREvent[] };
  const events: SOAREvent[] = 'events' in rawBody ? rawBody.events : [rawBody as SOAREvent];
  if (!events.length) return { success: true, actions: 0 };

  const results: Array<{ event_type: string; rule: string; action: string; status: string }> = [];

  for (const event of events) {
    const triggerType = EVENT_TRIGGER_MAP[event.event_type] || event.event_type;
    const matchedRules = BUILTIN_RULES.filter(r => r.enabled && r.trigger_type === triggerType && r.severity_filter.includes(event.severity));
    if (!matchedRules.length) continue;

    for (const rule of matchedRules) {
      if (rule.cooldown_minutes > 0) {
        const cooldownStart = new Date(Date.now() - rule.cooldown_minutes * 60 * 1000).toISOString();
        const { count } = await supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', event.tenant_id).eq('agent_name', event.agent_name).eq('type', rule.action_type).gte('created_at', cooldownStart);
        if ((count || 0) > 0) {
          results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'cooldown' });
          continue;
        }
      }

      try {
        const { data: blastCheck } = await supabase.rpc('check_blast_radius', { p_tenant_id: event.tenant_id, p_action_type: rule.action_type, p_severity: event.severity });
        if (blastCheck && !blastCheck.allowed) {
          results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'blast_radius_blocked' });
          continue;
        }
      } catch (e) {
        logger.error(`[${requestId}] [SOAR] Blast radius check failed - BLOCKING`, { error: e instanceof Error ? e.message : String(e) });
        results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'blast_radius_unavailable' });
        continue;
      }

      if (rule.requires_approval) {
        await supabase.from('playbook_executions').insert({
          tenant_id: event.tenant_id, playbook_id: null, agent_id: event.agent_id, status: 'pending',
          trigger_context: { soar_rule: rule.id, rule_name: rule.name, event_type: event.event_type, action_type: rule.action_type, action_params: rule.action_params, details: event.details },
        });
        results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: 'pending_approval' });
      } else {
        try {
          const { error: remError } = await supabase.functions.invoke('auto-remediate', {
            body: { agent_id: event.agent_id, agent_name: event.agent_name, tenant_id: event.tenant_id, action_type: rule.action_type, source: 'soar-engine', soar_rule_id: rule.id, ...rule.action_params },
          });
          results.push({ event_type: event.event_type, rule: rule.name, action: rule.action_type, status: remError ? 'error' : 'executed' });
          if (remError) logger.error(`[${requestId}] [SOAR] Remediation failed:`, remError);
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
}

// ── auto-execute-ai-actions ─────────────────────────────────────────────

interface ActionRecord {
  id: string; action_type: string; action_payload: Record<string, unknown>;
  tenant_id: string; insight_id: string | null;
}

interface AutoExecPolicyResponse {
  execution_mode: 'auto' | 'approval' | 'disabled';
  source: 'tenant_policy' | 'default_mapping' | 'tenant_fallback';
}

async function resolvePolicyViaHttp(supabaseUrl: string, supabaseKey: string, tenantId: string, insightType: string, requestId: string): Promise<AutoExecPolicyResponse> {
  try {
    const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/ops-gateway`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
      body: JSON.stringify({ action: 'playbook:resolve-action-policy', payload: { tenant_id: tenantId, insight_type: insightType } }),
    });
    if (!response.ok) return { execution_mode: 'approval', source: 'tenant_fallback' };
    return await response.json();
  } catch {
    return { execution_mode: 'approval', source: 'tenant_fallback' };
  }
}

function shouldSkipAction(config: Record<string, unknown> | undefined, policy: AutoExecPolicyResponse): string | null {
  if (!config || !config.is_enabled) return 'action type not enabled';
  if (config.requires_approval) return 'requires manual approval (config)';
  if (policy.execution_mode === 'disabled') return `disabled by policy (source=${policy.source})`;
  if (policy.execution_mode === 'approval') return `requires approval (source=${policy.source})`;
  if (config.risk_level === 'high') return 'high risk action';
  return null;
}

async function executeActionItem(supabase: SupabaseClient, action: ActionRecord, requestId: string): Promise<Record<string, unknown> | null> {
  switch (action.action_type) {
    case 'create_system_alert': {
      const p = action.action_payload;
      const validAlertTypes = ['agent_offline', 'high_cpu', 'high_memory', 'high_disk', 'job_failed', 'security_threat', 'memory_warning', 'ai_insight_alert', 'blocked_access_pattern', 'job_integrity_violation', 'safe_mode_auto', 'agent_divergent', 'progressive_degradation'];
      let alertType = p.alert_type || 'ai_insight_alert';
      if (!validAlertTypes.includes(alertType as string)) alertType = 'ai_insight_alert';
      const { data: alert, error } = await supabase.from('system_alerts').insert({
        tenant_id: action.tenant_id, alert_type: alertType, severity: p.severity || 'info',
        title: ((p.title || p.message || 'AI Alert') as string).slice(0, 80),
        message: p.message || p.title || 'AI-generated alert',
        details: { insight_id: action.insight_id, auto_executed: true, source: 'auto-execute-ai-actions', original_payload: p },
      }).select().maybeSingle();
      if (error) throw error;
      return { alert_id: alert?.id || 'created' };
    }
    case 'cleanup_stuck_jobs': {
      const { data: cleanupResult, error } = await supabase.rpc('cleanup_stuck_jobs');
      if (error) throw error;
      return { action_executed: true, cleanup_result: cleanupResult, jobs_cleaned: cleanupResult?.[0]?.cleaned_count || 0 };
    }
    case 'suggest_agent_restart':
    case 'suggest_config_change':
    case 'suggest_job_cleanup':
      return { suggestion_recorded: true, action_type: action.action_type, payload: action.action_payload };
    default:
      return null;
  }
}

export async function handleAutoExecuteAiActions(supabase: SupabaseClient, requestId: string, _payload: Record<string, unknown>): Promise<unknown> {
  const startTime = Date.now();
  logger.info(`[${requestId}] auto-execute-ai-actions started`);

  const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
  if (systemMode === 'halt_jobs') return { __status: 503, success: false, error: 'SYSTEM_HALTED', message: 'Kill switch is active.' };

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const { data: pendingActionsRaw, error: actionsError } = await supabase.rpc('get_balanced_pending_actions', { p_limit: 50 });
  let pendingActions = pendingActionsRaw;
  if (actionsError || !pendingActionsRaw) {
    const { data, error } = await supabase.from('ai_actions').select('id, tenant_id, action_type, action_payload, insight_id, ai_insights(id, confidence_score, insight_type, status)').eq('status', 'pending').order('created_at', { ascending: true }).limit(50);
    if (error) throw error;
    pendingActions = data;
  }

  if (!pendingActions || pendingActions.length === 0) {
    await supabase.rpc('log_scheduled_job_run', { p_job_key: 'auto-execute-ai-actions', p_success: true, p_duration_ms: Date.now() - startTime, p_result: { message: 'No pending actions' }, p_processed_count: 0, p_job_source: 'cron' });
    return { success: true, message: 'No pending actions', actions_processed: 0 };
  }

  const { data: actionConfigs } = await supabase.from('ai_action_configs').select('action_type, is_enabled, requires_approval, risk_level, max_executions_per_day');
  const configMap = new Map(actionConfigs?.map(c => [c.action_type, c]) || []);
  const result = { actions_processed: 0, actions_executed: 0, actions_skipped: 0, insights_resolved: 0, errors: [] as string[] };

  for (const action of pendingActions) {
    result.actions_processed++;
    const config = configMap.get(action.action_type) as Record<string, unknown> | undefined;
    const insight = action.ai_insights as Record<string, unknown>;
    const insightType = (insight?.insight_type as string) || '';
    const policy = await resolvePolicyViaHttp(supabaseUrl, supabaseKey, action.tenant_id, insightType, requestId);

    const skipReason = shouldSkipAction(config, policy);
    if (skipReason) { result.actions_skipped++; continue; }

    const insightSeverity = (insight?.severity as string) || (config?.risk_level as string) || 'medium';
    const { data: needsHumanReview } = await supabase.rpc('requires_human_review', { p_tenant_id: action.tenant_id, p_severity: insightSeverity, p_action_type: action.action_type });
    if (needsHumanReview) {
      await supabase.from('approval_requests').insert({ tenant_id: action.tenant_id, action_type: action.action_type, action_payload: { ...(action.action_payload as Record<string, unknown>), insight_id: action.insight_id, original_severity: insightSeverity, human_review_reason: 'critical_severity_requires_approval' }, requested_by: null, status: 'pending', required_approvers: 1, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
      await supabase.from('ai_actions').update({ status: 'awaiting_approval' }).eq('id', action.id);
      result.actions_skipped++; continue;
    }

    const { data: canExecute } = await supabase.rpc('check_action_rate_limit', { p_action_type: action.action_type, p_tenant_id: action.tenant_id });
    if (!canExecute) { result.actions_skipped++; continue; }

    if (action.insight_id && insight) {
      await supabase.from('ai_insights').update({ status: 'in_progress' }).eq('id', action.insight_id);
    }

    try {
      const executionResult = await executeActionItem(supabase, action as ActionRecord, requestId);
      if (executionResult === null) { result.actions_skipped++; continue; }

      await supabase.from('ai_actions').update({ status: 'executed', executed_at: new Date().toISOString(), result: { ...executionResult, policy_source: policy.source, policy_mode: policy.execution_mode } }).eq('id', action.id);
      await supabase.from('ai_action_executions').insert({ action_id: action.id, tenant_id: action.tenant_id, execution_status: 'executed', execution_result: { ...executionResult, policy_source: policy.source }, executed_at: new Date().toISOString() });
      if (action.insight_id) {
        await supabase.from('ai_insights').update({ status: 'resolved', resolved_at: new Date().toISOString(), auto_action_executed: true }).eq('id', action.insight_id);
        result.insights_resolved++;
      }
      result.actions_executed++;
    } catch (execError: unknown) {
      const errMsg = execError instanceof Error ? execError.message : String(execError);
      result.errors.push(`${action.id}: ${errMsg}`);
      await supabase.from('ai_actions').update({ status: 'failed', error_message: errMsg }).eq('id', action.id);
      if (action.insight_id) await supabase.from('ai_insights').update({ status: 'failed' }).eq('id', action.insight_id);
    }
  }

  const duration = Date.now() - startTime;
  await supabase.rpc('log_scheduled_job_run', { p_job_key: 'auto-execute-ai-actions', p_success: true, p_duration_ms: duration, p_result: result, p_processed_count: result.actions_processed, p_job_source: 'cron' });
  return { success: true, request_id: requestId, duration_ms: duration, ...result };
}

// ── oncall-integration ──────────────────────────────────────────────────

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

export async function handleOncallIntegration(supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>): Promise<unknown> {
  const PAGERDUTY_API_KEY = Deno.env.get('PAGERDUTY_API_KEY') || '';
  const PAGERDUTY_ROUTING_KEY = Deno.env.get('PAGERDUTY_ROUTING_KEY') || '';
  const PAGERDUTY_SCHEDULE_ID = Deno.env.get('PAGERDUTY_SCHEDULE_ID') || '';

  const parsed = OncallSchema.safeParse(payload);
  if (!parsed.success) return { __status: 400, error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors };

  const data = parsed.data;
  const action = data.action;

  if (action === 'alert') {
    const { summary, severity, source, details, tenantId } = data;
    if (!summary) return { __status: 400, error: 'summary required' };
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
    if (!data.incidentId) return { __status: 400, error: 'incidentId required' };
    await supabase.from('oncall_alerts').update({ status: 'escalated', escalated_at: new Date().toISOString() }).eq('incident_id', data.incidentId);
    return { success: true };
  }

  if (action === 'schedule') {
    if (!data.name || !data.rotation) return { __status: 400, error: 'name and rotation required' };
    await supabase.from('oncall_schedules').upsert({ name: data.name, timezone: data.timezone || 'UTC', rotation: data.rotation, updated_at: new Date().toISOString() });
    return { success: true };
  }

  if (action === 'alerts') {
    const { data: alerts } = await supabase.from('oncall_alerts').select('id, title, severity, status, triggered_at, acknowledged_at, resolved_at, assignee_id, escalation_level, tenant_id').in('status', ['triggered', 'acknowledged', 'escalated']).order('triggered_at', { ascending: false }).limit(50);
    return { alerts: alerts || [] };
  }

  return { __status: 400, error: 'Unknown action' };
}

// ── create-itsm-ticket ──────────────────────────────────────────────────

const CreateTicketSchema = z.object({
  integration_id: z.string().uuid(),
  summary: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
  source_type: z.enum(['alert', 'vulnerability', 'remediation', 'compliance', 'manual']),
  source_id: z.string().uuid().optional(),
  agent_id: z.string().uuid().optional(),
  agent_name: z.string().max(255).optional(),
  tenant_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
});

function mapPriorityToJira(priority: string): string {
  const map: Record<string, string> = { critical: 'Highest', high: 'High', medium: 'Medium', low: 'Low', info: 'Lowest' };
  return map[priority.toLowerCase()] || 'Medium';
}

function mapPriorityToServiceNow(priority: string): number {
  const map: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4, info: 5 };
  return map[priority.toLowerCase()] || 3;
}

async function createJiraTicket(integration: Record<string, unknown>, ticket: z.infer<typeof CreateTicketSchema>): Promise<{ id: string; key: string; url: string }> {
  const creds = integration.credentials_encrypted as Record<string, string>;
  const baseUrl = (integration.base_url as string).replace(/\/$/, '');
  const projectKey = integration.project_key as string;
  const issueType = integration.default_issue_type as string || 'Task';
  const jiraPriority = mapPriorityToJira(ticket.priority || integration.default_priority as string || 'Medium');
  const body = {
    fields: {
      project: { key: projectKey }, summary: ticket.summary,
      description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: ticket.description || ticket.summary }] }] },
      issuetype: { name: issueType }, priority: { name: jiraPriority }, labels: ['cybershield', `source-${ticket.source_type}`],
    }
  };
  const auth = btoa(`${creds.email}:${creds.api_token}`);
  const response = await fetchWithTimeout(`${baseUrl}/rest/api/3/issue`, {
    method: 'POST', headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) { const errText = await response.text(); throw new Error(`Jira API error ${response.status}: ${errText}`); }
  const data = await response.json();
  return { id: data.id, key: data.key, url: `${baseUrl}/browse/${data.key}` };
}

async function createServiceNowTicket(integration: Record<string, unknown>, ticket: z.infer<typeof CreateTicketSchema>): Promise<{ id: string; key: string; url: string }> {
  const creds = integration.credentials_encrypted as Record<string, string>;
  const baseUrl = (integration.base_url as string).replace(/\/$/, '');
  const snPriority = mapPriorityToServiceNow(ticket.priority || integration.default_priority as string || 'Medium');
  const body = {
    short_description: ticket.summary, description: ticket.description || ticket.summary,
    priority: snPriority, category: 'Security', subcategory: ticket.source_type,
    impact: snPriority <= 2 ? '1' : '2', urgency: snPriority <= 2 ? '1' : '2',
  };
  const auth = btoa(`${creds.username}:${creds.password}`);
  const response = await fetchWithTimeout(`${baseUrl}/api/now/table/incident`, {
    method: 'POST', headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) { const errText = await response.text(); throw new Error(`ServiceNow API error ${response.status}: ${errText}`); }
  const data = await response.json();
  return { id: data.result?.sys_id, key: data.result?.number, url: `${baseUrl}/nav_to.do?uri=incident.do?sys_id=${data.result?.sys_id}` };
}

export async function handleCreateItsmTicket(supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>): Promise<unknown> {
  const parsed = CreateTicketSchema.safeParse(payload);
  if (!parsed.success) return { __status: 400, error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors };

  const ticketBody = parsed.data;
  const tenantId = ticketBody.tenant_id || (payload.tenant_id as string);
  const userId = ticketBody.user_id || (payload.user_id as string);
  if (!tenantId) return { __status: 400, error: 'tenant_id is required' };

  const { data: integration, error: intErr } = await supabase.from('itsm_integrations').select('id, tenant_id, provider, base_url, project_key, default_issue_type, default_priority, credentials_encrypted, is_active').eq('id', ticketBody.integration_id).eq('tenant_id', tenantId).eq('is_active', true).single();
  if (intErr || !integration) return { __status: 404, error: 'Integration not found or inactive' };

  let result: { id: string; key: string; url: string };
  if (integration.provider === 'jira') {
    result = await createJiraTicket(integration as Record<string, unknown>, ticketBody);
  } else if (integration.provider === 'servicenow') {
    result = await createServiceNowTicket(integration as Record<string, unknown>, ticketBody);
  } else {
    return { __status: 400, error: `Unknown provider: ${integration.provider}` };
  }

  const { data: ticket, error: ticketErr } = await supabase.from('itsm_tickets').insert({
    tenant_id: tenantId, integration_id: ticketBody.integration_id,
    external_ticket_id: result.id, external_ticket_key: result.key, external_ticket_url: result.url,
    provider: integration.provider, source_type: ticketBody.source_type, source_id: ticketBody.source_id || null,
    summary: ticketBody.summary, description: ticketBody.description,
    priority: ticketBody.priority || integration.default_priority, status: 'open',
    agent_id: ticketBody.agent_id || null, agent_name: ticketBody.agent_name || null, created_by: userId,
  }).select('id').single();

  if (ticketErr) logger.error(`[create-itsm-ticket][${requestId}] Failed to save ticket record:`, ticketErr);

  return { success: true, ticket_id: ticket?.id, external_key: result.key, external_url: result.url, provider: integration.provider };
}
