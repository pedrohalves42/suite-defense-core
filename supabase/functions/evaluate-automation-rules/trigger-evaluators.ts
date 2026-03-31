import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
/**
 * Trigger evaluators for automation rules
 */
import { matchesScope, evaluateOperator } from './helpers.ts';

export interface TriggerCandidate {
  agentId: string;
  triggerData: Record<string, unknown>;
}

export async function evaluateMetricThreshold(
  supabase: SupabaseClient, rule: Record<string, unknown>, tenantId: string, agents: Array<Record<string, unknown>>, latestMetrics: Map<string, Record<string, unknown>>

): Promise<TriggerCandidate[]> {
  const conditions = rule.trigger_conditions as Record<string, unknown>;
  const candidates: TriggerCandidate[] = [];

  for (const [agentId, m] of latestMetrics) {
    if (!matchesScope(rule, agentId)) continue;
    const metricMap: Record<string, number | null> = {
      'cpu_usage_percent': m.cpu_usage_percent, 'cpu_percent': m.cpu_usage_percent,
      'memory_usage_percent': m.memory_usage_percent, 'memory_percent': m.memory_usage_percent,
      'disk_usage_percent': m.disk_usage_percent,
      'disk_free_percent': m.disk_usage_percent != null ? 100 - m.disk_usage_percent : null,
    };
    const metricValue = metricMap[conditions.metric as string];
    if (metricValue === null || metricValue === undefined) continue;
    if (evaluateOperator(metricValue, conditions.operator as string, conditions.value as number)) {
      candidates.push({
        agentId,
        triggerData: { metric: conditions.metric, value: metricValue, threshold: conditions.value, severity: metricValue >= 95 ? 'critical' : metricValue >= 80 ? 'high' : 'medium', message: `${conditions.metric} = ${metricValue}% (threshold: ${conditions.operator} ${conditions.value}%)` },
      });
    }
  }
  return candidates;
}

export async function evaluateProcessAnomaly(
  supabase: SupabaseClient, rule: Record<string, unknown>, tenantId: string, agents: Array<Record<string, unknown>>
): Promise<TriggerCandidate[]> {
  const conditions = rule.trigger_conditions as Record<string, unknown>;
  const candidates: TriggerCandidate[] = [];
  const agentIds = agents.map((a) => a.id);

  const { data: processData } = await supabase
    .from('agent_processes')
    .select('agent_id, suspicious_processes, new_processes, total_processes, collected_at')
    .in('agent_id', agentIds)
    .order('collected_at', { ascending: false });

  const latestProcesses = new Map<string, Record<string, unknown>>();
  (processData || []).forEach((p: Record<string, unknown>) => {
    if (!latestProcesses.has(p.agent_id as string)) latestProcesses.set(p.agent_id as string, p);
  });

  for (const [agentId, p] of latestProcesses) {
    if (!matchesScope(rule, agentId)) continue;
    const eventType = (conditions.eventType || conditions.event_type || 'suspicious_process') as string;

    if (eventType === 'suspicious_process') {
      const suspiciousCount = (p.suspicious_processes || []).length;
      const threshold = (conditions.value as number) || 1;
      if (suspiciousCount >= threshold) {
        candidates.push({ agentId, triggerData: { event_type: 'suspicious_process', count: suspiciousCount, threshold, severity: 'critical', processes: (p.suspicious_processes || []).slice(0, 5).map((sp: Record<string, unknown>) => sp.name), message: `${suspiciousCount} suspicious process(es) detected` } });
      }
    } else if (eventType === 'new_process_burst') {
      const newCount = (p.new_processes || []).length;
      const threshold = (conditions.value as number) || 10;
      if (newCount >= threshold) {
        candidates.push({ agentId, triggerData: { event_type: 'new_process_burst', count: newCount, threshold, severity: 'high', message: `${newCount} new processes detected` } });
      }
    }
  }
  return candidates;
}

export async function evaluateAgentStatus(
  supabase: SupabaseClient, rule: Record<string, unknown>, tenantId: string, agents: Array<Record<string, unknown>>
): Promise<TriggerCandidate[]> {
  const conditions = rule.trigger_conditions as Record<string, unknown>;
  const candidates: TriggerCandidate[] = [];
  const eventType = (conditions.eventType || conditions.event_type || 'agent_offline') as string;
  const durationMinutes = (conditions.duration_minutes as number) || 10;
  const thresholdMs = durationMinutes * 60 * 1000;

  const { data: allAgents } = await supabase
    .from('agents').select('id, agent_name, status, last_heartbeat').eq('tenant_id', tenantId);

  if (!allAgents) return candidates;

  for (const agent of allAgents) {
    if (!matchesScope(rule, agent.id)) continue;
    if (eventType === 'agent_offline') {
      const lastHb = agent.last_heartbeat ? new Date(agent.last_heartbeat).getTime() : 0;
      const offlineDuration = Date.now() - lastHb;
      if (offlineDuration > thresholdMs && agent.status !== 'archived') {
        const offlineMin = Math.round(offlineDuration / 60000);
        candidates.push({ agentId: agent.id, triggerData: { event_type: 'agent_offline', agent_name: agent.agent_name, offline_minutes: offlineMin, threshold_minutes: durationMinutes, severity: offlineMin > 120 ? 'critical' : offlineMin > 60 ? 'high' : 'medium', message: `Agent '${agent.agent_name}' offline for ${offlineMin} min` } });
      }
    }
  }
  return candidates;
}

