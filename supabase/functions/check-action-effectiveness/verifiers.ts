/**
 * Effectiveness verification strategies extracted from index.ts
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

export type EffectivenessResult = {
  status: 'resolved' | 'partial' | 'failed' | 'unknown';
  evidence: Record<string, unknown>;
  reason: string;
};

export async function checkDnsActivity(
  supabase: SupabaseClient, agentId: string, actionCreatedAt: string, originalEvidence: Record<string, unknown>
): Promise<EffectivenessResult> {
  const domain = originalEvidence?.domain || originalEvidence?.blocked_domain;
  if (!domain) return { status: 'unknown', evidence: {}, reason: 'No domain in original evidence' };

  const { data: recentActivity, error } = await supabase
    .from('agent_web_activity').select('id, domain, visited_at, is_blocked')
    .eq('agent_id', agentId).eq('domain', domain).gt('visited_at', actionCreatedAt).limit(10);

  if (error) return { status: 'unknown', evidence: { error: error.message }, reason: 'Query failed' };

  const activities = recentActivity as Array<{ id: string; domain: string; visited_at: string; is_blocked: boolean }> || [];
  const attempts = activities.length;
  const blockedAttempts = activities.filter(a => a.is_blocked).length;

  if (attempts === 0) return { status: 'resolved', evidence: { domain, attempts_after_action: 0 }, reason: `Nenhuma tentativa de acesso ao dominio ${domain} apos o bloqueio` };
  if (blockedAttempts === attempts) return { status: 'resolved', evidence: { domain, attempts_after_action: attempts, all_blocked: true }, reason: `${attempts} tentativa(s) bloqueada(s) com sucesso` };
  return { status: 'partial', evidence: { domain, attempts_after_action: attempts, blocked: blockedAttempts }, reason: `${attempts - blockedAttempts} tentativa(s) nao bloqueada(s)` };
}

export async function checkAntivirusStatus(
  supabase: SupabaseClient, agentId: string, actionCreatedAt: string, checkType: 'enabled' | 'updated'
): Promise<EffectivenessResult> {
  const { data, error } = await supabase.from('antivirus_status')
    .select('status, last_update_at, product_name, collected_at')
    .eq('agent_id', agentId).order('collected_at', { ascending: false }).limit(1).single();

  if (error || !data) return { status: 'unknown', evidence: { error: error?.message }, reason: 'No antivirus status found' };
  const status = data as { status: string; last_update_at: string; product_name: string };

  if (checkType === 'enabled') {
    return (status.status === 'enabled' || status.status === 'active')
      ? { status: 'resolved', evidence: { product: status.product_name, current_status: status.status }, reason: `Antivirus ${status.product_name} esta ativo` }
      : { status: 'failed', evidence: { product: status.product_name, current_status: status.status }, reason: `Antivirus ainda esta ${status.status}` };
  }
  const updateTime = new Date(status.last_update_at);
  const actionTime = new Date(actionCreatedAt);
  return updateTime > actionTime
    ? { status: 'resolved', evidence: { product: status.product_name, last_update: status.last_update_at }, reason: `Antivirus atualizado em ${status.last_update_at}` }
    : { status: 'failed', evidence: { product: status.product_name, last_update: status.last_update_at }, reason: 'Antivirus ainda nao foi atualizado' };
}

export async function checkSafeModeResolved(supabase: SupabaseClient, agentId: string): Promise<EffectivenessResult> {
  const { data, error } = await supabase.from('agent_safe_mode_events')
    .select('id, entered_at, resolved_at, reason').eq('agent_id', agentId)
    .order('entered_at', { ascending: false }).limit(1).single();
  if (error) return { status: 'unknown', evidence: { error: error.message }, reason: 'Query failed' };
  const event = data as { resolved_at: string | null; entered_at: string; reason: string } | null;
  return event?.resolved_at
    ? { status: 'resolved', evidence: { resolved_at: event.resolved_at }, reason: `Safe mode resolvido em ${event.resolved_at}` }
    : { status: 'failed', evidence: { entered_at: event?.entered_at, reason: event?.reason }, reason: 'Agente ainda em safe mode' };
}

export async function checkAgentOnline(supabase: SupabaseClient, agentId: string): Promise<EffectivenessResult> {
  const { data, error } = await supabase.from('agents').select('status, agent_state, last_heartbeat').eq('id', agentId).single();
  if (error || !data) return { status: 'unknown', evidence: { error: error?.message }, reason: 'Agent not found' };
  const agent = data as { status: string; agent_state: string; last_heartbeat: string };
  const lastHeartbeat = new Date(agent.last_heartbeat);
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  return (agent.agent_state === 'online' && lastHeartbeat > thirtyMinAgo)
    ? { status: 'resolved', evidence: { status: agent.status, state: agent.agent_state, last_heartbeat: agent.last_heartbeat }, reason: 'Agente voltou a ficar online' }
    : { status: 'failed', evidence: { status: agent.status, state: agent.agent_state, last_heartbeat: agent.last_heartbeat }, reason: `Agente ainda esta ${agent.agent_state}` };
}

export async function checkVulnerabilityFixed(supabase: SupabaseClient, agentId: string, originalEvidence: Record<string, unknown>): Promise<EffectivenessResult> {
  const cveId = originalEvidence?.cve_id || originalEvidence?.vulnerability_id;
  if (!cveId) return { status: 'unknown', evidence: {}, reason: 'No CVE ID in original evidence' };
  const { data: findings, error } = await supabase.from('vuln_findings').select('id, cve_id, status').eq('agent_id', agentId).eq('cve_id', cveId).eq('status', 'open').limit(1);
  if (error) return { status: 'unknown', evidence: { error: error.message }, reason: 'Query failed' };
  const vulns = findings as Array<{ id: string; cve_id: string; status: string }> || [];
  return vulns.length === 0
    ? { status: 'resolved', evidence: { cve_id: cveId }, reason: `Vulnerabilidade ${cveId} nao esta mais presente` }
    : { status: 'failed', evidence: { cve_id: cveId, finding_id: vulns[0].id }, reason: `Vulnerabilidade ${cveId} ainda presente` };
}

/** Route insight_type to the correct verifier */
export async function verifyByInsightType(
  supabase: SupabaseClient, insightType: string, agentId: string,
  executedAt: string, evidence: Record<string, unknown>
): Promise<EffectivenessResult> {
  switch (insightType) {
    case 'dns_malicious_activity':
    case 'dns_c2_communication':
      return checkDnsActivity(supabase, agentId, executedAt, evidence);
    case 'antivirus_disabled':
      return checkAntivirusStatus(supabase, agentId, executedAt, 'enabled');
    case 'antivirus_outdated':
      return checkAntivirusStatus(supabase, agentId, executedAt, 'updated');
    case 'safe_mode_prolonged':
      return checkSafeModeResolved(supabase, agentId);
    case 'agent_offline_suspicious':
    case 'agent_offline_critical':
      return checkAgentOnline(supabase, agentId);
    case 'vulnerability_critical':
    case 'vulnerability_high':
      return checkVulnerabilityFixed(supabase, agentId, evidence);
    default:
      return { status: 'unknown', evidence: { note: 'No specific verification strategy for this insight type' }, reason: `Verificacao automatica nao disponivel para ${insightType}` };
  }
}
