import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsSecurityHeaders, secureJsonResponse, secureErrorResponse, secureCorsPreflightResponse } from '../_shared/security-headers.ts';

/**
 * Evaluate Automation Rules
 * 
 * Called after metric ingestion or on-demand.
 * Checks active rules against latest agent metrics/processes and executes actions.
 * Supports trigger types: metric_threshold, process_anomaly
 */

// ── Helpers ──

function evaluateOperator(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '>': return value > threshold;
    case '>=': return value >= threshold;
    case '<': return value < threshold;
    case '<=': return value <= threshold;
    case '==': return value === threshold;
    default: return false;
  }
}

function isInCooldown(rule: any): boolean {
  if (!rule.last_triggered_at) return false;
  const cooldownMs = (rule.cooldown_minutes || 30) * 60 * 1000;
  return Date.now() - new Date(rule.last_triggered_at).getTime() < cooldownMs;
}

function matchesScope(rule: any, agentId: string): boolean {
  if (rule.target_scope === 'all_agents') return true;
  if (rule.target_scope === 'specific_agent') {
    return (rule.target_ids || []).includes(agentId);
  }
  return true;
}

// ── Action Executors ──

async function executeAction(
  supabase: any,
  rule: any,
  agentId: string,
  tenantId: string,
  triggerData: any,
  agents: any[]
): Promise<{ status: string; result: any }> {
  const actionConfig = rule.action_config as any;

  try {
    if (rule.action_type === 'send_alert' || rule.action_type === 'create_alert') {
      const { data: alertData, error: alertError } = await supabase
        .from('system_alerts')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          alert_type: 'automation_alert',
          severity: triggerData.value >= 95 ? 'critical' : 'high',
          title: `[Auto] ${rule.name}`,
          message: triggerData.message || `Rule triggered: ${JSON.stringify(triggerData)}`,
          details: { ...triggerData, rule_id: rule.id },
        })
        .select('id')
        .maybeSingle();

      if (alertError) throw new Error(alertError.message || JSON.stringify(alertError));

      // ── SOAR Bridge: Dispatch playbook trigger for matching event types ──
      const triggerTypeMap: Record<string, string> = {
        'suspicious_process': 'suspicious_process',
        'agent_offline': 'agent_offline',
        'high_cpu': 'metric_threshold',
        'low_disk': 'metric_threshold',
      };
      const eventType = triggerData.event_type || rule.trigger_type;
      const playbookTrigger = triggerTypeMap[eventType];

      if (playbookTrigger) {
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          await fetch(`${supabaseUrl}/functions/v1/evaluate-playbook-triggers`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              tenant_id: tenantId,
              trigger_type: playbookTrigger,
              agent_id: agentId,
              context: { ...triggerData, source: 'automation_rule', rule_id: rule.id },
            }),
          });
        } catch (bridgeErr) {
          console.warn('[SOAR Bridge] Failed to dispatch playbook trigger:', bridgeErr);
          // Non-blocking: alert was already created successfully
        }
      }

      return { status: 'executed', result: { alert_id: alertData?.id } };

    } else if (rule.action_type === 'create_job') {
      const agent = agents.find((a: any) => a.id === agentId);
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agent?.agent_name || 'Unknown',
          type: actionConfig.job_type || 'health_report',
          status: 'queued',
          payload: {
            source: 'automation_rule',
            rule_id: rule.id,
            ...triggerData,
            ...actionConfig.params,
          },
        })
        .select('id')
        .maybeSingle();

      if (jobError) throw new Error(jobError.message || JSON.stringify(jobError));
      return { status: 'executed', result: { job_id: jobData?.id } };
    }

    return { status: 'skipped', result: { reason: `Unknown action: ${rule.action_type}` } };
  } catch (error: any) {
    const errMsg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    return { status: 'failed', result: { error: errMsg } };
  }
}

// ── Trigger Evaluators ──