export async function evaluateSecurityCheck(
  supabase: SupabaseClient, rule: Record<string, unknown>, tenantId: string, agents: Array<Record<string, unknown>>
): Promise<TriggerCandidate[]> {
  const conditions = rule.trigger_conditions as Record<string, unknown>;
  const candidates: TriggerCandidate[] = [];
  const checkType = conditions.check as string;
  const agentIds = agents.map((a) => a.id);

  if (checkType === 'no_antivirus_detected' || checkType === 'antivirus_inactive') {
    const { data: avData } = await supabase
      .from('antivirus_status').select('agent_id, engine_name, status, last_update_at')
      .in('agent_id', agentIds).order('collected_at', { ascending: false });
    const latestAv = new Map<string, Record<string, unknown>>();
    (avData || []).forEach((av: Record<string, unknown>) => { if (!latestAv.has(av.agent_id as string)) latestAv.set(av.agent_id as string, av); });
    for (const agent of agents) {
      if (!matchesScope(rule, agent.id as string)) continue;
      const av = latestAv.get(agent.id as string);
      if (!av || av.status === 'inactive' || av.status === 'disabled') {
        candidates.push({ agentId: agent.id as string, triggerData: { event_type: 'antivirus_inactive', check: checkType, agent_name: agent.agent_name, av_engine: av?.engine_name || 'none', severity: 'critical', message: `Antivirus ${av ? 'inativo' : 'nao detectado'} no agente '${agent.agent_name}'` } });
      }
    }
  } else if (checkType === 'firewall_disabled') {
    const recentWindow = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: fwEvidence } = await supabase.from('agent_evidence_logs').select('agent_id').eq('tenant_id', tenantId).in('agent_id', agentIds).in('event_type', ['firewall_disabled', 'firewall_off', 'security_config_change']).gte('created_at', recentWindow);
    const { data: fwAlerts } = await supabase.from('system_alerts').select('agent_id').eq('tenant_id', tenantId).in('alert_type', ['security_threat', 'firewall_disabled']).eq('resolved', false).in('agent_id', agentIds).ilike('title', '%firewall%');
    const affectedAgents = new Set<string>();
    (fwEvidence || []).forEach((e: Record<string, unknown>) => affectedAgents.add(e.agent_id as string));
    (fwAlerts || []).forEach((a: Record<string, unknown>) => affectedAgents.add(a.agent_id as string));
    for (const agentId of affectedAgents) {
      if (!matchesScope(rule, agentId)) continue;
      const agent = agents.find((a) => a.id === agentId);
      candidates.push({ agentId, triggerData: { event_type: 'firewall_disabled', check: checkType, agent_name: (agent as any)?.agent_name || 'Unknown', severity: 'high', message: `Firewall desabilitado no agente '${(agent as any)?.agent_name}'` } });
    }
  } else if (checkType === 'unauthorized_usb') {
    const { data: usbDevices } = await supabase.from('agent_usb_devices').select('id, agent_id, device_id, device_name').in('agent_id', agentIds).eq('is_blocked', false);
    for (const usb of (usbDevices || [])) {
      if (!matchesScope(rule, usb.agent_id)) continue;
      const agent = agents.find((a) => a.id === usb.agent_id);
      candidates.push({ agentId: usb.agent_id, triggerData: { event_type: 'unauthorized_usb', check: checkType, agent_name: (agent as any)?.agent_name || 'Unknown', device_id: usb.device_id, device_name: usb.device_name, severity: 'high', message: `USB nao autorizado (${usb.device_name || usb.device_id}) no agente '${(agent as any)?.agent_name}'` } });
    }
  } else if (checkType === 'vulnerable_software') {
    const { data: vulns } = await supabase.from('vuln_findings').select('id, agent_id, check_key, title, severity').in('agent_id', agentIds).in('severity', ['critical', 'high']).is('acknowledged_at', null).limit(50);
    const agentVulns = new Map<string, any[]>();
    (vulns || []).forEach((v: Record<string, unknown>) => { if (!agentVulns.has(v.agent_id as string)) agentVulns.set(v.agent_id as string, []); agentVulns.get(v.agent_id as string)!.push(v); });
    for (const [agentId, agentVulnList] of agentVulns) {
      if (!matchesScope(rule, agentId)) continue;
      const agent = agents.find((a) => a.id === agentId);
      candidates.push({ agentId, triggerData: { event_type: 'vulnerable_software', check: checkType, agent_name: (agent as any)?.agent_name || 'Unknown', vuln_count: agentVulnList.length, top_vulns: agentVulnList.slice(0, 3).map((v: Record<string, unknown>) => v.title), severity: 'critical', message: `${agentVulnList.length} vulnerabilidade(s) critica(s)` } });
    }
  }
  return candidates;
}
