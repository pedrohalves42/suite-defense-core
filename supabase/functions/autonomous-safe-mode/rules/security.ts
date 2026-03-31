/**
 * Security rules: AGENT_ISOLATE_003, UPDATE_BLOCK_004,
 * BLOCKED_ACCESS_PATTERN_010, AGENT_DIVERGENT_011
 */
import { logger } from '../../_shared/logger.ts';
import type { RuleResult, ActionExecuted, RuleRecord, SupabaseClient } from '../types.ts';

export async function processIsolateRule(supabase: SupabaseClient, rule: RuleRecord): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    suspicious_events_count: 5,
    time_window_minutes: 10
  };

  logger.debug(`[AGENT_ISOLATE_003] Detecting isolation candidates`);

  const { data: candidates, error } = await supabase
    .rpc('detect_isolation_candidates', {
      p_suspicious_events_count: conditions.suspicious_events_count,
      p_time_window_minutes: conditions.time_window_minutes
    });

  if (error) {
    logger.error('[AGENT_ISOLATE_003] Detection error:', error);
    throw error;
  }

  logger.debug(`[AGENT_ISOLATE_003] Found ${candidates?.length || 0} candidates`);

  const agents: RuleResult['agents'] = [];

  for (const candidate of candidates || []) {
    const actionsExecuted: ActionExecuted[] = [];

    const { error: isolateError } = await supabase
      .rpc('apply_agent_isolation', {
        p_agent_id: candidate.agent_id,
        p_reason: `Ameaca de seguranca: ${candidate.event_count} eventos suspeitos detectados`
      });

    if (isolateError) {
      logger.error(`[AGENT_ISOLATE_003] Error isolating ${candidate.agent_name}:`, isolateError);
      continue;
    }

    actionsExecuted.push({ type: 'APPLY_ISOLATION', success: true });
    actionsExecuted.push({ type: 'CANCEL_PENDING_JOBS', success: true });

    await supabase.from('security_events').insert({
      tenant_id: candidate.tenant_id,
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      event_type: 'agent_isolated',
      severity: 'critical',
      title: `Agente Isolado: ${candidate.agent_name}`,
      description: `Agente isolado automaticamente devido a ${candidate.event_count} eventos de seguranca suspeitos.`,
      status: 'open',
      data: {
        rule_code: rule.code,
        event_types: candidate.event_types,
        event_count: candidate.event_count
      }
    });

    actionsExecuted.push({ type: 'CREATE_SECURITY_EVENT', success: true });

    await supabase.from('decision_events').insert({
      tenant_id: candidate.tenant_id,
      rule_code: rule.code,
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'ISOLATE',
      decision_source: 'system',
      decision_type: 'autonomous',
      evidence: {
        event_count: candidate.event_count,
        event_types: candidate.event_types,
        detected_at: new Date().toISOString()
      },
      actions_executed: actionsExecuted
    });

    agents.push({
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'ISOLATE',
      reason: `${candidate.event_count} eventos de seguranca suspeitos`
    });

    logger.debug(`[AGENT_ISOLATE_003] Isolated agent ${candidate.agent_name}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

export async function processVersionBlockRule(supabase: SupabaseClient, rule: RuleRecord): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    failure_rate_percent: 30,
    affected_agents_count: 3,
    time_window_hours: 24
  };

  logger.debug(`[UPDATE_BLOCK_004] Detecting problematic versions`);

  const { data: candidates, error } = await supabase
    .rpc('detect_version_block_candidates', {
      p_failure_rate_percent: conditions.failure_rate_percent,
      p_affected_agents_count: conditions.affected_agents_count,
      p_time_window_hours: conditions.time_window_hours
    });

  if (error) {
    logger.error('[UPDATE_BLOCK_004] Detection error:', error);
    throw error;
  }

  logger.debug(`[UPDATE_BLOCK_004] Found ${candidates?.length || 0} problematic versions`);

  const agents: RuleResult['agents'] = [];

  for (const candidate of candidates || []) {
    const { error: blockError } = await supabase
      .rpc('apply_version_block', {
        p_version: candidate.version,
        p_platform: candidate.platform,
        p_reason: `Alta taxa de falhas: ${candidate.failure_rate}% em ${candidate.total_agents} agentes`,
        p_blocked_by: 'rules_engine'
      });

    if (blockError) {
      logger.error(`[UPDATE_BLOCK_004] Error blocking version ${candidate.version}:`, blockError);
      continue;
    }

    agents.push({
      agent_id: candidate.version_id || 'N/A',
      agent_name: `${candidate.version} (${candidate.platform})`,
      action: 'BLOCK_VERSION',
      reason: `${candidate.failure_rate}% taxa de falha em ${candidate.total_agents} agentes`
    });

    logger.debug(`[UPDATE_BLOCK_004] Blocked version ${candidate.version} for ${candidate.platform}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

export async function processBlockedAccessPatternRule(supabase: SupabaseClient, rule: RuleRecord): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    min_blocked_attempts: 10,
    time_window_minutes: 30
  };

  logger.debug(`[BLOCKED_ACCESS_PATTERN_010] Detecting blocked access patterns`);

  const cutoffTime = new Date(Date.now() - (conditions.time_window_minutes as number) * 60 * 1000).toISOString();

  const { data: patterns, error } = await supabase
    .from('blocked_access_attempts')
    .select('agent_id, domain, blocked_by, tenant_id')
    .gte('attempted_at', cutoffTime)
    .limit(1000);

  if (error) {
    logger.error('[BLOCKED_ACCESS_PATTERN_010] Query error:', error);
    return { rule_code: rule.code, processed_count: 0, agents: [] };
  }

  const agentAttempts = new Map<string, { count: number; domains: Set<string>; tenant_id: string }>();
  for (const attempt of patterns || []) {
    if (!agentAttempts.has(attempt.agent_id)) {
      agentAttempts.set(attempt.agent_id, { count: 0, domains: new Set(), tenant_id: attempt.tenant_id });
    }
    const agentData = agentAttempts.get(attempt.agent_id)!;
    agentData.count++;
    agentData.domains.add(attempt.domain);
  }

  const suspiciousAgents = Array.from(agentAttempts.entries())
    .filter(([_, data]) => data.count >= (conditions.min_blocked_attempts as number));

  logger.debug(`[BLOCKED_ACCESS_PATTERN_010] Found ${suspiciousAgents.length} suspicious agents`);

  const agents: RuleResult['agents'] = [];

  // Batch fetch agent names for all suspicious agents instead of N+1
  const suspAgentIds = suspiciousAgents.map(([id]) => id);
  const { data: suspAgentInfos } = await supabase.from('agents').select('id, agent_name').in('id', suspAgentIds);
  const suspAgentNameMap = new Map((suspAgentInfos || []).map(a => [a.id, a.agent_name]));

  for (const [agentId, data] of suspiciousAgents) {
    const agentName = suspAgentNameMap.get(agentId) || agentId.substring(0, 8);

    await supabase.from('system_alerts').insert({
      tenant_id: data.tenant_id,
      agent_id: agentId,
      alert_type: 'blocked_access_pattern',
      severity: 'critical',
      message: `Padrao suspeito: ${data.count} tentativas de acesso bloqueado em ${conditions.time_window_minutes}min`,
      data: {
        blocked_count: data.count,
        unique_domains: data.domains.size,
        sample_domains: Array.from(data.domains).slice(0, 5),
        time_window_minutes: conditions.time_window_minutes
      },
      resolved: false
    });

    await supabase.from('ai_insights').insert({
      tenant_id: data.tenant_id,
      title: `Padrao suspeito de navegacao: ${agentName}`,
      description: `O agente ${agentName} tentou acessar ${data.count} URLs bloqueadas em ${conditions.time_window_minutes} minutos, incluindo ${data.domains.size} dominios unicos.`,
      severity: 'critical',
      insight_type: 'security_threat',
      evidence: {
        blocked_attempts: data.count,
        unique_domains: data.domains.size,
        sample_domains: Array.from(data.domains).slice(0, 10)
      },
      recommendation: 'Investigar o comportamento do usuario. Considerar isolamento temporario do agente.',
      acknowledged: false
    });

    await supabase.from('decision_events').insert({
      tenant_id: data.tenant_id,
      rule_code: rule.code,
      agent_id: agentId,
      agent_name: agentName,
      action: 'DETECT_BLOCKED_ACCESS_PATTERN',
      decision_source: 'system',
      decision_type: 'autonomous',
      evidence: {
        blocked_count: data.count,
        unique_domains: data.domains.size,
        time_window_minutes: conditions.time_window_minutes,
        detected_at: new Date().toISOString()
      },
      actions_executed: [
        { type: 'CREATE_SYSTEM_ALERT', success: true },
        { type: 'CREATE_AI_INSIGHT', success: true }
      ]
    });

    agents.push({
      agent_id: agentId,
      agent_name: agentName,
      action: 'DETECT_BLOCKED_ACCESS_PATTERN',
      reason: `${data.count} tentativas bloqueadas em ${conditions.time_window_minutes}min`
    });
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

export async function processAgentDivergentRule(supabase: SupabaseClient, rule: RuleRecord): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    deviation_threshold_stddev: 2,
    comparison_window_hours: 24
  };

  logger.debug('[AGENT_DIVERGENT_011] Detecting divergent agents');

  const cutoffTime = new Date(Date.now() - (conditions.comparison_window_hours as number) * 60 * 60 * 1000).toISOString();

  const { data: metrics, error } = await supabase
    .from('agent_system_metrics')
    .select('agent_id, tenant_id, cpu_usage_percent, memory_usage_percent')
    .gte('collected_at', cutoffTime)
    .limit(5000);

  if (error) {
    logger.error('[AGENT_DIVERGENT_011] Query error:', error);
    return { rule_code: rule.code, processed_count: 0, agents: [] };
  }

  const tenantStats = new Map<string, { cpuValues: number[]; memValues: number[] }>();
  const agentStats = new Map<string, { tenant_id: string; cpuValues: number[]; memValues: number[] }>();

  for (const m of metrics || []) {
    if (!tenantStats.has(m.tenant_id)) {
      tenantStats.set(m.tenant_id, { cpuValues: [], memValues: [] });
    }
    const ts = tenantStats.get(m.tenant_id)!;
    if (m.cpu_usage_percent != null) ts.cpuValues.push(m.cpu_usage_percent);
    if (m.memory_usage_percent != null) ts.memValues.push(m.memory_usage_percent);

    if (!agentStats.has(m.agent_id)) {
      agentStats.set(m.agent_id, { tenant_id: m.tenant_id, cpuValues: [], memValues: [] });
    }
    const as2 = agentStats.get(m.agent_id)!;
    if (m.cpu_usage_percent != null) as2.cpuValues.push(m.cpu_usage_percent);
    if (m.memory_usage_percent != null) as2.memValues.push(m.memory_usage_percent);
  }

  const calcStats = (values: number[]) => {
    if (values.length === 0) return { mean: 0, stddev: 0 };
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return { mean, stddev: Math.sqrt(variance) };
  };

  const tenantCalcStats = new Map<string, { cpu: { mean: number; stddev: number }; mem: { mean: number; stddev: number } }>();
  for (const [tenantId, stats] of tenantStats) {
    tenantCalcStats.set(tenantId, { cpu: calcStats(stats.cpuValues), mem: calcStats(stats.memValues) });
  }

  const divergentAgents: { agent_id: string; tenant_id: string; cpuDeviation: number; memDeviation: number }[] = [];

  for (const [agentId, stats] of agentStats) {
    const tenantCalc = tenantCalcStats.get(stats.tenant_id);
    if (!tenantCalc || tenantCalc.cpu.stddev === 0) continue;

    const agentCpuMean = stats.cpuValues.length > 0 ? stats.cpuValues.reduce((a, b) => a + b, 0) / stats.cpuValues.length : 0;
    const agentMemMean = stats.memValues.length > 0 ? stats.memValues.reduce((a, b) => a + b, 0) / stats.memValues.length : 0;

    const cpuDeviation = Math.abs(agentCpuMean - tenantCalc.cpu.mean) / (tenantCalc.cpu.stddev || 1);
    const memDeviation = Math.abs(agentMemMean - tenantCalc.mem.mean) / (tenantCalc.mem.stddev || 1);

    if (cpuDeviation > (conditions.deviation_threshold_stddev as number) || memDeviation > (conditions.deviation_threshold_stddev as number)) {
      divergentAgents.push({ agent_id: agentId, tenant_id: stats.tenant_id, cpuDeviation, memDeviation });
    }
  }

  logger.debug(`[AGENT_DIVERGENT_011] Found ${divergentAgents.length} divergent agents`);

  const agents: RuleResult['agents'] = [];

  for (const divergent of divergentAgents.slice(0, 10)) {
    const { data: agentInfo } = await supabase
      .from('agents')
      .select('agent_name')
      .eq('id', divergent.agent_id)
      .single();

    const agentName = agentInfo?.agent_name || divergent.agent_id.substring(0, 8);

    await supabase.from('ai_insights').insert({
      tenant_id: divergent.tenant_id,
      title: `Agente divergente: ${agentName}`,
      description: `O agente ${agentName} apresenta metricas significativamente diferentes do grupo (CPU: ${divergent.cpuDeviation.toFixed(1)}σ, Memoria: ${divergent.memDeviation.toFixed(1)}σ).`,
      severity: 'medium',
      insight_type: 'anomaly_detection',
      evidence: {
        cpu_deviation_stddev: divergent.cpuDeviation,
        memory_deviation_stddev: divergent.memDeviation,
        threshold_stddev: conditions.deviation_threshold_stddev
      },
      recommendation: 'Investigar processos em execucao no agente. Pode indicar malware ou uso indevido.',
      acknowledged: false
    });

    await supabase.from('decision_events').insert({
      tenant_id: divergent.tenant_id,
      rule_code: rule.code,
      agent_id: divergent.agent_id,
      agent_name: agentName,
      action: 'DETECT_DIVERGENT_AGENT',
      decision_source: 'system',
      decision_type: 'autonomous',
      evidence: {
        cpu_deviation_stddev: divergent.cpuDeviation,
        memory_deviation_stddev: divergent.memDeviation,
        detected_at: new Date().toISOString()
      },
      actions_executed: [{ type: 'CREATE_AI_INSIGHT', success: true }]
    });

    agents.push({
      agent_id: divergent.agent_id,
      agent_name: agentName,
      action: 'DETECT_DIVERGENT_AGENT',
      reason: `CPU: ${divergent.cpuDeviation.toFixed(1)}σ, Mem: ${divergent.memDeviation.toFixed(1)}σ do grupo`
    });
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}