async function evaluateMetricThreshold(
  supabase: any,
  rule: any,
  tenantId: string,
  agents: any[],
  latestMetrics: Map<string, any>
): Promise<any[]> {
  const conditions = rule.trigger_conditions as any;
  const executions: any[] = [];

  for (const [agentId, m] of latestMetrics) {
    if (!matchesScope(rule, agentId)) continue;

    const metricMap: Record<string, number | null> = {
      'cpu_usage_percent': m.cpu_usage_percent,
      'cpu_percent': m.cpu_usage_percent, // alias for rule compatibility
      'memory_usage_percent': m.memory_usage_percent,
      'memory_percent': m.memory_usage_percent, // alias
      'disk_usage_percent': m.disk_usage_percent,
      'disk_free_percent': m.disk_usage_percent != null ? 100 - m.disk_usage_percent : null, // inverse alias
    };

    const metricValue = metricMap[conditions.metric];
    if (metricValue === null || metricValue === undefined) continue;

    if (evaluateOperator(metricValue, conditions.operator, conditions.value)) {
      const triggerData = {
        metric: conditions.metric,
        value: metricValue,
        threshold: conditions.value,
        message: `${conditions.metric} = ${metricValue}% (threshold: ${conditions.operator} ${conditions.value}%)`,
      };

      const { status, result } = await executeAction(supabase, rule, agentId, tenantId, triggerData, agents);

      executions.push({
        tenant_id: tenantId,
        rule_id: rule.id,
        agent_id: agentId,
        trigger_data: triggerData,
        action_taken: rule.action_type,
        action_result: result,
        status,
        executed_at: status === 'executed' ? new Date().toISOString() : null,
      });
    }
  }

  return executions;
}

async function evaluateProcessAnomaly(
  supabase: any,
  rule: any,
  tenantId: string,
  agents: any[]
): Promise<any[]> {
  const conditions = rule.trigger_conditions as any;
  const executions: any[] = [];
  const agentIds = agents.map((a: any) => a.id);

  // Get latest process snapshots
  const { data: processData } = await supabase
    .from('agent_processes')
    .select('agent_id, suspicious_processes, new_processes, total_processes, collected_at')
    .in('agent_id', agentIds)
    .order('collected_at', { ascending: false });

  // Deduplicate: keep latest per agent
  const latestProcesses = new Map<string, any>();
  (processData || []).forEach((p: any) => {
    if (!latestProcesses.has(p.agent_id)) {
      latestProcesses.set(p.agent_id, p);
    }
  });

  for (const [agentId, p] of latestProcesses) {
    if (!matchesScope(rule, agentId)) continue;

    let shouldTrigger = false;
    let triggerData: any = {};

    const eventType = conditions.eventType || conditions.event_type || 'suspicious_process';

    if (eventType === 'suspicious_process') {
      const suspiciousCount = (p.suspicious_processes || []).length;
      const threshold = conditions.value || 1;
      shouldTrigger = suspiciousCount >= threshold;
      triggerData = {
        event_type: 'suspicious_process',
        count: suspiciousCount,
        threshold,
        processes: (p.suspicious_processes || []).slice(0, 5).map((sp: any) => sp.name),
        message: `${suspiciousCount} suspicious process(es) detected (threshold: ${threshold})`,
      };
    } else if (eventType === 'new_process_burst') {
      const newCount = (p.new_processes || []).length;
      const threshold = conditions.value || 10;
      shouldTrigger = newCount >= threshold;
      triggerData = {
        event_type: 'new_process_burst',
        count: newCount,
        threshold,
        message: `${newCount} new processes detected in snapshot (threshold: ${threshold})`,
      };
    }

    if (shouldTrigger) {
      const { status, result } = await executeAction(supabase, rule, agentId, tenantId, triggerData, agents);

      executions.push({
        tenant_id: tenantId,
        rule_id: rule.id,
        agent_id: agentId,
        trigger_data: triggerData,
        action_taken: rule.action_type,
        action_result: result,
        status,
        executed_at: status === 'executed' ? new Date().toISOString() : null,
      });
    }
  }

  return executions;
}

