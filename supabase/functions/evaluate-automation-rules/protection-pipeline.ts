/**
 * Enterprise Protection Pipeline — Layers 0-6
 */
import { logger } from '../_shared/logger.ts';
import { generateIdempotencyKey } from './helpers.ts';

interface ProtectionResult {
  allowed: boolean;
  decision: string;
  reason: string;
  idempotencyKey?: string;
}

async function checkRuleDependencies(supabase: any, ruleId: string, tenantId: string): Promise<ProtectionResult> {
  const { data } = await supabase.rpc('check_rule_dependencies', { p_rule_id: ruleId, p_tenant_id: tenantId });
  if (data && data.length > 0) {
    const blocker = data[0];
    return { allowed: false, decision: 'blocked_dependency', reason: `Blocked by rule "${blocker.blocking_rule_name}" (${blocker.relationship}), executed recently` };
  }
  return { allowed: true, decision: 'passed', reason: '' };
}

async function checkExecutionCooldown(supabase: any, agentId: string, ruleId: string, cooldownMinutes: number): Promise<ProtectionResult> {
  const { data } = await supabase
    .from('automation_execution_log').select('id')
    .eq('agent_id', agentId).eq('rule_id', ruleId)
    .gte('executed_at', new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString())
    .limit(1);
  if (data && data.length > 0) return { allowed: false, decision: 'blocked_cooldown', reason: `Agent+Rule cooldown active (${cooldownMinutes}min)` };
  return { allowed: true, decision: 'passed', reason: '' };
}

async function checkRateLimit(supabase: any, tenantId: string, ruleId: string, maxPerHour: number): Promise<ProtectionResult> {
  const { count } = await supabase
    .from('automation_execution_log').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('rule_id', ruleId)
    .gte('executed_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if ((count || 0) >= maxPerHour) return { allowed: false, decision: 'blocked_rate_limit', reason: `Rate limit reached: ${count}/${maxPerHour} per hour` };
  return { allowed: true, decision: 'passed', reason: '' };
}

async function checkCircuitBreaker(supabase: any, rule: any): Promise<ProtectionResult> {
  const { data } = await supabase.rpc('check_and_update_circuit_breaker', {
    p_rule_id: rule.id,
    p_threshold: rule.circuit_breaker_threshold || 10,
    p_window_minutes: rule.circuit_breaker_window_minutes || 5,
    p_recovery_minutes: rule.circuit_recovery_minutes || 15,
  });
  if (data && !data.allowed) return { allowed: false, decision: 'blocked_circuit_breaker', reason: `Circuit breaker OPEN (${data.failures || 0} failures)` };
  return { allowed: true, decision: 'passed', reason: '' };
}

async function checkBlastRadius(supabase: any, rule: any, tenantId: string, totalAgents: number, severity?: string): Promise<ProtectionResult> {
  if (totalAgents === 0) return { allowed: true, decision: 'passed', reason: '' };
  let maxPercent = rule.max_affected_percentage || 30;
  try {
    const { data: adaptiveLimit } = await supabase.rpc('get_adaptive_blast_radius', { p_tenant_id: tenantId, p_action_type: rule.action_type || 'create_job', p_severity: severity || 'medium' });
    if (adaptiveLimit != null) maxPercent = adaptiveLimit;
  } catch { /* fallback */ }

  const { count } = await supabase
    .from('automation_execution_log').select('agent_id', { count: 'exact', head: true })
    .eq('rule_id', rule.id).eq('tenant_id', tenantId)
    .gte('executed_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

  const impactPercent = ((count || 0) / totalAgents) * 100;
  if (impactPercent >= maxPercent) return { allowed: false, decision: 'blocked_blast_radius', reason: `Blast radius ${impactPercent.toFixed(1)}% >= adaptive limit ${maxPercent}%` };
  return { allowed: true, decision: 'passed', reason: '' };
}

async function checkIdempotency(supabase: any, idempotencyKey: string): Promise<ProtectionResult> {
  const { data } = await supabase
    .from('automation_execution_log').select('id')
    .eq('idempotency_key', idempotencyKey).limit(1);
  if (data && data.length > 0) return { allowed: false, decision: 'blocked_idempotency', reason: `Duplicate execution prevented` };
  return { allowed: true, decision: 'passed', reason: '' };
}

export async function tryAcquireRuleLock(supabase: any, ruleId: string): Promise<boolean> {
  try {
    const { data } = await supabase.rpc('try_acquire_rule_lock', { p_rule_id: ruleId });
    return data === true;
  } catch { return true; }
}

export async function runProtectionPipeline(
  supabase: any, rule: any, agentId: string, tenantId: string, totalAgents: number, severity?: string
): Promise<ProtectionResult> {
  if (rule.mode === 'disabled') return { allowed: false, decision: 'blocked_disabled', reason: 'Rule is disabled' };

  const deps = await checkRuleDependencies(supabase, rule.id, tenantId);
  if (!deps.allowed) return deps;

  const cooldown = await checkExecutionCooldown(supabase, agentId, rule.id, rule.execution_cooldown_minutes || 60);
  if (!cooldown.allowed) return cooldown;

  const rateLimit = await checkRateLimit(supabase, tenantId, rule.id, rule.max_executions_per_hour || 50);
  if (!rateLimit.allowed) return rateLimit;

  const circuit = await checkCircuitBreaker(supabase, rule);
  if (!circuit.allowed) return circuit;

  const blast = await checkBlastRadius(supabase, rule, tenantId, totalAgents, severity);
  if (!blast.allowed) return blast;

  const idempotencyKey = generateIdempotencyKey(agentId, rule.id);
  const idemp = await checkIdempotency(supabase, idempotencyKey);
  if (!idemp.allowed) return idemp;

  if (rule.requires_approval) return { allowed: false, decision: 'blocked_approval_required', reason: 'Requires human approval' };
  if (rule.mode === 'observe_only') return { allowed: false, decision: 'observe_only', reason: 'Rule in observe-only mode' };
  if (rule.dry_run) return { allowed: false, decision: 'dry_run', reason: 'Rule in dry-run mode' };

  return { allowed: true, decision: 'passed', reason: '', idempotencyKey };
}

export async function logDecision(supabase: any, tenantId: string, rule: any, agentId: string | null, decision: string, reason: string, triggerData: any, executed: boolean) {
  try {
    await supabase.from('automation_decision_log').insert({
      tenant_id: tenantId, rule_id: rule.id, rule_name: rule.name, agent_id: agentId,
      decision, reason, severity: triggerData?.severity || null, executed,
      blocked_reason: executed ? null : reason, mode: rule.mode || 'active', trigger_data: triggerData,
    });
  } catch (e) { logger.warn('[DecisionLog] Failed:', e); }
}

export async function logExecution(supabase: any, tenantId: string, agentId: string, ruleId: string, actionType: string, success: boolean, idempotencyKey?: string, metadata?: any) {
  try {
    await supabase.from('automation_execution_log').insert({
      tenant_id: tenantId, agent_id: agentId, rule_id: ruleId, action_type: actionType, success, idempotency_key: idempotencyKey || null, metadata,
    });
  } catch (e) { logger.warn('[ExecLog] Failed:', e); }
}

export async function createApprovalRequest(supabase: any, tenantId: string, rule: any, agentId: string, triggerData: any) {
  try {
    await supabase.from('automation_approvals').insert({ tenant_id: tenantId, rule_id: rule.id, agent_id: agentId, trigger_data: triggerData, status: 'pending' });
  } catch (e) { logger.warn('[Approval] Failed:', e); }
}
