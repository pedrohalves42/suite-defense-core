import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsSecurityHeaders, secureJsonResponse, secureErrorResponse, secureCorsPreflightResponse } from '../_shared/security-headers.ts';

/**
 * Evaluate Automation Rules — Enterprise-Grade Engine v2
 * 
 * Pipeline: Event → Rule Evaluator → Dependency Check → Risk Engine → Cooldown →
 *           Rate Limit → Blast Radius (Adaptive) → Circuit Breaker → Approval Gate →
 *           Distributed Lock → Idempotency Check → Execution → Audit + Risk Score
 *
 * v2 Additions:
 *   🔥 1. Rule Dependency Graph (anti-loop)
 *   🔥 2. Adaptive Blast Radius (severity + business hours)
 *   🔥 3. Tenant Risk Score (recalculated per cycle)
 *   🔥 4. Idempotency Keys (deduplication)
 *   🔥 5. Distributed Locking (advisory locks per rule)
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

/**
 * Generate a deterministic idempotency key for an agent+rule+time_window combination.
 * Window is 1 hour — same key means "already executed this hour".
 */
function generateIdempotencyKey(agentId: string, ruleId: string): string {
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  return `${ruleId}:${agentId}:${hourBucket}`;
}

// ── Enterprise Protection Pipeline ──

interface ProtectionResult {
  allowed: boolean;
  decision: string;
  reason: string;
}

/**
 * Layer 0: Rule Dependency Check (anti-loop)
 */
async function checkRuleDependencies(
  supabase: any, ruleId: string, tenantId: string
): Promise<ProtectionResult> {
  const { data } = await supabase.rpc('check_rule_dependencies', {
    p_rule_id: ruleId,
    p_tenant_id: tenantId,
  });

  if (data && data.length > 0) {
    const blocker = data[0];
    return {
      allowed: false,
      decision: 'blocked_dependency',
      reason: `Blocked by rule "${blocker.blocking_rule_name}" (${blocker.relationship}), executed recently`,
    };
  }
  return { allowed: true, decision: 'passed', reason: '' };
}

/**
 * Layer 1: Execution Cooldown (Debounce per agent+rule)
 */
async function checkExecutionCooldown(
  supabase: any, agentId: string, ruleId: string, cooldownMinutes: number
): Promise<ProtectionResult> {
  const { data } = await supabase
    .from('automation_execution_log')
    .select('id')
    .eq('agent_id', agentId)
    .eq('rule_id', ruleId)
    .gte('executed_at', new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString())
    .limit(1);

  if (data && data.length > 0) {
    return { allowed: false, decision: 'blocked_cooldown', reason: `Agent+Rule cooldown active (${cooldownMinutes}min)` };
  }
  return { allowed: true, decision: 'passed', reason: '' };
}

/**
 * Layer 2: Rate Limit per tenant+rule (max executions/hour)
 */
async function checkRateLimit(
  supabase: any, tenantId: string, ruleId: string, maxPerHour: number
): Promise<ProtectionResult> {
  const { count } = await supabase
    .from('automation_execution_log')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('rule_id', ruleId)
    .gte('executed_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if ((count || 0) >= maxPerHour) {
    return { allowed: false, decision: 'blocked_rate_limit', reason: `Rate limit reached: ${count}/${maxPerHour} per hour` };
  }
  return { allowed: true, decision: 'passed', reason: '' };
}

/**
 * Layer 3: Circuit Breaker (DB-backed via RPC)
 */
async function checkCircuitBreaker(
  supabase: any, rule: any
): Promise<ProtectionResult> {
  const { data } = await supabase.rpc('check_and_update_circuit_breaker', {
    p_rule_id: rule.id,
    p_threshold: rule.circuit_breaker_threshold || 10,
    p_window_minutes: rule.circuit_breaker_window_minutes || 5,
    p_recovery_minutes: rule.circuit_recovery_minutes || 15,
  });

  if (data && !data.allowed) {
    return { allowed: false, decision: 'blocked_circuit_breaker', reason: `Circuit breaker OPEN (${data.failures || 0} failures, recovery at ${data.recovery_at || 'unknown'})` };
  }
  return { allowed: true, decision: 'passed', reason: '' };
}

