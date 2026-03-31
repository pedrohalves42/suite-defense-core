/**
 * check-action-effectiveness — Migrated to serveInternal
 * Verifies if AI-recommended actions were effective.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

type EffectivenessResult = {
  status: 'resolved' | 'partial' | 'failed' | 'unknown';
  evidence: Record<string, unknown>;
  reason: string;
};

// Verification strategies by insight type
async function checkDnsActivity(supabase: SupabaseClient, agentId: string, actionCreatedAt: string, originalEvidence: Record<string, unknown>): Promise<EffectivenessResult> {
  const domain = originalEvidence?.domain || originalEvidence?.blocked_domain;
  if (!domain) return { status: 'unknown', evidence: {}, reason: 'No domain in original evidence' };

  const { data: recentActivity, error } = await supabase
    .from('agent_web_activity').select('id, domain, visited_at, is_blocked')
    .eq('agent_id', agentId).eq('domain', domain).gt('visited_at', actionCreatedAt).limit(10);

  if (error) { logger.error('Error checking DNS activity:', error); return { status: 'unknown', evidence: { error: error.message }, reason: 'Query failed' }; }

  const activities = recentActivity as Array<{ id: string; domain: string; visited_at: string; is_blocked: boolean }> || [];
  const attempts = activities.length;
  const blockedAttempts = activities.filter(a => a.is_blocked).length;

  if (attempts === 0) return { status: 'resolved', evidence: { domain, attempts_after_action: 0 }, reason: `Nenhuma tentativa de acesso ao dominio ${domain} apos o bloqueio` };
  if (blockedAttempts === attempts) return { status: 'resolved', evidence: { domain, attempts: attempts, all_blocked: true }, reason: `Todas ${attempts} tentativas foram bloqueadas` };
  return { status: 'partial', evidence: { domain, attempts, blocked: blockedAttempts, unblocked: attempts - blockedAttempts }, reason: `${attempts - blockedAttempts} tentativa(s) nao bloqueada(s)` };
}

async function checkAntivirusStatus(supabase: SupabaseClient, agentId: string, actionCreatedAt: string, expectedState: string): Promise<EffectivenessResult> {
  const { data: avStatus, error } = await supabase
    .from('antivirus_status').select('status, engine_name, last_update_at')
    .eq('agent_id', agentId).order('created_at', { ascending: false }).limit(1).single();

  if (error) return { status: 'unknown', evidence: { error: error.message }, reason: 'Failed to fetch AV status' };
  if (!avStatus) return { status: 'unknown', evidence: {}, reason: 'No AV status found' };

  const isResolved = expectedState === 'enabled' ? avStatus.status === 'active' || avStatus.status === 'enabled' : !!avStatus.last_update_at && new Date(avStatus.last_update_at) > new Date(actionCreatedAt);
  return { status: isResolved ? 'resolved' : 'failed', evidence: { engine: avStatus.engine_name, status: avStatus.status, last_update: avStatus.last_update_at }, reason: isResolved ? `Antivirus ${expectedState}` : `Antivirus still not ${expectedState}` };
}

async function checkSafeModeResolved(supabase: SupabaseClient, agentId: string): Promise<EffectivenessResult> {
  const { data: agent, error } = await supabase
    .from('agents').select('safe_mode, safe_mode_reason, last_heartbeat').eq('id', agentId).single();
  if (error || !agent) return { status: 'unknown', evidence: { error: error?.message }, reason: 'Agent not found' };
  return { status: agent.safe_mode ? 'failed' : 'resolved', evidence: { safe_mode: agent.safe_mode, reason: agent.safe_mode_reason }, reason: agent.safe_mode ? 'Still in safe mode' : 'Exited safe mode' };
}

async function checkAgentOnline(supabase: SupabaseClient, agentId: string): Promise<EffectivenessResult> {
  const { data: agent, error } = await supabase
    .from('agents').select('status, last_heartbeat').eq('id', agentId).single();
  if (error || !agent) return { status: 'unknown', evidence: { error: error?.message }, reason: 'Agent not found' };
  const isOnline = agent.status === 'active' && agent.last_heartbeat && (Date.now() - new Date(agent.last_heartbeat).getTime()) < 10 * 60 * 1000;
  return { status: isOnline ? 'resolved' : 'failed', evidence: { status: agent.status, last_heartbeat: agent.last_heartbeat }, reason: isOnline ? 'Agent is back online' : 'Agent still offline' };
}

async function checkVulnerabilityFixed(supabase: SupabaseClient, agentId: string, originalEvidence: Record<string, unknown>): Promise<EffectivenessResult> {
  const cveId = originalEvidence?.cve_id || originalEvidence?.vulnerability_id;
  if (!cveId) return { status: 'unknown', evidence: {}, reason: 'No CVE ID in evidence' };
  const { data: vuln, error } = await supabase
    .from('vuln_findings').select('id, status').eq('agent_id', agentId).eq('cve_id', cveId).single();
  if (error) return { status: 'unknown', evidence: { error: error.message }, reason: 'Query failed' };
  if (!vuln) return { status: 'resolved', evidence: { cve_id: cveId }, reason: `Vulnerability ${cveId} no longer detected` };
  return { status: vuln.status === 'fixed' ? 'resolved' : 'failed', evidence: { cve_id: cveId, status: vuln.status }, reason: vuln.status === 'fixed' ? `${cveId} fixed` : `${cveId} still ${vuln.status}` };
}

serveInternal(async (_req, ctx) => {
  const { supabase } = ctx;
  const startedAt = Date.now();

  logger.info('[check-action-effectiveness] Starting verification run');

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  
  const { data: actions, error: fetchError } = await supabase
    .from('ai_actions')
    .select(`id, insight_id, action_type, executed_at, result, ai_insights!inner ( id, insight_type, agent_id, evidence, tenant_id )`)
    .eq('effectiveness_status', 'pending').eq('status', 'executed').lt('executed_at', tenMinutesAgo).limit(20);

  if (fetchError) { logger.error('[check-action-effectiveness] Error fetching actions:', fetchError); throw fetchError; }

  logger.info(`[check-action-effectiveness] Found ${actions?.length || 0} actions to verify`);

  const results: Array<{ actionId: string; status: string; reason: string }> = [];

  for (const action of actions ?? []) {
    const insightData = action.ai_insights;
    const insight = Array.isArray(insightData) ? insightData[0] : insightData;
    if (!insight) continue;

    const insight_type = insight.insight_type as string;
    const agent_id = insight.agent_id as string;
    const evidence = insight.evidence as Record<string, unknown>;
    const originalEvidence = evidence || {};

    let result: EffectivenessResult;
    logger.info(`[check-action-effectiveness] Checking ${insight_type} for agent ${agent_id}`);

    switch (insight_type) {
      case 'dns_malicious_activity':
      case 'dns_c2_communication':
        result = await checkDnsActivity(supabase, agent_id, action.executed_at, originalEvidence); break;
      case 'antivirus_disabled':
        result = await checkAntivirusStatus(supabase, agent_id, action.executed_at, 'enabled'); break;
      case 'antivirus_outdated':
        result = await checkAntivirusStatus(supabase, agent_id, action.executed_at, 'updated'); break;
      case 'safe_mode_prolonged':
        result = await checkSafeModeResolved(supabase, agent_id); break;
      case 'agent_offline_suspicious':
      case 'agent_offline_critical':
        result = await checkAgentOnline(supabase, agent_id); break;
      case 'vulnerability_critical':
      case 'vulnerability_high':
        result = await checkVulnerabilityFixed(supabase, agent_id, originalEvidence); break;
      default:
        result = { status: 'unknown', evidence: { note: 'No specific verification strategy for this insight type' }, reason: `Verificacao automatica nao disponivel para ${insight_type}` };
    }

    await supabase.from('ai_actions').update({ effectiveness_status: result.status, effectiveness_checked_at: new Date().toISOString(), effectiveness_evidence: result.evidence }).eq('id', action.id);

    const finalOutcome = result.status === 'unknown' ? null : result.status;
    if (finalOutcome) {
      await supabase.from('ai_insights').update({ final_outcome: finalOutcome }).eq('id', insight.id);
    }

    results.push({ actionId: action.id, status: result.status, reason: result.reason });
    logger.info(`[check-action-effectiveness] Action ${action.id}: ${result.status} - ${result.reason}`);
  }

  const durationMs = Date.now() - startedAt;
  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'check-action-effectiveness', p_success: true, p_duration_ms: durationMs,
    p_result: { actions_checked: results.length, resolved: results.filter(r => r.status === 'resolved').length, failed: results.filter(r => r.status === 'failed').length, partial: results.filter(r => r.status === 'partial').length, unknown: results.filter(r => r.status === 'unknown').length },
    p_processed_count: results.length, p_job_source: 'cron',
  });

  logger.info(`[check-action-effectiveness] Completed. Checked ${results.length} actions in ${durationMs}ms`);

  return { success: true, checked: results.length, results, duration_ms: durationMs };
});
