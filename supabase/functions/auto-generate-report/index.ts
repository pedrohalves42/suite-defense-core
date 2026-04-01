/**
 * auto-generate-report - Migrated to serveInternal
 * Called internally after job completion to generate reports
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const ReportPayloadSchema = z.object({
  tenant_id: z.string().uuid(),
  agent_id: z.string().uuid().optional(),
  agent_name: z.string().max(255).optional(),
  job_id: z.string().uuid().optional(),
  job_type: z.string().max(100).optional(),
  triggered_by: z.enum(['job_completion', 'scheduled', 'manual']),
});

interface ReportGenerationPayload {
  tenant_id: string;
  agent_id?: string;
  agent_name?: string;
  job_id?: string;
  job_type?: string;
  triggered_by: 'job_completion' | 'scheduled' | 'manual';
}

function calculateRiskScore(stats: Record<string, unknown>): { score: number; level: string } {
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

function generateCommercialSummary(stats: Record<string, unknown>, riskLevel: string, agentName: string, tenantName?: string): string {
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

serveInternal(async (_req, ctx) => {
  const { supabase, body } = ctx;

  const parsed = ReportPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { tenant_id, agent_id, agent_name, job_id, job_type, triggered_by } = parsed.data;

  logger.info('[auto-generate-report] Starting:', parsed.data);

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
    const softwareQuery = supabase.from('software_inventory').select('*').eq('tenant_id', tenant_id).order('last_seen_at', { ascending: false }).limit(100);
    if (agent_id) softwareQuery.eq('agent_id', agent_id);
    const { data: software } = await softwareQuery;
    statistics.total_software = software?.length || 0;
    reportData.software_inventory = software || [];
  }

  if (reportType === 'full_security' || reportType === 'vulnerabilities') {
    const vulnQuery = supabase.from('vulnerability_findings').select('*').eq('tenant_id', tenant_id).order('detected_at', { ascending: false }).limit(100);
    if (agent_id) vulnQuery.eq('agent_id', agent_id);
    const { data: vulns } = await vulnQuery;
    statistics.total_vulnerabilities = vulns?.length || 0;
    statistics.critical_vulnerabilities = vulns?.filter((v: Record<string, unknown>) => v.severity === 'critical').length || 0;
    statistics.high_vulnerabilities = vulns?.filter((v: Record<string, unknown>) => v.severity === 'high').length || 0;
    statistics.medium_vulnerabilities = vulns?.filter((v: Record<string, unknown>) => v.severity === 'medium').length || 0;
    reportData.vulnerabilities = vulns || [];
  }

  if (reportType === 'full_security' || reportType === 'antivirus') {
    const avQuery = supabase.from('antivirus_status').select('*').eq('tenant_id', tenant_id).order('collected_at', { ascending: false }).limit(50);
    if (agent_id) avQuery.eq('agent_id', agent_id);
    const { data: antivirus } = await avQuery;
    statistics.antivirus_engines = antivirus?.length || 0;
    statistics.threats_found = antivirus?.reduce((sum: number, av: { threats_found?: number }) => sum + (av.threats_found || 0), 0) || 0;
    reportData.antivirus_status = antivirus || [];
  }

  if (reportType === 'full_security' || reportType === 'web_activity') {
    const webQuery = supabase.from('agent_web_activity').select('*').eq('tenant_id', tenant_id).order('visited_at', { ascending: false }).limit(100);
    if (agent_id) webQuery.eq('agent_id', agent_id);
    const { data: webActivity } = await webQuery;
    const uniqueDomains = new Set(webActivity?.map((w: Record<string, unknown>) => w.domain) || []);
    statistics.unique_domains = uniqueDomains.size;
    statistics.malicious_scans = webActivity?.filter((w: Record<string, unknown>) => w.is_blocked).length || 0;
    statistics.blocked_sites = webActivity?.filter((w: Record<string, unknown>) => w.is_blocked).length || 0;
    reportData.web_activity = webActivity || [];
  }

  const { score: riskScore, level: riskLevel } = calculateRiskScore(statistics);
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

  logger.info('[auto-generate-report] Report generated:', { report_id: report.id, risk_score: riskScore, commercial_priority: commercialPriority });

  return {
    success: true, report_id: report.id, report_type: reportType, risk_score: riskScore,
    risk_level: riskLevel, commercial_priority: commercialPriority, next_action: nextAction,
  };
});