/**
 * Layer 4: Adaptive Blast Radius (severity + business hours via RPC)
 */
async function checkBlastRadius(
  supabase: any, rule: any, tenantId: string, totalAgents: number, severity?: string
): Promise<ProtectionResult> {
  if (totalAgents === 0) return { allowed: true, decision: 'passed', reason: '' };

  // Get adaptive limit from RPC (considers severity + business hours)
  let maxPercent = rule.max_affected_percentage || 30;
  try {
    const { data: adaptiveLimit } = await supabase.rpc('get_adaptive_blast_radius', {
      p_tenant_id: tenantId,
      p_action_type: rule.action_type || 'create_job',
      p_severity: severity || 'medium',
    });
    if (adaptiveLimit != null) {
      maxPercent = adaptiveLimit;
    }
  } catch {
    // Fallback to static limit
  }

  const { count } = await supabase
    .from('automation_execution_log')
    .select('agent_id', { count: 'exact', head: true })
    .eq('rule_id', rule.id)
    .eq('tenant_id', tenantId)
    .gte('executed_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

  const impactPercent = ((count || 0) / totalAgents) * 100;
  if (impactPercent >= maxPercent) {
    return { allowed: false, decision: 'blocked_blast_radius', reason: `Blast radius ${impactPercent.toFixed(1)}% >= adaptive limit ${maxPercent}% (severity: ${severity || 'medium'})` };
  }
  return { allowed: true, decision: 'passed', reason: '' };
}

/**
 * Layer 5: Idempotency Check (prevent duplicate execution in same window)
 */
async function checkIdempotency(
  supabase: any, idempotencyKey: string
): Promise<ProtectionResult> {
  const { data } = await supabase
    .from('automation_execution_log')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .limit(1);

  if (data && data.length > 0) {
    return { allowed: false, decision: 'blocked_idempotency', reason: `Duplicate execution prevented (key: ${idempotencyKey.substring(0, 20)}...)` };
  }
  return { allowed: true, decision: 'passed', reason: '' };
}

/**
 * Layer 6: Distributed Lock (advisory lock per rule)
 */
async function tryAcquireRuleLock(supabase: any, ruleId: string): Promise<boolean> {
  try {
    const { data } = await supabase.rpc('try_acquire_rule_lock', { p_rule_id: ruleId });
    return data === true;
  } catch {
    return true; // Fail open — don't block on lock failure
  }
}

/**
 * Run full protection pipeline for an agent+rule pair before execution.
 */
async function runProtectionPipeline(
  supabase: any, rule: any, agentId: string, tenantId: string, totalAgents: number, severity?: string
): Promise<ProtectionResult & { idempotencyKey?: string }> {
  // Mode check
  if (rule.mode === 'disabled') {
    return { allowed: false, decision: 'blocked_disabled', reason: 'Rule is disabled' };
  }

  // Layer 0: Dependency check
  const deps = await checkRuleDependencies(supabase, rule.id, tenantId);
  if (!deps.allowed) return deps;

  // Layer 1: Cooldown
  const cooldown = await checkExecutionCooldown(supabase, agentId, rule.id, rule.execution_cooldown_minutes || 60);
  if (!cooldown.allowed) return cooldown;

  // Layer 2: Rate limit
  const rateLimit = await checkRateLimit(supabase, tenantId, rule.id, rule.max_executions_per_hour || 50);
  if (!rateLimit.allowed) return rateLimit;

  // Layer 3: Circuit breaker
  const circuit = await checkCircuitBreaker(supabase, rule);
  if (!circuit.allowed) return circuit;

  // Layer 4: Adaptive blast radius
  const blast = await checkBlastRadius(supabase, rule, tenantId, totalAgents, severity);
  if (!blast.allowed) return blast;

  // Layer 5: Idempotency
  const idempotencyKey = generateIdempotencyKey(agentId, rule.id);
  const idemp = await checkIdempotency(supabase, idempotencyKey);
  if (!idemp.allowed) return idemp;

  // Approval gate
  if (rule.requires_approval) {
    return { allowed: false, decision: 'blocked_approval_required', reason: 'Requires human approval' };
  }

  // Shadow mode
  if (rule.mode === 'observe_only') {
    return { allowed: false, decision: 'observe_only', reason: 'Rule in observe-only mode' };
  }

  // Dry run
  if (rule.dry_run) {
    return { allowed: false, decision: 'dry_run', reason: 'Rule in dry-run mode' };
  }

  return { allowed: true, decision: 'passed', reason: '', idempotencyKey };
}

/**
 * Log a decision to the audit trail (append-only)
 */
async function logDecision(
  supabase: any,
  tenantId: string,
  rule: any,
  agentId: string | null,
  decision: string,
  reason: string,
  triggerData: any,
  executed: boolean,
  impactPercent?: number
) {
  try {
    await supabase.from('automation_decision_log').insert({
      tenant_id: tenantId,
      rule_id: rule.id,
      rule_name: rule.name,
      agent_id: agentId,
      decision,
      reason,
      severity: triggerData?.severity || null,
      executed,
      blocked_reason: executed ? null : reason,
      impact_percent: impactPercent || null,
      mode: rule.mode || 'active',
      trigger_data: triggerData,
    });
  } catch (e) {
    console.warn('[DecisionLog] Failed to log decision:', e);
  }
}

/**
 * Log execution to debounce table (with idempotency key)
 */
async function logExecution(
  supabase: any, tenantId: string, agentId: string, ruleId: string,
  actionType: string, success: boolean, idempotencyKey?: string, metadata?: any
) {
  try {
    await supabase.from('automation_execution_log').insert({
      tenant_id: tenantId,
      agent_id: agentId,
      rule_id: ruleId,
      action_type: actionType,
      success,
      idempotency_key: idempotencyKey || null,
      metadata,
    });
  } catch (e) {
    console.warn('[ExecLog] Failed:', e);
  }
}

/**
 * Create approval request instead of executing
 */
async function createApprovalRequest(
  supabase: any, tenantId: string, rule: any, agentId: string, triggerData: any
) {
  try {
    await supabase.from('automation_approvals').insert({
      tenant_id: tenantId,
      rule_id: rule.id,
      agent_id: agentId,
      trigger_data: triggerData,
      status: 'pending',
    });
  } catch (e) {
    console.warn('[Approval] Failed to create:', e);
  }
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

      // ── SOAR Bridge ──
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
              context: { ...triggerData, source: 'automation_rule', rule_id: rule.id,
                process_reputation: triggerData.event_type === 'suspicious_process' ? 'malicious' : undefined },
            }),
          });
        } catch (bridgeErr) {
          console.warn('[SOAR Bridge] Failed:', bridgeErr);
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

interface TriggerCandidate {
  agentId: string;
  triggerData: any;
}

async function evaluateMetricThreshold(
  supabase: any, rule: any, tenantId: string, agents: any[], latestMetrics: Map<string, any>
): Promise<TriggerCandidate[]> {
  const conditions = rule.trigger_conditions as any;
  const candidates: TriggerCandidate[] = [];

  for (const [agentId, m] of latestMetrics) {
    if (!matchesScope(rule, agentId)) continue;

    const metricMap: Record<string, number | null> = {
      'cpu_usage_percent': m.cpu_usage_percent,
      'cpu_percent': m.cpu_usage_percent,
      'memory_usage_percent': m.memory_usage_percent,
      'memory_percent': m.memory_usage_percent,
      'disk_usage_percent': m.disk_usage_percent,
      'disk_free_percent': m.disk_usage_percent != null ? 100 - m.disk_usage_percent : null,
    };

    const metricValue = metricMap[conditions.metric];
    if (metricValue === null || metricValue === undefined) continue;

    if (evaluateOperator(metricValue, conditions.operator, conditions.value)) {
      candidates.push({
        agentId,
        triggerData: {
          metric: conditions.metric,
          value: metricValue,
          threshold: conditions.value,
          severity: metricValue >= 95 ? 'critical' : metricValue >= 80 ? 'high' : 'medium',
          message: `${conditions.metric} = ${metricValue}% (threshold: ${conditions.operator} ${conditions.value}%)`,
        },
      });
    }
  }

  return candidates;
}

async function evaluateProcessAnomaly(
  supabase: any, rule: any, tenantId: string, agents: any[]
): Promise<TriggerCandidate[]> {
  const conditions = rule.trigger_conditions as any;
  const candidates: TriggerCandidate[] = [];
  const agentIds = agents.map((a: any) => a.id);

  const { data: processData } = await supabase
    .from('agent_processes')
    .select('agent_id, suspicious_processes, new_processes, total_processes, collected_at')
    .in('agent_id', agentIds)
    .order('collected_at', { ascending: false });

  const latestProcesses = new Map<string, any>();
  (processData || []).forEach((p: any) => {
    if (!latestProcesses.has(p.agent_id)) latestProcesses.set(p.agent_id, p);
  });

  for (const [agentId, p] of latestProcesses) {
    if (!matchesScope(rule, agentId)) continue;

    const eventType = conditions.eventType || conditions.event_type || 'suspicious_process';

    if (eventType === 'suspicious_process') {
      const suspiciousCount = (p.suspicious_processes || []).length;
      const threshold = conditions.value || 1;
      if (suspiciousCount >= threshold) {
        candidates.push({
          agentId,
          triggerData: {
            event_type: 'suspicious_process',
            count: suspiciousCount,
            threshold,
            severity: 'critical',
            processes: (p.suspicious_processes || []).slice(0, 5).map((sp: any) => sp.name),
            message: `${suspiciousCount} suspicious process(es) detected (threshold: ${threshold})`,
          },
        });
      }
    } else if (eventType === 'new_process_burst') {
      const newCount = (p.new_processes || []).length;
      const threshold = conditions.value || 10;
      if (newCount >= threshold) {
        candidates.push({
          agentId,
          triggerData: {
            event_type: 'new_process_burst',
            count: newCount,
            threshold,
            severity: 'high',
            message: `${newCount} new processes detected (threshold: ${threshold})`,
          },
        });
      }
    }
  }

  return candidates;
}

async function evaluateAgentStatus(
  supabase: any, rule: any, tenantId: string, agents: any[]
): Promise<TriggerCandidate[]> {
  const conditions = rule.trigger_conditions as any;
  const candidates: TriggerCandidate[] = [];
  const eventType = conditions.eventType || conditions.event_type || 'agent_offline';
  const durationMinutes = conditions.duration_minutes || 10;
  const thresholdMs = durationMinutes * 60 * 1000;

  const { data: allAgents } = await supabase
    .from('agents')
    .select('id, agent_name, status, last_heartbeat')
    .eq('tenant_id', tenantId);

  if (!allAgents) return candidates;

  for (const agent of allAgents) {
    if (!matchesScope(rule, agent.id)) continue;

    if (eventType === 'agent_offline') {
      const lastHb = agent.last_heartbeat ? new Date(agent.last_heartbeat).getTime() : 0;
      const offlineDuration = Date.now() - lastHb;
      if (offlineDuration > thresholdMs && agent.status !== 'archived') {
        const offlineMin = Math.round(offlineDuration / 60000);
        candidates.push({
          agentId: agent.id,
          triggerData: {
            event_type: 'agent_offline',
            agent_name: agent.agent_name,
            offline_minutes: offlineMin,
            threshold_minutes: durationMinutes,
            severity: offlineMin > 120 ? 'critical' : offlineMin > 60 ? 'high' : 'medium',
            message: `Agent '${agent.agent_name}' offline for ${offlineMin} min (threshold: ${durationMinutes} min)`,
          },
        });
      }
    }
  }

  return candidates;
}

async function evaluateSecurityCheck(
  supabase: any, rule: any, tenantId: string, agents: any[]
): Promise<TriggerCandidate[]> {
  const conditions = rule.trigger_conditions as any;
  const candidates: TriggerCandidate[] = [];
  const checkType = conditions.check;
  const agentIds = agents.map((a: any) => a.id);

  if (checkType === 'no_antivirus_detected' || checkType === 'antivirus_inactive') {
    const { data: avData } = await supabase
      .from('antivirus_status')
      .select('agent_id, engine_name, status, last_update_at')
      .in('agent_id', agentIds)
      .order('collected_at', { ascending: false });

    const latestAv = new Map<string, any>();
    (avData || []).forEach((av: any) => {
      if (!latestAv.has(av.agent_id)) latestAv.set(av.agent_id, av);
    });

    for (const agent of agents) {
      if (!matchesScope(rule, agent.id)) continue;
      const av = latestAv.get(agent.id);
      const isInactive = !av || av.status === 'inactive' || av.status === 'disabled';
      if (isInactive) {
        candidates.push({
          agentId: agent.id,
          triggerData: {
            event_type: 'antivirus_inactive',
            check: checkType,
            agent_name: agent.agent_name,
            av_engine: av?.engine_name || 'none',
            severity: 'critical',
            message: `Antivírus ${av ? 'inativo' : 'não detectado'} no agente '${agent.agent_name}'`,
          },
        });
      }
    }
  } else if (checkType === 'firewall_disabled') {
    const recentWindow = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: fwEvidence } = await supabase
      .from('agent_evidence_logs')
      .select('agent_id, agent_name, event_type, event_data')
      .eq('tenant_id', tenantId)
      .in('agent_id', agentIds)
      .in('event_type', ['firewall_disabled', 'firewall_off', 'security_config_change'])
      .gte('created_at', recentWindow);

    const { data: fwAlerts } = await supabase
      .from('system_alerts')
      .select('agent_id, title, details')
      .eq('tenant_id', tenantId)
      .in('alert_type', ['security_threat', 'firewall_disabled'])
      .eq('resolved', false)
      .in('agent_id', agentIds)
      .ilike('title', '%firewall%');

    const affectedAgents = new Set<string>();
    (fwEvidence || []).forEach((e: any) => affectedAgents.add(e.agent_id));
    (fwAlerts || []).forEach((a: any) => affectedAgents.add(a.agent_id));

    for (const agentId of affectedAgents) {
      if (!matchesScope(rule, agentId)) continue;
      const agent = agents.find((a: any) => a.id === agentId);
      candidates.push({
        agentId,
        triggerData: {
          event_type: 'firewall_disabled',
          check: checkType,
          agent_name: agent?.agent_name || 'Unknown',
          severity: 'high',
          message: `Firewall desabilitado no agente '${agent?.agent_name}'`,
        },
      });
    }
  } else if (checkType === 'unauthorized_usb') {
    const { data: usbDevices } = await supabase
      .from('agent_usb_devices')
      .select('id, agent_id, device_id, device_type, vendor_id, is_blocked, device_name')
      .in('agent_id', agentIds)
      .eq('is_blocked', false);

    for (const usb of (usbDevices || [])) {
      if (!matchesScope(rule, usb.agent_id)) continue;
      const agent = agents.find((a: any) => a.id === usb.agent_id);
      candidates.push({
        agentId: usb.agent_id,
        triggerData: {
          event_type: 'unauthorized_usb',
          check: checkType,
          agent_name: agent?.agent_name || 'Unknown',
          device_id: usb.device_id,
          device_name: usb.device_name,
          severity: 'high',
          message: `USB não autorizado (${usb.device_name || usb.device_id}) no agente '${agent?.agent_name}'`,
        },
      });
    }
  } else if (checkType === 'vulnerable_software') {
    const { data: vulns } = await supabase
      .from('vuln_findings')
      .select('id, agent_id, check_key, title, severity')
      .in('agent_id', agentIds)
      .in('severity', ['critical', 'high'])
      .is('acknowledged_at', null)
      .limit(50);

    const agentVulns = new Map<string, any[]>();
    (vulns || []).forEach((v: any) => {
      if (!agentVulns.has(v.agent_id)) agentVulns.set(v.agent_id, []);
      agentVulns.get(v.agent_id)!.push(v);
    });

    for (const [agentId, agentVulnList] of agentVulns) {
      if (!matchesScope(rule, agentId)) continue;
      const agent = agents.find((a: any) => a.id === agentId);
      candidates.push({
        agentId,
        triggerData: {
          event_type: 'vulnerable_software',
          check: checkType,
          agent_name: agent?.agent_name || 'Unknown',
          vuln_count: agentVulnList.length,
          top_vulns: agentVulnList.slice(0, 3).map((v: any) => v.title),
          severity: 'critical',
          message: `${agentVulnList.length} vulnerabilidade(s) crítica(s) no agente '${agent?.agent_name}'`,
        },
      });
    }
  }

  return candidates;
}

