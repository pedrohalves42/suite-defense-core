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
          const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') || '';
          await fetch(`${supabaseUrl}/functions/v1/evaluate-playbook-triggers`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Secret': internalSecret,
            },
            body: JSON.stringify({
              tenant_id: tenantId,
              trigger_type: playbookTrigger,
              agent_id: agentId,
              context: { 
                ...triggerData, 
                source: 'automation_rule', 
                rule_id: rule.id,
                // Enrich context for playbook condition matching
                process_reputation: triggerData.event_type === 'suspicious_process' ? 'malicious' : undefined,
              },
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
        error_message: status === 'failed' ? (result?.error || 'Unknown error') : null,
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
        error_message: status === 'failed' ? (result?.error || 'Unknown error') : null,
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
        error_message: status === 'failed' ? (result?.error || 'Unknown error') : null,
        executed_at: status === 'executed' ? new Date().toISOString() : null,
      });
    }
  }

  return executions;
}

// ── Security Check Evaluator ──

async function evaluateSecurityCheck(
  supabase: any,
  rule: any,
  tenantId: string,
  agents: any[]
): Promise<any[]> {
  const conditions = rule.trigger_conditions as any;
  const executions: any[] = [];
  const checkType = conditions.check;
  const agentIds = agents.map((a: any) => a.id);

  if (checkType === 'no_antivirus_detected' || checkType === 'antivirus_inactive') {
    // Check antivirus_status for agents with inactive/missing AV
    const { data: avData } = await supabase
      .from('antivirus_status')
      .select('agent_id, engine_name, status, last_update_at')
      .in('agent_id', agentIds)
      .order('collected_at', { ascending: false });

    const latestAv = new Map<string, any>();
    (avData || []).forEach((av: any) => {
      if (!latestAv.has(av.agent_id)) latestAv.set(av.agent_id, av);
    });

    // Agents without AV data or with inactive status
    for (const agent of agents) {
      if (!matchesScope(rule, agent.id)) continue;
      const av = latestAv.get(agent.id);
      const isInactive = !av || av.status === 'inactive' || av.status === 'disabled';
      
      if (isInactive) {
        const triggerData = {
          event_type: 'antivirus_inactive',
          check: checkType,
          agent_name: agent.agent_name,
          av_engine: av?.engine_name || 'none',
          message: `Antivírus ${av ? 'inativo' : 'não detectado'} no agente '${agent.agent_name}'`,
        };
        const { status, result } = await executeAction(supabase, rule, agent.id, tenantId, triggerData, agents);
        executions.push({
          tenant_id: tenantId, rule_id: rule.id, agent_id: agent.id,
          trigger_data: triggerData, action_taken: rule.action_type,
          action_result: result, status,
          error_message: status === 'failed' ? (result?.error || 'Unknown error') : null,
          executed_at: status === 'executed' ? new Date().toISOString() : null,
        });
      }
    }
  } else if (checkType === 'firewall_disabled') {
    // Check agent_evidence_logs for firewall-disabled events (agents report these directly)
    // Also check system_alerts with security_threat type mentioning firewall
    const recentWindow = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: fwEvidence } = await supabase
      .from('agent_evidence_logs')
      .select('agent_id, agent_name, event_type, event_data')
      .eq('tenant_id', tenantId)
      .in('agent_id', agentIds)
      .in('event_type', ['firewall_disabled', 'firewall_off', 'security_config_change'])
      .gte('created_at', recentWindow);

    // Also check unresolved security_threat alerts mentioning firewall
    const { data: fwAlerts } = await supabase
      .from('system_alerts')
      .select('agent_id, title, details')
      .eq('tenant_id', tenantId)
      .in('alert_type', ['security_threat', 'firewall_disabled'])
      .eq('resolved', false)
      .in('agent_id', agentIds)
      .ilike('title', '%firewall%');

    // Merge unique agent IDs from both sources
    const affectedAgents = new Set<string>();
    (fwEvidence || []).forEach((e: any) => affectedAgents.add(e.agent_id));
    (fwAlerts || []).forEach((a: any) => affectedAgents.add(a.agent_id));

    for (const agentId of affectedAgents) {
      if (!matchesScope(rule, agentId)) continue;
      const agent = agents.find((a: any) => a.id === agentId);
      const triggerData = {
        event_type: 'firewall_disabled',
        check: checkType,
        agent_name: agent?.agent_name || 'Unknown',
        message: `Firewall desabilitado no agente '${agent?.agent_name}'`,
      };
      const { status, result } = await executeAction(supabase, rule, agentId, tenantId, triggerData, agents);
      executions.push({
        tenant_id: tenantId, rule_id: rule.id, agent_id: agentId,
        trigger_data: triggerData, action_taken: rule.action_type,
        action_result: result, status,
        error_message: status === 'failed' ? (result?.error || 'Unknown error') : null,
        executed_at: status === 'executed' ? new Date().toISOString() : null,
      });
    }
  } else if (checkType === 'unauthorized_usb') {
    // Check agent_usb_devices for unblocked devices
    const { data: usbDevices } = await supabase
      .from('agent_usb_devices')
      .select('id, agent_id, device_id, device_type, vendor_id, is_blocked, device_name')
      .in('agent_id', agentIds)
      .eq('is_blocked', false);

    for (const usb of (usbDevices || [])) {
      if (!matchesScope(rule, usb.agent_id)) continue;
      const agent = agents.find((a: any) => a.id === usb.agent_id);
      const triggerData = {
        event_type: 'unauthorized_usb',
        check: checkType,
        agent_name: agent?.agent_name || 'Unknown',
        device_id: usb.device_id,
        device_name: usb.device_name,
        message: `USB não autorizado (${usb.device_name || usb.device_id}) no agente '${agent?.agent_name}'`,
      };
      const { status, result } = await executeAction(supabase, rule, usb.agent_id, tenantId, triggerData, agents);
      executions.push({
        tenant_id: tenantId, rule_id: rule.id, agent_id: usb.agent_id,
        trigger_data: triggerData, action_taken: rule.action_type,
        action_result: result, status,
        error_message: status === 'failed' ? (result?.error || 'Unknown error') : null,
        executed_at: status === 'executed' ? new Date().toISOString() : null,
      });
    }
  } else if (checkType === 'vulnerable_software') {
    // Check vuln_findings for critical unresolved vulnerabilities
    const minCvss = conditions.min_cvss || 7.0;
    const { data: vulns } = await supabase
      .from('vuln_findings')
      .select('id, agent_id, check_key, title, severity')
      .in('agent_id', agentIds)
      .in('severity', ['critical', 'high'])
      .is('acknowledged_at', null)
      .limit(50);

    // Deduplicate by agent
    const agentVulns = new Map<string, any[]>();
    (vulns || []).forEach((v: any) => {
      if (!agentVulns.has(v.agent_id)) agentVulns.set(v.agent_id, []);
      agentVulns.get(v.agent_id)!.push(v);
    });

    for (const [agentId, agentVulnList] of agentVulns) {
      if (!matchesScope(rule, agentId)) continue;
      const agent = agents.find((a: any) => a.id === agentId);
      const triggerData = {
        event_type: 'vulnerable_software',
        check: checkType,
        agent_name: agent?.agent_name || 'Unknown',
        vuln_count: agentVulnList.length,
        top_vulns: agentVulnList.slice(0, 3).map((v: any) => v.title),
        message: `${agentVulnList.length} vulnerabilidade(s) crítica(s) no agente '${agent?.agent_name}'`,
      };
      const { status, result } = await executeAction(supabase, rule, agentId, tenantId, triggerData, agents);
      executions.push({
        tenant_id: tenantId, rule_id: rule.id, agent_id: agentId,
        trigger_data: triggerData, action_taken: rule.action_type,
        action_result: result, status,
        error_message: status === 'failed' ? (result?.error || 'Unknown error') : null,
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
      .from('agent_system_metrics_partitioned')
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
    } else if (rule.trigger_type === 'security_check') {
      ruleExecutions = await evaluateSecurityCheck(supabase, rule, tenantId, agents);
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
