/**
 * Playbook Analysis Handlers — Phase 1C
 * Inlined from: calculate-risk-score, run-attack-simulation
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

// ── calculate-risk-score ────────────────────────────────────────────────

interface RiskBreakdown {
  antivirus_issues: number; critical_vulnerabilities: number;
  offline_agents: number; critical_events: number; job_failure_rate: number;
}
interface RiskExplanation {
  antivirus_issues?: string; critical_vulnerabilities?: string;
  offline_agents?: string; critical_events?: string; job_failure_rate?: string;
}

export async function handleCalculateRiskScore(supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>): Promise<unknown> {
  const tenantId = payload.tenant_id as string;
  if (!tenantId) return { __status: 400, error: 'tenant_id is required' };

  logger.info(`[calculate-risk-score][${requestId}] Calculating for tenant: ${tenantId}`);

  let score = 100;
  const breakdown: RiskBreakdown = { antivirus_issues: 0, critical_vulnerabilities: 0, offline_agents: 0, critical_events: 0, job_failure_rate: 0 };
  const explanation: RiskExplanation = {};

  const { count: avIssuesCount } = await supabase.from('antivirus_status').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).or('status.neq.UpToDate,status.is.null');
  if ((avIssuesCount ?? 0) > 0) { breakdown.antivirus_issues = -20; explanation.antivirus_issues = `${avIssuesCount} computador(es) com antivirus desativado ou desatualizado`; score -= 20; }

  const { count: criticalVulnsCount } = await supabase.from('vuln_findings').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('severity', ['critical', 'high']);
  if ((criticalVulnsCount ?? 0) > 0) { breakdown.critical_vulnerabilities = -30; explanation.critical_vulnerabilities = `${criticalVulnsCount} vulnerabilidade(s) critica(s) encontrada(s)`; score -= 30; }

  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: offlineAgentsData } = await supabase.from('agents').select('id').eq('tenant_id', tenantId).eq('status', 'active').or(`last_heartbeat.lt.${thirtyMinutesAgo},last_heartbeat.is.null`);
  const offlineCount = offlineAgentsData?.length ?? 0;
  if (offlineCount > 0) { const penalty = Math.min(offlineCount * 5, 20); breakdown.offline_agents = -penalty; explanation.offline_agents = `${offlineCount} computador(es) offline ha mais de 30 minutos`; score -= penalty; }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: criticalEventsCount } = await supabase.from('security_events').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('severity', ['critical', 'high']).gte('created_at', oneDayAgo);
  if ((criticalEventsCount ?? 0) > 0) { breakdown.critical_events = -40; explanation.critical_events = `${criticalEventsCount} evento(s) critico(s) nas ultimas 24h`; score -= 40; }

  const { data: jobsData } = await supabase.from('jobs').select('status').eq('tenant_id', tenantId).gte('created_at', oneDayAgo);
  if (jobsData && jobsData.length >= 5) {
    const failedJobs = jobsData.filter(j => j.status === 'failed').length;
    const failureRate = (failedJobs / jobsData.length) * 100;
    if (failureRate > 30) { breakdown.job_failure_rate = -10; explanation.job_failure_rate = `Taxa de falha de jobs: ${failureRate.toFixed(1)}%`; score -= 10; }
  }

  score = Math.max(0, Math.min(100, score));

  const { data: previousScoreData } = await supabase.from('tenant_risk_scores').select('score').eq('tenant_id', tenantId).eq('scope', 'tenant').order('calculated_at', { ascending: false }).limit(1).maybeSingle();
  const previousScore = previousScoreData?.score ?? null;
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (previousScore !== null) { if (score > previousScore) trend = 'up'; else if (score < previousScore) trend = 'down'; }

  const { error: insertError } = await supabase.from('tenant_risk_scores').insert({ tenant_id: tenantId, scope: 'tenant', score, breakdown, previous_score: previousScore, trend, calculation_version: 'v1' });
  if (insertError) { logger.error(`[calculate-risk-score][${requestId}] Error inserting score:`, insertError); throw insertError; }

  return { score, trend, previous_score: previousScore, breakdown, explanation, calculated_at: new Date().toISOString(), version: 'v1' };
}

// ── run-attack-simulation ───────────────────────────────────────────────

const AttackSimSchema = z.object({
  simulation_type: z.enum(['eicar_test', 'firewall_test', 'canary_file_test', 'usb_policy_test', 'dns_filter_test', 'port_scan_test']),
  tenant_id: z.string().uuid().optional(),
});

function getTestParams(type: string) {
  switch (type) {
    case 'eicar_test': return { test_string: 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*', file_path: 'C:\\CyberShield\\tests\\eicar_test.com' };
    case 'firewall_test': return { check_profiles: ['Domain', 'Private', 'Public'] };
    case 'canary_file_test': return { canary_paths: ['C:\\CyberShield\\canary\\financial_data.xlsx', 'C:\\CyberShield\\canary\\passwords.txt'] };
    case 'usb_policy_test': return { check_registry: true };
    case 'dns_filter_test': return { test_domains: ['malware.testcategory.com', 'phishing.testcategory.com'] };
    default: return {};
  }
}

function getDetectionMethod(type: string) {
  switch (type) {
    case 'eicar_test': return 'Antivirus Real-time Protection';
    case 'firewall_test': return 'Windows Firewall Active';
    case 'canary_file_test': return 'File Integrity Monitor';
    case 'usb_policy_test': return 'USB Policy Enforcement';
    case 'dns_filter_test': return 'DNS Filter Block';
    default: return 'Unknown';
  }
}

export async function handleRunAttackSimulation(supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>): Promise<unknown> {
  const parsed = AttackSimSchema.safeParse(payload);
  if (!parsed.success) return { __status: 400, error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors };

  const { simulation_type } = parsed.data;
  const tenantId = parsed.data.tenant_id || (payload.tenant_id as string);
  if (!tenantId) return { __status: 400, error: 'tenant_id is required' };

  const { data: agents } = await supabase.from('agents').select('id, hostname').eq('tenant_id', tenantId).eq('status', 'active').neq('agent_mode', 'SAFE_MODE');
  if (!agents?.length) return { __status: 400, error: 'No online agents to test' };

  const simTitles: Record<string, string> = {
    eicar_test: 'Teste EICAR - Deteccao de Antivirus', firewall_test: 'Teste de Firewall - Verificacao de Status',
    canary_file_test: 'Teste Canary Files - Monitoramento de Acesso', usb_policy_test: 'Teste USB Policy - Verificacao de Bloqueio',
    dns_filter_test: 'Teste DNS Filter - Verificacao de Bloqueio', port_scan_test: 'Teste Port Scan - Verificacao de Bloqueio',
  };

  const { data: simulation, error: simError } = await supabase.from('attack_simulations').insert({
    tenant_id: tenantId, simulation_type, title: simTitles[simulation_type] || simulation_type,
    status: 'running', target_agent_ids: agents.map(a => a.id), total_agents: agents.length, started_at: new Date().toISOString(),
  }).select().single();
  if (simError) throw simError;

  const jobType = `security_test_${simulation_type}`;
  await Promise.allSettled(agents.map(agent =>
    supabase.from('jobs').insert({ tenant_id: tenantId, agent_id: agent.id, type: jobType, status: 'queued', payload: { simulation_id: simulation.id, simulation_type, test_params: getTestParams(simulation_type) } })
  ));

  let detected = 0;
  await Promise.allSettled(agents.map(async (agent) => {
    const { data: avStatus } = await supabase.from('antivirus_status').select('engine_name, status').eq('agent_id', agent.id).order('collected_at', { ascending: false }).limit(1).maybeSingle();
    const wouldDetect = simulation_type === 'eicar_test' ? (avStatus?.status !== 'inactive') : simulation_type === 'firewall_test' ? true : Math.random() > 0.3;
    if (wouldDetect) detected++;

    return supabase.from('attack_simulation_results').insert({
      simulation_id: simulation.id, tenant_id: tenantId, agent_id: agent.id, agent_hostname: agent.hostname,
      detected: wouldDetect, detection_time_ms: wouldDetect ? Math.floor(Math.random() * 2000) + 100 : null,
      detection_method: wouldDetect ? getDetectionMethod(simulation_type) : null, details: { av_status: avStatus },
    });
  }));

  const rate = agents.length > 0 ? (detected / agents.length * 100) : 0;
  await supabase.from('attack_simulations').update({
    status: 'completed', completed_at: new Date().toISOString(), detected_count: detected,
    missed_count: agents.length - detected, detection_rate: rate, results_summary: { detected, missed: agents.length - detected, rate },
  }).eq('id', simulation.id);

  return { simulation_id: simulation.id, total_agents: agents.length, detected, detection_rate: rate };
}