// ── Agent Status Evaluator ──

async function evaluateAgentStatus(
  supabase: any,
  rule: any,
  tenantId: string,
  agents: any[]
): Promise<any[]> {
  const conditions = rule.trigger_conditions as any;
  const executions: any[] = [];
  const eventType = conditions.eventType || conditions.event_type || 'agent_offline';
  const durationMinutes = conditions.duration_minutes || 10;
  const thresholdMs = durationMinutes * 60 * 1000;

  // Get all agents with heartbeat info
  const { data: allAgents } = await supabase
    .from('agents')
    .select('id, agent_name, status, last_heartbeat')
    .eq('tenant_id', tenantId);

  if (!allAgents) return executions;

  for (const agent of allAgents) {
    if (!matchesScope(rule, agent.id)) continue;

    let shouldTrigger = false;
    let triggerData: any = {};

    if (eventType === 'agent_offline') {
      const lastHb = agent.last_heartbeat ? new Date(agent.last_heartbeat).getTime() : 0;
      const offlineDuration = Date.now() - lastHb;
      shouldTrigger = offlineDuration > thresholdMs && agent.status !== 'archived';

      if (shouldTrigger) {
        triggerData = {
          event_type: 'agent_offline',
          agent_name: agent.agent_name,
          offline_minutes: Math.round(offlineDuration / 60000),
          threshold_minutes: durationMinutes,
          message: `Agent '${agent.agent_name}' offline for ${Math.round(offlineDuration / 60000)} min (threshold: ${durationMinutes} min)`,
        };
      }
    }

    if (shouldTrigger) {
      const { status, result } = await executeAction(supabase, rule, agent.id, tenantId, triggerData, allAgents);
      executions.push({
        tenant_id: tenantId,
        rule_id: rule.id,
        agent_id: agent.id,
        trigger_data: triggerData,
        action_taken: rule.action_type,
        action_result: result,
        status,
        executed_at: status === 'executed' ? new Date().toISOString() : null,
      });
    }
  }

  return executions;
}

// ── Per-Tenant Evaluation Helper ──

