/**
 * report-scheduled.ts — Inlined scheduled/cron report handlers (Phase 1D)
 * 
 * Handlers: generate-executive-report, generate-weekly-report, auto-generate-report, scheduled-report-generator
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { callAISimple } from '../../_shared/ai-provider-helper.ts';
import { fetchWithTimeout } from '../../_shared/fetch-with-timeout.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

// ===================== EXECUTIVE REPORT =====================

const ExecReportSchema = z.object({
  tenantId: z.string().uuid().optional(),
  date: z.string().max(30).optional(),
  source: z.string().max(50).optional(),
}).optional().default({});

interface RiskDelta {
  tenantId: string; tenantName: string; snapshotDate: string;
  riskScoreStart: number | null; riskScoreEnd: number | null; delta: number;
  threatsBlocked: number; incidentsPrevented: number;
  actionsExecuted: number; actionsPendingApproval: number;
  keyEvents: Array<{ type: string; severity: string; description: string; timestamp: string }>;
}

async function generateExecutiveSummaryAI(data: RiskDelta): Promise<string> {
  try {
    const prompt = `Voce e um especialista em seguranca cibernetica. Gere um resumo executivo CURTO (maximo 3 frases) em portugues brasileiro sobre a situacao de seguranca do dia.

Dados do dia:
- Score de risco inicio do dia: ${data.riskScoreStart ?? 'Nao disponivel'}
- Score de risco fim do dia: ${data.riskScoreEnd ?? 'Nao disponivel'}
- Variacao: ${data.delta > 0 ? '+' : ''}${data.delta} pontos
- Ameacas bloqueadas: ${data.threatsBlocked}
- Incidentes prevenidos: ${data.incidentsPrevented}
- Acoes de seguranca executadas: ${data.actionsExecuted}
- Acoes aguardando aprovacao: ${data.actionsPendingApproval}
${data.keyEvents.length > 0 ? `- Eventos principais: ${data.keyEvents.slice(0, 3).map(e => e.description).join('; ')}` : ''}

Regras:
1. Seja direto e objetivo
2. Foque no impacto para o negocio
3. Use linguagem simples (para donos de empresa)
4. Se o score melhorou, destaque. Se piorou, explique o risco.
5. Nao use jargoes tecnicos`;

    const aiResult = await callAISimple(
      'Voce e um especialista em seguranca cibernetica corporativa.',
      prompt,
      { maxTokens: 200, functionName: 'generate-executive-report', tenantId: data.tenantId }
    );

    if (aiResult.success && aiResult.content) return aiResult.content;
    logger.warn('[report:executive] AI call failed, using fallback:', aiResult.error);
  } catch (error) {
    logger.error('AI generation failed:', error);
  }
  return generateFallbackSummary(data);
}

function generateFallbackSummary(data: RiskDelta): string {
  const parts: string[] = [];
  if (data.delta < 0) parts.push(`Seu nivel de risco melhorou ${Math.abs(data.delta)} pontos hoje.`);
  else if (data.delta > 0) parts.push(`Atencao: seu nivel de risco aumentou ${data.delta} pontos.`);
  else parts.push('Seu nivel de risco permaneceu estavel hoje.');
  if (data.threatsBlocked > 0) parts.push(`${data.threatsBlocked} ameaca${data.threatsBlocked > 1 ? 's foram bloqueadas' : ' foi bloqueada'} automaticamente.`);
  if (data.actionsExecuted > 0) parts.push(`${data.actionsExecuted} acao${data.actionsExecuted > 1 ? 'oes de protecao foram executadas' : ' de protecao foi executada'}.`);
  if (data.actionsPendingApproval > 0) parts.push(`${data.actionsPendingApproval} acao${data.actionsPendingApproval > 1 ? 'oes aguardam' : ' aguarda'} sua aprovacao.`);
  return parts.join(' ');
}

function estimateCostAvoided(data: RiskDelta): number {
  return (data.incidentsPrevented * 10000) + (data.threatsBlocked * 500);
}

export async function handleExecutiveReport(
  supabase: any, requestId: string, payload: Record<string, unknown>
): Promise<unknown> {
  const startedAt = Date.now();
  const parsed = ExecReportSchema.safeParse(payload ?? {});
  if (!parsed.success) return { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors };

  const validBody = parsed.data ?? {};
  const tenantId = validBody.tenantId;
  const targetDate = validBody.date || new Date().toISOString().split('T')[0];

  let tenantIds: string[] = [];
  if (tenantId) {
    tenantIds = [tenantId];
  } else {
    const { data: tenants } = await supabase.from('tenants').select('id').eq('is_active', true);
    tenantIds = tenants?.map(t => t.id) || [];
  }

  const results: Array<{ tenantId: string; success: boolean; summary?: string; error?: string }> = [];

  for (const tid of tenantIds) {
    try {
      const { data: tenant } = await supabase.from('tenants').select('name').eq('id', tid).single();
      const dayStart = `${targetDate}T00:00:00Z`;
      const dayEnd = `${targetDate}T23:59:59Z`;

      const { data: riskScores } = await supabase.from('risk_scores').select('score, created_at').eq('tenant_id', tid).gte('created_at', dayStart).lte('created_at', dayEnd).order('created_at', { ascending: true });
      const scoreStart = riskScores?.[0]?.score || null;
      const scoreEnd = riskScores?.[riskScores.length - 1]?.score || null;

      const { data: securityEvents } = await supabase.from('security_events').select('severity, title, created_at').eq('tenant_id', tid).gte('created_at', dayStart).lte('created_at', dayEnd);
      const { data: playbookExecs } = await supabase.from('playbook_executions').select('status').eq('tenant_id', tid).gte('triggered_at', dayStart).lte('triggered_at', dayEnd);
      const { data: approvalRequests } = await supabase.from('approval_requests').select('status').eq('tenant_id', tid).gte('created_at', dayStart).lte('created_at', dayEnd);
      const { data: blockedAttempts } = await supabase.from('policy_enforcement_logs').select('id').eq('tenant_id', tid).eq('blocked', true).gte('created_at', dayStart).lte('created_at', dayEnd);

      const threatsBlocked = blockedAttempts?.length || 0;
      const incidentsPrevented = securityEvents?.filter(e => e.severity === 'critical' || e.severity === 'high').length || 0;
      const actionsExecuted = playbookExecs?.filter(e => e.status === 'completed').length || 0;
      const actionsPending = approvalRequests?.filter(e => e.status === 'pending').length || 0;

      const keyEvents = (securityEvents || [])
        .filter(e => e.severity === 'high' || e.severity === 'critical')
        .slice(0, 5)
        .map(e => ({ type: 'security_event', severity: e.severity, description: e.title, timestamp: e.created_at }));

      const riskData: RiskDelta = {
        tenantId: tid, tenantName: tenant?.name || 'Unknown', snapshotDate: targetDate,
        riskScoreStart: scoreStart, riskScoreEnd: scoreEnd, delta: (scoreEnd || 0) - (scoreStart || 0),
        threatsBlocked, incidentsPrevented, actionsExecuted, actionsPendingApproval: actionsPending, keyEvents,
      };

      const summary = await generateExecutiveSummaryAI(riskData);
      const costAvoided = estimateCostAvoided(riskData);

      const { error: upsertError } = await supabase.from('risk_delta_snapshots').upsert({
        tenant_id: tid, snapshot_date: targetDate, risk_score_start: scoreStart, risk_score_end: scoreEnd,
        threats_blocked: threatsBlocked, incidents_prevented: incidentsPrevented,
        actions_executed: actionsExecuted, actions_pending_approval: actionsPending,
        estimated_cost_avoided: costAvoided, executive_summary: summary, key_events: keyEvents,
      }, { onConflict: 'tenant_id,snapshot_date' });

      if (upsertError) {
        logger.error(`Failed to upsert snapshot for tenant ${tid}:`, upsertError);
        results.push({ tenantId: tid, success: false, error: upsertError.message });
      } else {
        results.push({ tenantId: tid, success: true, summary });
      }
    } catch (error) {
      logger.error(`Error processing tenant ${tid}:`, error);
      results.push({ tenantId: tid, success: false, error: String(error) });
    }
  }

  const result = { success: true, date: targetDate, processed: results.length, results };

  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'generate-executive-report', p_success: true,
    p_duration_ms: Date.now() - startedAt, p_result: result,
    p_processed_count: results.filter(r => r.success).length, p_job_source: 'cron',
  });

  return result;
}

// ===================== WEEKLY REPORT =====================

interface WeeklyMetrics {
  playbooks_executed: number; playbooks_auto_executed: number; playbooks_pending: number;
  vulnerabilities_detected: { critical: number; high: number; medium: number; low: number };
  web_policies_enforced: number; blocked_attempts: number;
  approval_requests: { total: number; approved: number; rejected: number; expired: number };
  agents: { total: number; active: number; offline: number; isolated: number };
  security_events: { total: number; critical: number; high: number };
  risk_score: { current: number; previous: number; trend: 'up' | 'down' | 'stable' };
}

function generateWeeklySummary(metrics: WeeklyMetrics, tenantName: string): string {
  const criticalVulns = metrics.vulnerabilities_detected.critical;
  const highVulns = metrics.vulnerabilities_detected.high;
  const protectionRate = metrics.agents.total > 0 ? Math.round((metrics.agents.active / metrics.agents.total) * 100) : 0;

  let status = '✅ SEGURO';
  if (criticalVulns > 0 || metrics.security_events.critical > 5) status = '🔴 ATENCAO CRITICA';
  else if (highVulns > 3 || metrics.agents.offline > 5) status = '🟡 REQUER ATENCAO';

  return `
📊 RELATORIO SEMANAL DE SEGURANCA - ${tenantName}

${status}

📋 RESUMO EXECUTIVO:

🔄 Playbooks Executados: ${metrics.playbooks_executed} (${metrics.playbooks_auto_executed} automaticos)
🛡 Vulnerabilidades Criticas: ${criticalVulns} | Altas: ${highVulns}
🚫 Tentativas Bloqueadas: ${metrics.blocked_attempts}
📈 Taxa de Protecao: ${protectionRate}% (${metrics.agents.active}/${metrics.agents.total} agentes)

✅ APROVACOES:
✔ Aprovadas: ${metrics.approval_requests.approved}
✘ Rejeitadas: ${metrics.approval_requests.rejected}
⏰ Expiradas: ${metrics.approval_requests.expired}

📉 TENDENCIA DE RISCO:
🎯 Score Atual: ${metrics.risk_score.current}
📊 Score Anterior: ${metrics.risk_score.previous}
📈 Tendencia: ${metrics.risk_score.trend === 'up' ? '⬆️ Aumentou' : metrics.risk_score.trend === 'down' ? '⬇️ Diminuiu' : '➡️ Estavel'}

---
Gerado automaticamente pelo CyberShield Security Platform
  `.trim();
}

const FETCH_TIMEOUT_MS = 45000;

export async function handleWeeklyReport(
  supabase: any, requestId: string, _payload: Record<string, unknown>
): Promise<unknown> {
  const startedAt = Date.now();

  const { data: tenants, error: tenantsError } = await supabase.from('tenants').select('id, name');
  if (tenantsError) throw tenantsError;

  const reports: Array<{ tenant: string; report_id?: string }> = [];
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7); weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(); weekEnd.setHours(23, 59, 59, 999);

  for (const tenant of tenants || []) {
    logger.info(`[report:weekly] Processing tenant: ${tenant.name}`);

    const { data: executions } = await supabase.from('playbook_executions').select('id, status, auto_executed, dry_run').eq('tenant_id', tenant.id).gte('created_at', weekStart.toISOString()).lte('created_at', weekEnd.toISOString());
    const playbooksExecuted = executions?.length || 0;
    const playbooksAutoExecuted = executions?.filter(e => e.auto_executed && !e.dry_run).length || 0;
    const playbooksPending = executions?.filter(e => e.status === 'pending').length || 0;

    const { data: vulns } = await supabase.from('vuln_findings').select('severity').eq('tenant_id', tenant.id).gte('created_at', weekStart.toISOString());
    const vulnStats = {
      critical: vulns?.filter(v => v.severity === 'critical').length || 0,
      high: vulns?.filter(v => v.severity === 'high').length || 0,
      medium: vulns?.filter(v => v.severity === 'medium').length || 0,
      low: vulns?.filter(v => v.severity === 'low').length || 0,
    };

    const { count: blockedCount } = await supabase.from('blocked_access_attempts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).gte('created_at', weekStart.toISOString());
    const { count: webBlockedCount } = await supabase.from('agent_web_activity').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_blocked', true).gte('visited_at', weekStart.toISOString());
    const { data: approvals } = await supabase.from('approval_requests').select('id, status').eq('tenant_id', tenant.id).gte('created_at', weekStart.toISOString());

    const approvalStats = {
      total: approvals?.length || 0,
      approved: approvals?.filter(a => a.status === 'approved').length || 0,
      rejected: approvals?.filter(a => a.status === 'rejected').length || 0,
      expired: approvals?.filter(a => a.status === 'expired').length || 0,
    };

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const { data: agents } = await supabase.from('agents').select('id, status, last_heartbeat, is_isolated').eq('tenant_id', tenant.id);

    const agentStats = {
      total: agents?.length || 0,
      active: agents?.filter(a => a.status === 'active' && a.last_heartbeat && new Date(a.last_heartbeat) > thirtyMinutesAgo).length || 0,
      offline: agents?.filter(a => !a.last_heartbeat || new Date(a.last_heartbeat) <= thirtyMinutesAgo).length || 0,
      isolated: agents?.filter(a => a.is_isolated).length || 0,
    };

    const { data: secEvents } = await supabase.from('security_logs').select('severity').eq('tenant_id', tenant.id).gte('created_at', weekStart.toISOString());
    const secEventStats = {
      total: secEvents?.length || 0,
      critical: secEvents?.filter(e => e.severity === 'critical').length || 0,
      high: secEvents?.filter(e => e.severity === 'high').length || 0,
    };

    const { data: currentScore } = await supabase.rpc('get_tenant_risk_score', { p_tenant_id: tenant.id });

    const metrics: WeeklyMetrics = {
      playbooks_executed: playbooksExecuted, playbooks_auto_executed: playbooksAutoExecuted,
      playbooks_pending: playbooksPending, vulnerabilities_detected: vulnStats,
      web_policies_enforced: webBlockedCount || 0, blocked_attempts: blockedCount || 0,
      approval_requests: approvalStats, agents: agentStats, security_events: secEventStats,
      risk_score: {
        current: currentScore?.risk_score || 50, previous: currentScore?.previous_score || 50,
        trend: currentScore?.risk_score > currentScore?.previous_score ? 'up' : currentScore?.risk_score < currentScore?.previous_score ? 'down' : 'stable',
      },
    };

    const executiveSummary = generateWeeklySummary(metrics, tenant.name);

    const { data: report, error: reportError } = await supabase.from('weekly_security_reports').upsert({
      tenant_id: tenant.id, week_start: weekStart.toISOString().split('T')[0],
      week_end: weekEnd.toISOString().split('T')[0], metrics, executive_summary: executiveSummary,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,week_start' }).select().single();

    if (reportError) {
      logger.error(`[report:weekly] Error saving report for ${tenant.name}:`, reportError);
      continue;
    }

    reports.push({ tenant: tenant.name, report_id: report?.id });

    try {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
      const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');

      await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/notification-dispatcher`, {
        timeoutMs: FETCH_TIMEOUT_MS, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET || '' },
        body: JSON.stringify({
          channel: 'in_app', type: 'report', tenant_id: tenant.id,
          subject: `Relatorio Semanal de Seguranca - ${tenant.name}`, message: executiveSummary, severity: 'info',
          metadata: { week_start: weekStart.toISOString(), week_end: weekEnd.toISOString(), metrics_summary: { playbooks: metrics.playbooks_executed, vulns: metrics.vulnerabilities_detected.critical + metrics.vulnerabilities_detected.high, blocked: metrics.blocked_attempts, agents_protected: metrics.agents.active } },
        }),
      });
    } catch (emailError) {
      logger.error(`[report:weekly] Notification error for ${tenant.name}:`, emailError);
    }
  }

  const durationMs = Date.now() - startedAt;

  try {
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'generate-weekly-report', p_success: true, p_duration_ms: durationMs,
      p_result: { reports_generated: reports.length, tenants: reports.map(r => r.tenant) },
      p_processed_count: reports.length, p_job_source: 'cron',
    });
  } catch (logErr) {
    logger.error('[report:weekly] Failed to log job run:', logErr);
  }

  return { success: true, reports_generated: reports.length, reports, period: { start: weekStart.toISOString(), end: weekEnd.toISOString() }, duration_ms: durationMs };
}

// ===================== AUTO-GENERATE REPORT =====================

const ReportPayloadSchema = z.object({
  tenant_id: z.string().uuid(),
  agent_id: z.string().uuid().optional(),
  agent_name: z.string().max(255).optional(),
  job_id: z.string().uuid().optional(),
  job_type: z.string().max(100).optional(),
  triggered_by: z.enum(['job_completion', 'scheduled', 'manual']),
});

function calculateAutoRiskScore(stats: Record<string, unknown>): { score: number; level: string } {
  let score = 0;
  score += Math.min(((stats.critical_vulnerabilities as number) || 0) * 30, 90);
  score += Math.min(((stats.high_vulnerabilities as number) || 0) * 15, 45);
  score += Math.min(((stats.medium_vulnerabilities as number) || 0) * 5, 25);
  score += Math.min(((stats.threats_found as number) || 0) * 20, 60);
  score += Math.min(((stats.malicious_scans as number) || 0) * 15, 45);
  score = Math.min(score, 100);
  let level = 'BAIXO';
  if (score >= 70) level = 'CRITICO';
  else if (score >= 50) level = 'ALTO';
  else if (score >= 30) level = 'MEDIO';
  return { score, level };
}

function getCommercialPriority(riskScore: number): 'high' | 'medium' | 'low' {
  if (riskScore >= 60) return 'high';
  if (riskScore >= 30) return 'medium';
  return 'low';
}

function getNextAction(priority: 'high' | 'medium' | 'low'): string {
  if (priority === 'high') return 'send_whatsapp';
  if (priority === 'medium') return 'schedule_call';
  return 'await_client';
}

function generateCommercialSummary(stats: Record<string, unknown>, riskLevel: string, agentName: string, _tenantName?: string): string {
  const issues: string[] = [];
  if (((stats.critical_vulnerabilities as number) || 0) > 0) issues.push(`${stats.critical_vulnerabilities} vulnerabilidade(s) critica(s)`);
  if (((stats.high_vulnerabilities as number) || 0) > 0) issues.push(`${stats.high_vulnerabilities} vulnerabilidade(s) de alto risco`);
  if (((stats.threats_found as number) || 0) > 0) issues.push(`${stats.threats_found} ameaca(s) detectada(s)`);
  if (((stats.malicious_scans as number) || 0) > 0) issues.push(`${stats.malicious_scans} acesso(s) suspeito(s)`);
  if (((stats.blocked_sites as number) || 0) > 0) issues.push(`${stats.blocked_sites} site(s) bloqueado(s)`);
  if (((stats.outdated_software as number) || 0) > 0) issues.push(`${stats.outdated_software} software(s) desatualizado(s)`);
  if (issues.length === 0) return `[OK] Diagnostico Concluido - ${agentName} - Ambiente Seguro`;
  return `Diagnostico ${riskLevel} - ${agentName}: ${issues.join(', ')}`;
}

export async function handleAutoGenerateReport(
  supabase: any, requestId: string, payload: Record<string, unknown>
): Promise<unknown> {
  const parsed = ReportPayloadSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors };

  const { tenant_id, agent_id, agent_name, job_id, job_type, triggered_by } = parsed.data;
  logger.info('[report:auto] Starting:', parsed.data);

  const { data: tenantData } = await supabase.from('tenants').select('name').eq('id', tenant_id).single();
  const tenantName = tenantData?.name;

  let reportType = 'full_security';
  if (job_type === 'software_inventory_collect') reportType = 'software_inventory';
  else if (job_type === 'light_vuln_scan') reportType = 'vulnerabilities';
  else if (job_type === 'collect_antivirus_status') reportType = 'antivirus';
  else if (job_type === 'collect_web_activity') reportType = 'web_activity';

  const statistics: Record<string, unknown> = {};
  const reportData: Record<string, unknown> = {};

  const { count: agentCount } = await supabase.from('agents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant_id).eq('status', 'active');
  statistics.total_agents = agentCount || 0;

  if (reportType === 'full_security' || reportType === 'software_inventory') {
    const softwareQuery = supabase.from('software_inventory').select('id, agent_id, name, version, publisher, install_date, last_seen_at, tenant_id').eq('tenant_id', tenant_id).order('last_seen_at', { ascending: false }).limit(100);
    if (agent_id) softwareQuery.eq('agent_id', agent_id);
    const { data: software } = await softwareQuery;
    statistics.total_software = software?.length || 0;
    reportData.software_inventory = software || [];
  }

  if (reportType === 'full_security' || reportType === 'vulnerabilities') {
    const vulnQuery = supabase.from('vulnerability_findings').select('id, agent_id, cve_id, severity, status, software_name, software_version, detected_at, tenant_id').eq('tenant_id', tenant_id).order('detected_at', { ascending: false }).limit(100);
    if (agent_id) vulnQuery.eq('agent_id', agent_id);
    const { data: vulns } = await vulnQuery;
    statistics.total_vulnerabilities = vulns?.length || 0;
    statistics.critical_vulnerabilities = vulns?.filter((v: Record<string, unknown>) => v.severity === 'critical').length || 0;
    statistics.high_vulnerabilities = vulns?.filter((v: Record<string, unknown>) => v.severity === 'high').length || 0;
    statistics.medium_vulnerabilities = vulns?.filter((v: Record<string, unknown>) => v.severity === 'medium').length || 0;
    reportData.vulnerabilities = vulns || [];
  }

  if (reportType === 'full_security' || reportType === 'antivirus') {
    const avQuery = supabase.from('antivirus_status').select('id, agent_id, engine_name, engine_version, definitions_date, real_time_protection, threats_found, collected_at, tenant_id').eq('tenant_id', tenant_id).order('collected_at', { ascending: false }).limit(50);
    if (agent_id) avQuery.eq('agent_id', agent_id);
    const { data: antivirus } = await avQuery;
    statistics.antivirus_engines = antivirus?.length || 0;
    statistics.threats_found = antivirus?.reduce((sum: number, av: { threats_found?: number }) => sum + (av.threats_found || 0), 0) || 0;
    reportData.antivirus_status = antivirus || [];
  }

  if (reportType === 'full_security' || reportType === 'web_activity') {
    const webQuery = supabase.from('agent_web_activity').select('id, agent_id, domain, url, title, visited_at, is_blocked, category, tenant_id').eq('tenant_id', tenant_id).order('visited_at', { ascending: false }).limit(100);
    if (agent_id) webQuery.eq('agent_id', agent_id);
    const { data: webActivity } = await webQuery;
    const uniqueDomains = new Set(webActivity?.map((w: Record<string, unknown>) => w.domain) || []);
    statistics.unique_domains = uniqueDomains.size;
    statistics.malicious_scans = webActivity?.filter((w: Record<string, unknown>) => w.is_blocked).length || 0;
    statistics.blocked_sites = webActivity?.filter((w: Record<string, unknown>) => w.is_blocked).length || 0;
    reportData.web_activity = webActivity || [];
  }

  const { score: riskScore, level: riskLevel } = calculateAutoRiskScore(statistics);
  const commercialPriority = getCommercialPriority(riskScore);
  const nextAction = getNextAction(commercialPriority);
  const agentLabel = agent_name || 'Todos os Agentes';
  const commercialSummary = generateCommercialSummary(statistics, riskLevel, agentLabel, tenantName);

  const reportTypeLabels: Record<string, string> = {
    full_security: 'Relatorio de Seguranca Completo', software_inventory: 'Inventario de Software',
    vulnerabilities: 'Analise de Vulnerabilidades', antivirus: 'Status do Antivirus', web_activity: 'Atividade Web',
  };
  const title = `${reportTypeLabels[reportType]} - ${agentLabel}`;

  const { data: report, error: insertError } = await supabase.from('generated_reports').insert({
    tenant_id, agent_id, agent_name, report_type: reportType, title, risk_score: riskScore,
    risk_level: riskLevel, statistics, report_data: reportData, status: 'generated', triggered_by, job_id,
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    sales_status: 'open', commercial_priority: commercialPriority, next_action: nextAction, commercial_summary: commercialSummary,
  }).select().single();

  if (insertError) throw insertError;

  logger.info('[report:auto] Report generated:', { report_id: report.id, risk_score: riskScore, commercial_priority: commercialPriority });

  return {
    success: true, report_id: report.id, report_type: reportType, risk_score: riskScore,
    risk_level: riskLevel, commercial_priority: commercialPriority, next_action: nextAction,
  };
}

// ===================== SCHEDULED REPORT GENERATOR =====================

interface PlanFrequency { [key: string]: number | null }

const PLAN_FREQUENCIES: PlanFrequency = {
  free: null, starter: 30, basico: 30, completo: 30, avancado: 30,
  pro: 14, business: 14, scale: 7, enterprise: 7,
};

async function generateTenantReport(supabase: any, tenantId: string, triggerType: string): Promise<void> {
  logger.info(`Generating ${triggerType} report for tenant ${tenantId}`);

  const { data: agents } = await supabase.from("agents").select("id, agent_name").eq("tenant_id", tenantId).eq("status", "active");
  if (!agents || agents.length === 0) {
    logger.info(`No active agents for tenant ${tenantId}, skipping report`);
    return;
  }

  const [{ data: softwareStats }, { data: vulnStats }, { data: avStats }, { data: webStats }] = await Promise.all([
    supabase.from("software_inventory").select("id").eq("tenant_id", tenantId),
    supabase.from("vuln_findings").select("severity").eq("tenant_id", tenantId),
    supabase.from("antivirus_status").select("threats_found").eq("tenant_id", tenantId),
    supabase.from("agent_web_activity").select("is_blocked").eq("tenant_id", tenantId),
  ]);

  const criticalVulns = vulnStats?.filter((v: Record<string, unknown>) => v.severity === "critical").length || 0;
  const highVulns = vulnStats?.filter((v: Record<string, unknown>) => v.severity === "high").length || 0;
  const totalThreats = avStats?.reduce((sum: number, a: { threats_found?: number }) => sum + (a.threats_found || 0), 0) || 0;
  const blockedSites = webStats?.filter((w: Record<string, unknown>) => w.is_blocked).length || 0;

  const statistics = {
    total_agents: agents.length, total_software: softwareStats?.length || 0,
    critical_vulnerabilities: criticalVulns, high_vulnerabilities: highVulns,
    total_threats: totalThreats, blocked_websites: blockedSites,
  };

  const riskScore = Math.min(100, criticalVulns * 25 + highVulns * 10 + totalThreats * 15 + blockedSites * 5);
  const riskLevel = riskScore >= 70 ? "CRITICO" : riskScore >= 50 ? "ALTO" : riskScore >= 25 ? "MEDIO" : "BAIXO";
  const commercialPriority = riskScore >= 60 ? "high" : riskScore >= 30 ? "medium" : "low";
  const nextAction = commercialPriority === "high" ? "schedule_call" : commercialPriority === "medium" ? "send_whatsapp" : "await_client";

  const { data: tenantInfo } = await supabase.from("tenants").select("name").eq("id", tenantId).single();

  const issues: string[] = [];
  if (criticalVulns > 0) issues.push(`${criticalVulns} vulnerabilidade(s) critica(s)`);
  if (highVulns > 0) issues.push(`${highVulns} vulnerabilidade(s) alta(s)`);
  if (totalThreats > 0) issues.push(`${totalThreats} ameaca(s) detectada(s)`);
  if (blockedSites > 0) issues.push(`${blockedSites} site(s) suspeito(s) acessado(s)`);

  const issuesText = issues.length > 0 ? issues.join(", ") : "ambiente estavel";
  const urgencyText = riskLevel === "CRITICO" ? "Requer atencao imediata!" : riskLevel === "ALTO" ? "Recomendamos analise em ate 48h." : riskLevel === "MEDIO" ? "Sugerimos revisao na proxima semana." : "Situacao sob controle.";

  const commercialSummary = `🛡 Laudo Periodico - ${tenantInfo?.name || "Cliente"}\n\n` +
    `✅ ${agents.length} computador(es) analisado(s)\n` +
    `⚠️ Encontrado: ${issuesText}\n` +
    `📊 Nivel de Risco: ${riskLevel} (Score: ${riskScore}/100)\n\n` +
    `${urgencyText}\n\nPosso explicar os detalhes em 10 minutos?`;

  const { data: report, error: reportError } = await supabase.from("generated_reports").insert({
    tenant_id: tenantId, report_type: "full_security",
    title: `Laudo Consolidado - ${new Date().toLocaleDateString("pt-BR")}`,
    risk_score: riskScore, risk_level: riskLevel, statistics,
    report_data: { agents: agents.map((a: Record<string, unknown>) => a.agent_name), generated_at: new Date().toISOString(), trigger: triggerType },
    status: "generated", triggered_by: "scheduled", sales_status: "open",
    commercial_priority: commercialPriority, next_action: nextAction, commercial_summary: commercialSummary,
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  }).select().single();

  if (reportError) { logger.error("Error creating report:", reportError); throw reportError; }
  logger.info(`Created report ${report.id} for tenant ${tenantId}`);

  const { error: execError } = await supabase.from("report_executions").insert({
    tenant_id: tenantId, scheduled_report_id: null, report_type: "full_security",
    status: "completed", started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    metadata: { trigger: triggerType, report_id: report.id, agents_count: agents.length, risk_score: riskScore },
  });
  if (execError) logger.error("Error logging report execution:", execError);

  if (commercialPriority === "high") {
    await supabase.from("notification_queue").insert({
      tenant_id: tenantId, report_id: report.id, channel: "email", priority: "high",
      message_content: commercialSummary, scheduled_for: new Date().toISOString(),
    });
    logger.info(`Queued high-priority notification for report ${report.id}`);
  }
}

export async function handleScheduledReportGenerator(
  supabase: any, requestId: string, _payload: Record<string, unknown>
): Promise<unknown> {
  const startedAt = Date.now();

  const { data: tenants, error: tenantsError } = await supabase
    .from("tenant_subscriptions")
    .select(`tenant_id, status, plan_id, trial_end, subscription_plans!inner ( name )`)
    .in("status", ["active", "trialing"]);

  if (tenantsError) { logger.error("Error fetching tenants:", tenantsError); throw tenantsError; }
  if (!tenants || tenants.length === 0) return { success: true, message: "No active tenants found", generated: 0 };

  logger.info(`Found ${tenants.length} active tenants`);

  let generatedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  for (const tenant of tenants) {
    try {
      const planName = (tenant.subscription_plans as Record<string, unknown>)?.name || "free";
      const frequencyDays = PLAN_FREQUENCIES[planName] || PLAN_FREQUENCIES.starter;

      if (planName === "free" || tenant.status === "trialing") {
        const { data: firstAgent } = await supabase.from("agents").select("enrolled_at").eq("tenant_id", tenant.tenant_id).order("enrolled_at", { ascending: true }).limit(1).single();
        if (firstAgent) {
          const hoursSinceEnroll = (Date.now() - new Date(firstAgent.enrolled_at).getTime()) / (1000 * 60 * 60);
          const { data: existingTrialReport } = await supabase.from("generated_reports").select("id").eq("tenant_id", tenant.tenant_id).eq("triggered_by", "scheduled").limit(1).single();
          if (hoursSinceEnroll >= 48 && !existingTrialReport) {
            await generateTenantReport(supabase, tenant.tenant_id, "trial_48h");
            generatedCount++;
            continue;
          }
        }
        skippedCount++;
        continue;
      }

      if (frequencyDays) {
        const { data: lastReport } = await supabase.from("generated_reports").select("created_at").eq("tenant_id", tenant.tenant_id).eq("triggered_by", "scheduled").order("created_at", { ascending: false }).limit(1).single();
        const lastReportDate = lastReport ? new Date(lastReport.created_at) : null;
        const daysSinceLastReport = lastReportDate ? (Date.now() - lastReportDate.getTime()) / (1000 * 60 * 60 * 24) : frequencyDays + 1;

        if (daysSinceLastReport >= frequencyDays) {
          await generateTenantReport(supabase, tenant.tenant_id, "scheduled_periodic");
          generatedCount++;
        } else {
          skippedCount++;
        }
      }
    } catch (tenantError) {
      const msg = tenantError instanceof Error ? tenantError.message : String(tenantError);
      logger.error(`Error processing tenant ${tenant.tenant_id}:`, tenantError);
      errors.push(`${tenant.tenant_id}: ${msg}`);
    }
  }

  logger.info(`Scheduled report generation complete: generated=${generatedCount}, skipped=${skippedCount}`);

  const result = { success: true, processed: tenants.length, generated: generatedCount, skipped: skippedCount, errors: errors.length > 0 ? errors : undefined };

  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'scheduled-report-generator', p_success: true,
    p_duration_ms: Date.now() - startedAt, p_result: result,
    p_processed_count: generatedCount, p_job_source: 'cron',
  });

  return result;
}