// ── Per-Tenant Evaluation with Enterprise Pipeline v2 ──

async function evaluateForTenant(
  supabase: any,
  tenantId: string
): Promise<{ evaluated: number; triggered: number; blocked: number; decisions: number; risk_score?: number }> {
  const { data: rules } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (!rules || rules.length === 0) return { evaluated: 0, triggered: 0, blocked: 0, decisions: 0 };

  const { data: agents } = await supabase
    .from('agents')
    .select('id, agent_name, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (!agents || agents.length === 0) return { evaluated: 0, triggered: 0, blocked: 0, decisions: 0 };

  const totalAgents = agents.length;
  const agentIds = agents.map((a: any) => a.id);

  // ─── P0: GLOBAL CIRCUIT BREAKER ───
  // Check fleet-wide impact before processing any rules
  try {
    const { data: globalBreaker } = await supabase.rpc('check_global_circuit_breaker', {
      p_tenant_id: tenantId,
      p_max_impact_percent: 30,
      p_window_minutes: 10,
    });
    if (globalBreaker && !globalBreaker.allowed) {
      console.warn(`[Enterprise Engine v2] GLOBAL CIRCUIT BREAKER OPEN for tenant ${tenantId}: ${globalBreaker.reason || 'Impact threshold exceeded'} (${globalBreaker.impact_percent}%)`);
      return { evaluated: 0, triggered: 0, blocked: rules.length, decisions: 1, risk_score: undefined };
    }
  } catch (e) {
    console.warn('[Enterprise Engine v2] Global circuit breaker check failed (fail-open):', e);
  }

  // ─── P0: TENANT DAILY QUOTA ───
  try {
    const { data: quota } = await supabase.rpc('check_tenant_automation_quota', { p_tenant_id: tenantId });
    if (quota && !quota.allowed) {
      console.warn(`[Enterprise Engine v2] TENANT QUOTA EXHAUSTED for ${tenantId}: ${quota.current}/${quota.max}`);
      return { evaluated: 0, triggered: 0, blocked: rules.length, decisions: 1, risk_score: undefined };
    }
  } catch (e) {
    console.warn('[Enterprise Engine v2] Tenant quota check failed (fail-open):', e);
  }

  const { data: metrics } = await supabase
    .from('agent_system_metrics_partitioned')
    .select('*')
    .in('agent_id', agentIds)
    .order('collected_at', { ascending: false });

  const latestMetrics = new Map<string, any>();
  (metrics || []).forEach((m: any) => {
    if (!latestMetrics.has(m.agent_id)) latestMetrics.set(m.agent_id, m);
  });

  let totalTriggered = 0;
  let totalBlocked = 0;
  let totalDecisions = 0;
  const allExecutions: any[] = [];

  for (const rule of rules) {
    // Global cooldown check (rule-level)
    if (isInCooldown(rule)) {
      totalDecisions++;
      await logDecision(supabase, tenantId, rule, null, 'blocked_cooldown', 'Rule-level cooldown active', null, false);
      continue;
    }

    // Mode: disabled
    if (rule.mode === 'disabled') {
      totalDecisions++;
      await logDecision(supabase, tenantId, rule, null, 'blocked_disabled', 'Rule disabled', null, false);
      continue;
    }

    // 🔥 Layer 6: Distributed Lock — one evaluator per rule at a time
    const lockAcquired = await tryAcquireRuleLock(supabase, rule.id);
    if (!lockAcquired) {
      totalDecisions++;
      await logDecision(supabase, tenantId, rule, null, 'blocked_lock', 'Rule locked by another instance', null, false);
      continue;
    }

    // Get trigger candidates
    let candidates: TriggerCandidate[] = [];

    if (rule.trigger_type === 'metric_threshold') {
      candidates = await evaluateMetricThreshold(supabase, rule, tenantId, agents, latestMetrics);
    } else if (rule.trigger_type === 'process_anomaly' || rule.trigger_type === 'anomaly_detection') {
      candidates = await evaluateProcessAnomaly(supabase, rule, tenantId, agents);
    } else if (rule.trigger_type === 'agent_status') {
      candidates = await evaluateAgentStatus(supabase, rule, tenantId, agents);
    } else if (rule.trigger_type === 'security_check') {
      candidates = await evaluateSecurityCheck(supabase, rule, tenantId, agents);
    }

    // Run each candidate through the protection pipeline
    for (const candidate of candidates) {
      totalDecisions++;

      const protection = await runProtectionPipeline(
        supabase, rule, candidate.agentId, tenantId, totalAgents,
        candidate.triggerData?.severity
      );

      if (!protection.allowed) {
        totalBlocked++;

        await logDecision(
          supabase, tenantId, rule, candidate.agentId,
          protection.decision, protection.reason,
          candidate.triggerData, false
        );

        if (protection.decision === 'blocked_approval_required') {
          await createApprovalRequest(supabase, tenantId, rule, candidate.agentId, candidate.triggerData);
        }

        continue;
      }

      // ─── EXECUTE ACTION ───
      const startTime = Date.now();
      const { status, result } = await executeAction(supabase, rule, candidate.agentId, tenantId, candidate.triggerData, agents);
      const execTimeMs = Date.now() - startTime;

      const success = status === 'executed';

      // P0: Increment tenant daily quota counter on execution
      if (success) {
        try { await supabase.rpc('increment_tenant_quota', { p_tenant_id: tenantId }); } catch { /* non-critical */ }
      }

      // Log to debounce table with idempotency key
      await logExecution(supabase, tenantId, candidate.agentId, rule.id, rule.action_type, success, protection.idempotencyKey, {
        ...result,
        execution_time_ms: execTimeMs,
      });

      // Log to decision audit
      await logDecision(
        supabase, tenantId, rule, candidate.agentId,
        'executed', `Action ${rule.action_type} ${status}`,
        candidate.triggerData, true
      );

      allExecutions.push({
        tenant_id: tenantId,
        rule_id: rule.id,
        agent_id: candidate.agentId,
        trigger_data: candidate.triggerData,
        action_taken: rule.action_type,
        action_result: result,
        status,
        error_message: status === 'failed' ? (result?.error || 'Unknown error') : null,
        executed_at: status === 'executed' ? new Date().toISOString() : null,
      });

      totalTriggered++;
    }
  }

  // Batch insert executions
  if (allExecutions.length > 0) {
    await supabase.from('automation_executions').insert(allExecutions);

    // Update rule trigger metadata
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

  // 🔥 Recalculate tenant risk score at end of cycle
  let riskScore: number | undefined;
  try {
    const { data: score } = await supabase.rpc('recalculate_tenant_risk_score', { p_tenant_id: tenantId });
    riskScore = score;
  } catch {
    // Non-critical
  }

  return { evaluated: rules.length, triggered: totalTriggered, blocked: totalBlocked, decisions: totalDecisions, risk_score: riskScore };
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

    // Auth check
    const authHeader = req.headers.get('authorization');
    let tenantId: string | null = null;
    let isServiceRole = false;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      if (token === supabaseServiceKey) {
        isServiceRole = true;
      } else {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload.role === 'service_role') isServiceRole = true;
        } catch (e) { console.warn('[evaluate-automation-rules] JWT parse failed:', e); }

        if (!isServiceRole) {
          const { data: { user }, error: authError } = await supabase.auth.getUser(token);
          if (authError || !user) return secureErrorResponse('Unauthorized', 401);

          const { data: roleData } = await supabase
            .from('user_roles')
            .select('tenant_id, role')
            .eq('user_id', user.id)
            .in('role', ['admin', 'super_admin'])
            .limit(1)
            .maybeSingle();

          if (!roleData) return secureErrorResponse('Admin access required', 403);
          tenantId = roleData.tenant_id;
        }
      }
    }

    const body = req.method === 'POST' ? await req.json() : {};
    tenantId = tenantId || body.tenant_id;

    // Auto-discover tenants for cron (service_role)
    if (!tenantId && isServiceRole) {
      const { data: tenants } = await supabase.from('tenants').select('id').limit(50);

      if (!tenants || tenants.length === 0) {
        return secureJsonResponse({ message: 'No tenants found' });
      }

      let totalEvaluated = 0, totalTriggered = 0, totalBlocked = 0, totalDecisions = 0;
      const riskScores: Record<string, number> = {};

      for (const t of tenants) {
        const result = await evaluateForTenant(supabase, t.id);
        totalEvaluated += result.evaluated;
        totalTriggered += result.triggered;
        totalBlocked += result.blocked;
        totalDecisions += result.decisions;
        if (result.risk_score != null) riskScores[t.id] = result.risk_score;
      }

      // Update cron health
      if (req.headers.get('x-cron-source') === 'true') {
        try {
          await supabase.rpc('update_cron_health', {
            p_cron_name: 'evaluate-automation-rules-5min',
            p_success: true,
            p_details: { tenants: tenants.length, evaluated: totalEvaluated, triggered: totalTriggered, blocked: totalBlocked, decisions: totalDecisions },
          });
        } catch (e) { console.warn('[evaluate-automation-rules] Failed to update cron health:', e); }
      }

      console.log(`[Enterprise Engine v2] ${tenants.length} tenants | ${totalEvaluated} rules | ${totalTriggered} triggered | ${totalBlocked} blocked | ${totalDecisions} decisions`);

      return secureJsonResponse({
        tenants_processed: tenants.length,
        evaluated: totalEvaluated,
        triggered: totalTriggered,
        blocked: totalBlocked,
        decisions: totalDecisions,
        risk_scores: riskScores,
      });
    }

    if (!tenantId) return secureErrorResponse('tenant_id required', 400);

    const result = await evaluateForTenant(supabase, tenantId);

    if (req.headers.get('x-cron-source') === 'true') {
      try {
        await supabase.rpc('update_cron_health', {
          p_cron_name: 'evaluate-automation-rules-5min',
          p_success: true,
          p_details: result,
        });
      } catch (e) { console.warn('[evaluate-automation-rules] cron health update failed:', e); }
    }

    console.log(`[Enterprise Engine v2] tenant=${tenantId} | ${result.evaluated} rules | ${result.triggered} triggered | ${result.blocked} blocked | ${result.decisions} decisions | risk=${result.risk_score ?? 'n/a'}`);

    return secureJsonResponse(result);

  } catch (error) {
    console.error('Error in evaluate-automation-rules:', error);
    return secureErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});