async function evaluateForTenant(
  supabase: any,
  tenantId: string
): Promise<{ evaluated: number; triggered: number }> {
  const { data: rules } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (!rules || rules.length === 0) return { evaluated: 0, triggered: 0 };

  const { data: agents } = await supabase
    .from('agents')
    .select('id, agent_name, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (!agents || agents.length === 0) return { evaluated: 0, triggered: 0 };

  const agentIds = agents.map((a: any) => a.id);

  const { data: metrics } = await supabase
    .from('agent_system_metrics')
    .select('*')
    .in('agent_id', agentIds)
    .order('collected_at', { ascending: false });

  const latestMetrics = new Map<string, any>();
  (metrics || []).forEach((m: any) => {
    if (!latestMetrics.has(m.agent_id)) {
      latestMetrics.set(m.agent_id, m);
    }
  });

  let totalTriggered = 0;
  const allExecutions: any[] = [];

  for (const rule of rules) {
    if (isInCooldown(rule)) continue;

    let ruleExecutions: any[] = [];

    if (rule.trigger_type === 'metric_threshold') {
      ruleExecutions = await evaluateMetricThreshold(supabase, rule, tenantId, agents, latestMetrics);
    } else if (rule.trigger_type === 'process_anomaly' || rule.trigger_type === 'anomaly_detection') {
      ruleExecutions = await evaluateProcessAnomaly(supabase, rule, tenantId, agents);
    } else if (rule.trigger_type === 'agent_status') {
      ruleExecutions = await evaluateAgentStatus(supabase, rule, tenantId, agents);
    }

    allExecutions.push(...ruleExecutions);
    totalTriggered += ruleExecutions.length;
  }

  if (allExecutions.length > 0) {
    await supabase.from('automation_executions').insert(allExecutions);

    const triggeredRuleIds = [...new Set(allExecutions.map((e: any) => e.rule_id))];
    for (const ruleId of triggeredRuleIds) {
      const rule = rules.find((r: any) => r.id === ruleId);
      await supabase
        .from('automation_rules')
        .update({
          last_triggered_at: new Date().toISOString(),
          trigger_count: (rule?.trigger_count || 0) + 1,
        })
        .eq('id', ruleId);
    }
  }

  return { evaluated: rules.length, triggered: totalTriggered };
}

// ── Main Handler ──

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return secureCorsPreflightResponse();
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth check: requires authenticated user or service_role
    const authHeader = req.headers.get('authorization');
    let tenantId: string | null = null;
    let isServiceRole = false;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      // Check if service_role key (internal call) - compare raw token
      if (token === supabaseServiceKey) {
        isServiceRole = true;
        // Internal call — tenant_id comes from body or auto-discover
      } else {
        // Try to decode JWT to check role
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload.role === 'service_role') {
            isServiceRole = true;
          }
        } catch { /* not a JWT, try as user token */ }

        if (!isServiceRole) {
          const { data: { user }, error: authError } = await supabase.auth.getUser(token);
          if (authError || !user) {
            return secureErrorResponse('Unauthorized', 401);
          }

          const { data: roleData } = await supabase
            .from('user_roles')
            .select('tenant_id, role')
            .eq('user_id', user.id)
            .in('role', ['admin', 'super_admin'])
            .limit(1)
            .maybeSingle();

          if (!roleData) {
            return secureErrorResponse('Admin access required', 403);
          }
          tenantId = roleData.tenant_id;
        }
      }
    }

    const body = req.method === 'POST' ? await req.json() : {};
    tenantId = tenantId || body.tenant_id;

    // Auto-discover tenants when called from cron (service_role, no tenant_id)
    if (!tenantId && isServiceRole) {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id')
        .limit(50);

      if (!tenants || tenants.length === 0) {
        return secureJsonResponse({ message: 'No tenants found' });
      }

      let totalEvaluated = 0;
      let totalTriggered = 0;

      for (const t of tenants) {
        const result = await evaluateForTenant(supabase, t.id);
        totalEvaluated += result.evaluated;
        totalTriggered += result.triggered;
      }

      // Update cron health
      const isCronCall = req.headers.get('x-cron-source') === 'true';
      if (isCronCall) {
        try {
          await supabase.rpc('update_cron_health', {
            p_cron_name: 'evaluate-automation-rules-5min',
            p_success: true,
            p_details: { tenants: tenants.length, evaluated: totalEvaluated, triggered: totalTriggered },
          });
        } catch { /* best effort */ }
      }

      console.log(`Automation evaluation (multi-tenant): ${tenants.length} tenants, ${totalEvaluated} rules, ${totalTriggered} triggered`);

      return secureJsonResponse({
        tenants_processed: tenants.length,
        evaluated: totalEvaluated,
        triggered: totalTriggered,
      });
    }

    if (!tenantId) {
      return secureErrorResponse('tenant_id required', 400);
    }

    const result = await evaluateForTenant(supabase, tenantId);

    // Update cron health if called as cron
    const isCronCall = req.headers.get('x-cron-source') === 'true';
    if (isCronCall) {
      try {
        await supabase.rpc('update_cron_health', {
          p_cron_name: 'evaluate-automation-rules-5min',
          p_success: true,
          p_details: { evaluated: result.evaluated, triggered: result.triggered },
        });
      } catch { /* best effort */ }
    }

    console.log(`Automation evaluation: ${result.evaluated} rules, ${result.triggered} triggered for tenant ${tenantId}`);

    return secureJsonResponse({
      evaluated: result.evaluated,
      triggered: result.triggered,
    });

  } catch (error) {
    console.error('Error in evaluate-automation-rules:', error);
    return secureErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});
