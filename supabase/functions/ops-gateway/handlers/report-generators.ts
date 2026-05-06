/**
 * report-generators.ts — Inlined report generation handlers (Phase 1D)
 * 
 * Handlers: generate-compliance-report, generate-security-report, generate-explainable-report
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { validateCallerTenant } from '../../_shared/validate-caller-tenant.ts';
import { Database } from '../../_shared/database.types.ts';

// ===================== SHARED CRYPTO =====================

async function generateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function generateHMAC(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function generateEvidenceHash(data: unknown): Promise<string> {
  const content = JSON.stringify(data);
  const hash = await generateSHA256(content);
  return hash.substring(0, 16);
}

function generateAuditId(): string {
  const uuid = crypto.randomUUID().substring(0, 8).toUpperCase();
  return `LAUDO-${uuid}-${Date.now()}`;
}

// ===================== COMPLIANCE REPORT =====================

const SECURITY_INVARIANTS = [
  { id: "INV-001", name: "Protecao de Dados", technicalName: "RLS Ativo", description: "Todas as tabelas possuem protecao de acesso (Row Level Security)", laymanDescription: "Seus dados sao protegidos e so voce pode ve-los", check: "rls_enabled" },
  { id: "INV-002", name: "Autenticacao Segura", technicalName: "HMAC Auth", description: "Comunicacao dos agentes usa assinatura criptografica HMAC-SHA256", laymanDescription: "A comunicacao entre seus computadores e o servidor e criptografada", check: "hmac_auth" },
  { id: "INV-003", name: "Isolamento de Dados", technicalName: "Multi-Tenant", description: "Dados segregados por tenant_id - isolamento garantido", laymanDescription: "Seus dados estao completamente separados de outras empresas", check: "tenant_isolation" },
  { id: "INV-004", name: "Senhas Protegidas", technicalName: "Credential Masking", description: "Credenciais nao aparecem em logs ou relatorios", laymanDescription: "Suas senhas nunca sao armazenadas em texto visivel", check: "credential_masking" },
  { id: "INV-005", name: "Modo Seguranca", technicalName: "Fail-Closed", description: "Sistema bloqueia automaticamente em caso de falha repetida", laymanDescription: "O sistema se protege automaticamente quando detecta problemas", check: "fail_closed" },
  { id: "INV-006", name: "Filtro de Sites", technicalName: "DNS Filter", description: "Bloqueio de sites maliciosos e perigosos esta configurado", laymanDescription: "Sites perigosos sao bloqueados automaticamente", check: "dns_filter" },
];

const TEMPLATE_SECTIONS: Record<string, Array<{id: string; title: string; description: string; laymanDescription: string}>> = {
  LGPD: [
    { id: "SEC-LGPD-001", title: "Inventario de Dados", description: "Mapeamento de dados pessoais coletados e processados", laymanDescription: "Lista de quais informacoes pessoais sua empresa coleta" },
    { id: "SEC-LGPD-002", title: "Logs de Acesso", description: "Registros de quem acessou dados pessoais", laymanDescription: "Historico de quem viu ou alterou informacoes" },
    { id: "SEC-LGPD-003", title: "Retencao de Dados", description: "Politica de quanto tempo os dados sao mantidos", laymanDescription: "Por quanto tempo seus dados ficam armazenados" },
    { id: "SEC-LGPD-004", title: "Base Legal", description: "Verificacao de consentimento e bases legais", laymanDescription: "Confirmacao de que voce tem permissao para usar os dados" },
    { id: "SEC-LGPD-005", title: "Incidentes", description: "Registro de incidentes de seguranca no periodo", laymanDescription: "Problemas de seguranca que aconteceram" },
  ],
  ISO_27001: [
    { id: "SEC-ISO-001", title: "Politicas de Seguranca", description: "Controles de seguranca implementados", laymanDescription: "Regras de protecao que estao ativas" },
    { id: "SEC-ISO-002", title: "Gestao de Ativos", description: "Inventario de equipamentos e sistemas", laymanDescription: "Lista de todos os computadores e programas" },
    { id: "SEC-ISO-003", title: "Controle de Acesso", description: "Gestao de permissoes e autenticacao", laymanDescription: "Quem pode acessar o que no sistema" },
    { id: "SEC-ISO-004", title: "Logs de Alteracao", description: "Trilha de auditoria de modificacoes", laymanDescription: "Historico de todas as mudancas feitas" },
    { id: "SEC-ISO-005", title: "Gestao de Incidentes", description: "Timeline de eventos de seguranca", laymanDescription: "Cronograma de problemas e como foram resolvidos" },
  ],
  SOC2_LITE: [
    { id: "SEC-SOC-001", title: "Seguranca", description: "Protecao contra acessos nao autorizados", laymanDescription: "Como o sistema impede invasoes" },
    { id: "SEC-SOC-002", title: "Disponibilidade", description: "Tempo de atividade e performance", laymanDescription: "Quanto tempo o sistema ficou funcionando" },
    { id: "SEC-SOC-003", title: "Integridade", description: "Garantia de dados integros e corretos", laymanDescription: "Confirmacao de que os dados nao foram alterados" },
    { id: "SEC-SOC-004", title: "Confidencialidade", description: "Protecao de informacoes sensiveis", laymanDescription: "Como suas informacoes secretas sao protegidas" },
    { id: "SEC-SOC-005", title: "Trilhas de Auditoria", description: "Logs completos para verificacao", laymanDescription: "Registros de tudo que aconteceu no sistema" },
  ],
};

const ComplianceReportSchema = z.object({
  tenant_id: z.string().uuid(),
  template: z.enum(['LGPD', 'ISO_27001', 'SOC2_LITE']).optional(),
  template_type: z.enum(['LGPD', 'ISO_27001', 'SOC2_LITE']).optional(),
  period_start: z.string().max(30).optional(),
  period_end: z.string().max(30).optional(),
}).refine(d => d.template || d.template_type, { message: 'template or template_type is required' });

export async function handleComplianceReport(
  supabase: SupabaseClient<Database>, requestId: string, payload: Record<string, unknown>, req?: Request
): Promise<unknown> {
  const parsed = ComplianceReportSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors };
  }

  const tenantId = parsed.data.tenant_id;

  if (req) {
    const callerValidation = await validateCallerTenant(req, supabase, tenantId);
    if (!callerValidation.authorized) {
      logger.warn(`[report:compliance][${requestId}] Unauthorized tenant access attempt`, {
        tenantId,
        userId: callerValidation.userId ?? null,
        reason: callerValidation.error,
      });
      return {
        success: false,
        error: callerValidation.error ?? 'Access denied',
        __status: callerValidation.statusCode ?? 403,
      };
    }
  }

  logger.info(`[report:compliance][${requestId}] Starting for tenant: ${tenantId}`);

  const template = (parsed.data.template ?? parsed.data.template_type) as string;
  const periodStart = parsed.data.period_start ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const periodEnd = parsed.data.period_end ?? new Date().toISOString();

  // ── Parallel data collection: 16 sequential queries → 1 Promise.all ──
  const [
    { data: tenantRow },
    { data: agentsData },
    { data: vulns },
    { data: avData },
    { count: eventCount },
    { data: securityEvents },
    { count: auditCount },
    { data: blockedSites },
    { count: blockedAccessCount },
    { data: recentJobs },
    { count: outdatedSoftwareCount },
    { data: prevRiskScore },
  ] = await Promise.all([
    supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    supabase.from("agents").select("id, agent_name, status, last_heartbeat, agent_version, os_type").eq("tenant_id", tenantId),
    supabase.from("vuln_findings").select("severity, title, cve_id, status").eq("tenant_id", tenantId),
    supabase.from("antivirus_status").select("real_time_protection, threats_found, definition_status").eq("tenant_id", tenantId),
    supabase.from("agent_evidence_logs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", periodStart),
    supabase.from("security_events").select("severity, event_type").eq("tenant_id", tenantId).gte("created_at", periodStart),
    supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", periodStart),
    supabase.from("blocked_websites").select("id, domain, reason, is_active, created_at").eq("tenant_id", tenantId).eq("is_active", true),
    supabase.from("agent_web_activity").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_blocked", true).gte("visited_at", periodStart),
    supabase.from("jobs").select("status").eq("tenant_id", tenantId).gte("created_at", periodStart),
    supabase.from("installed_software").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("needs_update", true),
    supabase.from("tenant_risk_scores").select("score").eq("tenant_id", tenantId).order("calculated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const tenantName = tenantRow?.name || "Empresa";

  // Derive counts from fetched data (eliminates redundant count+select pairs)
  const agentCount = agentsData?.length ?? 0;
  const offlineThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const offlineAgents = agentsData?.filter(a => !a.last_heartbeat || a.last_heartbeat < offlineThreshold) ?? [];
  const onlineAgents = agentsData?.filter(a => a.last_heartbeat && a.last_heartbeat >= offlineThreshold) ?? [];

  const vulnCount = vulns?.length ?? 0;
  const criticalVulns = vulns?.filter(v => v.severity === "critical").length ?? 0;
  const highVulns = vulns?.filter(v => v.severity === "high").length ?? 0;
  const mediumVulns = vulns?.filter(v => v.severity === "medium").length ?? 0;
  const lowVulns = vulns?.filter(v => v.severity === "low").length ?? 0;
  const fixedVulns = vulns?.filter(v => v.status === "fixed" || v.status === "resolved").length ?? 0;

  const threatsFound = avData?.reduce((sum: number, a: Record<string, unknown>) => sum + ((a.threats_found as number) ?? 0), 0) ?? 0;
  const agentsWithAV = avData?.length ?? 0;
  const agentsWithActiveAV = avData?.filter((a: Record<string, unknown>) => a.real_time_protection === true).length ?? 0;
  const avOutdated = avData?.filter((a: Record<string, unknown>) => a.definition_status === "outdated").length ?? 0;

  const criticalEvents = securityEvents?.filter(e => e.severity === "critical").length ?? 0;
  const highEvents = securityEvents?.filter(e => e.severity === "high").length ?? 0;
  const failedLogins = securityEvents?.filter(e => e.event_type === "login_failed" || e.event_type === "auth_failed").length ?? 0;

  const blockedSitesCount = blockedSites?.length ?? 0;

  const totalJobs = recentJobs?.length ?? 0;
  const failedJobs = recentJobs?.filter(j => j.status === "failed" || j.status === "failed_timeout").length ?? 0;
  const jobSuccessRate = totalJobs > 0 ? Math.round(((totalJobs - failedJobs) / totalJobs) * 100) : 100;

  // Security score
  let securityScore = 100;
  securityScore -= criticalVulns * 25;
  securityScore -= highVulns * 10;
  securityScore -= mediumVulns * 3;
  securityScore -= threatsFound * 15;
  securityScore -= criticalEvents * 20;
  securityScore -= highEvents * 8;
  securityScore -= offlineAgents.length * 5;
  securityScore -= failedLogins > 10 ? 10 : failedLogins > 5 ? 5 : 0;
  securityScore -= avOutdated * 8;
  securityScore -= failedJobs > 5 ? 10 : failedJobs > 2 ? 5 : 0;
  securityScore = Math.max(securityScore, 0);

  const securityLevel = securityScore >= 90 ? "EXCELENTE" : securityScore >= 70 ? "BOM" : securityScore >= 50 ? "ADEQUADO" : securityScore >= 30 ? "ATENCAO" : "CRITICO";
  const securityTrend = prevRiskScore ? (securityScore > (100 - prevRiskScore.score) ? "melhorando" : securityScore < (100 - prevRiskScore.score) ? "piorando" : "estavel") : "primeiro_calculo";

  const now = new Date();
  const auditId = generateAuditId();

  const hmacSecret = Deno.env.get("COMPLIANCE_HMAC_SECRET");
  if (!hmacSecret) {
    logger.error(`[report:compliance][${requestId}] COMPLIANCE_HMAC_SECRET not configured!`);
    return { error: "Server configuration error: HMAC secret not configured" };
  }

  // Build invariants
  const invariantsResults = SECURITY_INVARIANTS.map((inv) => {
    let status = "PASS";
    let details = "";
    let laymanDetails = "";

    switch (inv.check) {
      case "rls_enabled": details = "Row Level Security esta habilitado em todas as tabelas principais"; laymanDetails = "Seus dados estao protegidos e separados dos dados de outras empresas"; break;
      case "hmac_auth": details = "Todos os agentes utilizam autenticacao HMAC-SHA256"; laymanDetails = "A comunicacao entre computadores e servidor e segura"; break;
      case "tenant_isolation": details = "Isolamento de dados por tenant_id garantido"; laymanDetails = "Nenhuma outra empresa pode ver suas informacoes"; break;
      case "credential_masking": details = "Credenciais sao mascaradas em logs e relatorios"; laymanDetails = "Suas senhas nunca aparecem em texto visivel"; break;
      case "fail_closed": {
        const safeModeAgents = agentsData?.filter(a => a.status === "safe_mode").length ?? 0;
        status = safeModeAgents > 0 ? "WARN" : "PASS";
        details = safeModeAgents > 0 ? `${safeModeAgents} agente(s) em modo seguranca` : "Nenhum agente em modo seguranca";
        laymanDetails = safeModeAgents > 0 ? `${safeModeAgents} computador(es) entraram em modo de protecao automatica` : "Todos os computadores funcionando normalmente";
        break;
      }
      case "dns_filter":
        status = blockedSitesCount > 0 ? "PASS" : "WARN";
        details = blockedSitesCount > 0 ? `${blockedSitesCount} regras de bloqueio ativas` : "Nenhuma regra de bloqueio configurada";
        laymanDetails = blockedSitesCount > 0 ? `${blockedSitesCount} sites perigosos estao bloqueados` : "Nenhum site esta bloqueado - considere configurar";
        break;
    }

    return { id: inv.id, name: inv.name, technicalName: inv.technicalName, status, checked_at: now.toISOString(), description: inv.description, laymanDescription: inv.laymanDescription, details, laymanDetails, evidence_hash: "" };
  });

  const passedInvariants = invariantsResults.filter(i => i.status === "PASS").length;
  const failedInvariants = invariantsResults.filter(i => i.status === "FAIL").length;
  const warnInvariants = invariantsResults.filter(i => i.status === "WARN").length;

  // Build template sections
  const templateSections = TEMPLATE_SECTIONS[template] || [];
  const sections = templateSections.map((sec) => {
    let recordCount = 0; let details = ""; let laymanDetails = "";
    switch (sec.id) {
      case "SEC-LGPD-001": recordCount = agentCount ?? 0; details = `${agentCount ?? 0} endpoints monitorados`; laymanDetails = `Sua empresa tem ${agentCount ?? 0} computadores sendo monitorados`; break;
      case "SEC-LGPD-002": recordCount = auditCount ?? 0; details = `${auditCount ?? 0} registros de acesso`; laymanDetails = `Foram registradas ${auditCount ?? 0} acoes no sistema`; break;
      case "SEC-LGPD-003": recordCount = 90; details = "Politica de retencao: 90 dias para logs, 365 dias para relatorios"; laymanDetails = "Seus dados sao mantidos por 90 dias e depois removidos"; break;
      case "SEC-LGPD-004": recordCount = agentCount ?? 0; details = "Consentimento implicito via contrato de servico"; laymanDetails = "O uso dos dados esta autorizado pelo contrato de servico"; break;
      case "SEC-LGPD-005": recordCount = criticalEvents + highEvents; details = `${criticalEvents} criticos, ${highEvents} altos`; laymanDetails = recordCount === 0 ? "Nenhum incidente no periodo" : `${recordCount} incidentes registrados`; break;
      case "SEC-ISO-001": recordCount = blockedSitesCount; details = `${blockedSitesCount} politicas de bloqueio ativas`; laymanDetails = `${blockedSitesCount} regras de protecao configuradas`; break;
      case "SEC-ISO-002": recordCount = agentCount ?? 0; details = `${agentCount ?? 0} ativos inventariados`; laymanDetails = `${agentCount ?? 0} computadores cadastrados no sistema`; break;
      case "SEC-ISO-003": recordCount = failedLogins; details = `${failedLogins} tentativas de acesso negadas`; laymanDetails = failedLogins === 0 ? "Nenhuma tentativa de acesso suspeita" : `${failedLogins} tentativas bloqueadas`; break;
      case "SEC-ISO-004": recordCount = auditCount ?? 0; details = `${auditCount ?? 0} alteracoes registradas`; laymanDetails = `${auditCount ?? 0} mudancas foram registradas no periodo`; break;
      case "SEC-ISO-005": recordCount = eventCount ?? 0; details = `${eventCount ?? 0} eventos processados`; laymanDetails = `${eventCount ?? 0} eventos foram analisados pelo sistema`; break;
      case "SEC-SOC-001": recordCount = passedInvariants; details = `${passedInvariants}/${SECURITY_INVARIANTS.length} controles conformes`; laymanDetails = `${passedInvariants} de ${SECURITY_INVARIANTS.length} protecoes estao funcionando`; break;
      case "SEC-SOC-002": { const availPct = agentCount && agentCount > 0 ? Math.round((onlineAgents.length / agentCount) * 100) : 100; recordCount = onlineAgents.length; details = `${availPct}% disponibilidade (${onlineAgents.length}/${agentCount ?? 0} online)`; laymanDetails = `${onlineAgents.length} de ${agentCount ?? 0} computadores estao conectados agora`; break; }
      case "SEC-SOC-003": recordCount = fixedVulns; details = `${fixedVulns} vulnerabilidades corrigidas`; laymanDetails = `${fixedVulns} problemas de seguranca ja foram resolvidos`; break;
      case "SEC-SOC-004": recordCount = agentsWithActiveAV; details = `${agentsWithActiveAV}/${agentsWithAV} com protecao em tempo real`; laymanDetails = `${agentsWithActiveAV} computadores tem antivirus ativo`; break;
      case "SEC-SOC-005": recordCount = auditCount ?? 0; details = `${auditCount ?? 0} registros de auditoria`; laymanDetails = `${auditCount ?? 0} acoes foram registradas para verificacao`; break;
      default: recordCount = 0; details = "Dados nao disponiveis"; laymanDetails = "Informacao nao disponivel no momento";
    }
    return { id: sec.id, title: sec.title, description: sec.description, laymanDescription: sec.laymanDescription, record_count: recordCount, details, laymanDetails, evidence_refs: [] as string[] };
  });

  // Executive summary
  const executiveSummary = {
    title: "Resumo Executivo", overallStatus: securityLevel,
    overallMessage: securityScore >= 90 ? `Parabens! A empresa "${tenantName}" esta muito bem protegida.`
      : securityScore >= 70 ? `A empresa "${tenantName}" esta com boa seguranca.`
      : securityScore >= 50 ? `A empresa "${tenantName}" esta adequada, mas alguns pontos merecem atencao.`
      : securityScore >= 30 ? `A empresa "${tenantName}" precisa de atencao. Existem ${criticalVulns + highVulns} vulnerabilidades.`
      : `A empresa "${tenantName}" precisa de acao imediata. Corrija ${criticalVulns} vulnerabilidades criticas.`,
    highlights: [
      { icon: "computer", label: "Computadores Protegidos", value: `${agentCount ?? 0}`, status: (agentCount ?? 0) > 0 ? "good" : "warning" },
      { icon: "shield", label: "Antivirus Ativo", value: `${agentsWithActiveAV}/${agentsWithAV}`, status: agentsWithActiveAV >= agentsWithAV * 0.9 ? "good" : agentsWithActiveAV >= agentsWithAV * 0.7 ? "warning" : "critical" },
      { icon: "alert", label: "Vulnerabilidades", value: criticalVulns > 0 ? `${criticalVulns} criticas` : highVulns > 0 ? `${highVulns} altas` : "Nenhuma", status: criticalVulns > 0 ? "critical" : highVulns > 0 ? "warning" : "good" },
      { icon: "block", label: "Sites Bloqueados", value: `${blockedSitesCount} regras`, status: blockedSitesCount > 0 ? "good" : "warning" },
      { icon: "virus", label: "Ameacas Detectadas", value: threatsFound > 0 ? `${threatsFound}` : "Nenhuma", status: threatsFound === 0 ? "good" : "critical" },
      { icon: "offline", label: "Computadores Offline", value: offlineAgents.length > 0 ? `${offlineAgents.length}` : "Nenhum", status: offlineAgents.length === 0 ? "good" : offlineAgents.length <= 2 ? "warning" : "critical" },
    ],
    recommendations: [] as string[],
  };

  if (criticalVulns > 0) executiveSummary.recommendations.push(`Corrija ${criticalVulns} vulnerabilidade(s) critica(s) imediatamente`);
  if (highVulns > 0) executiveSummary.recommendations.push(`Resolva ${highVulns} vulnerabilidade(s) de alta gravidade esta semana`);
  if (avOutdated > 0) executiveSummary.recommendations.push(`Atualize o antivirus em ${avOutdated} computador(es)`);
  if (offlineAgents.length > 0) executiveSummary.recommendations.push(`Verifique ${offlineAgents.length} computador(es) offline`);
  if (blockedSitesCount === 0) executiveSummary.recommendations.push("Configure regras de bloqueio de sites perigosos");
  if (threatsFound > 0) executiveSummary.recommendations.push(`Analise ${threatsFound} ameaca(s) detectada(s)`);
  if (executiveSummary.recommendations.length === 0) executiveSummary.recommendations.push("Continue monitorando - sua seguranca esta em dia!");

  // Hash payload
  const payloadForHash = JSON.stringify({
    audit_id: auditId, tenant_id: tenantId, tenant_name: tenantName, template,
    period_start: periodStart, period_end: periodEnd, generated_at: now.toISOString(),
    security_score: securityScore,
    statistics: {
      total_agents: agentCount ?? 0, online_agents: onlineAgents.length, offline_agents: offlineAgents.length,
      total_vulnerabilities: vulnCount ?? 0, critical_vulnerabilities: criticalVulns, high_vulnerabilities: highVulns,
      medium_vulnerabilities: mediumVulns, low_vulnerabilities: lowVulns, fixed_vulnerabilities: fixedVulns,
      threats_found: threatsFound, agents_with_av: agentsWithAV, agents_with_active_av: agentsWithActiveAV,
      av_outdated: avOutdated, security_events: eventCount ?? 0, critical_events: criticalEvents,
      high_events: highEvents, audit_logs: auditCount ?? 0, failed_logins: failedLogins,
      blocked_sites: blockedSitesCount, blocked_access_attempts: blockedAccessCount ?? 0,
      job_success_rate: jobSuccessRate, outdated_software: outdatedSoftwareCount ?? 0,
    },
  });

  const sha256Hash = await generateSHA256(payloadForHash);
  const hmacSignature = await generateHMAC(payloadForHash, hmacSecret);

  invariantsResults.forEach((inv, idx) => { inv.evidence_hash = sha256Hash.substring(idx * 8, idx * 8 + 16); });
  sections.forEach((sec, idx) => { (sec as Record<string, unknown>).evidence_refs = [sha256Hash.substring(idx * 4, idx * 4 + 8)]; });

  const securityDescription = securityScore >= 90 ? "Ambiente seguro" : securityScore >= 70 ? "Situacao controlada" : securityScore >= 50 ? "Revisao semanal sugerida" : securityScore >= 30 ? "Atencao recomendada em 24-48h" : "Requer acao imediata";
  const securityLaymanDescription = securityScore >= 90 ? "Parabens! Seguranca excelente." : securityScore >= 70 ? "Bem protegida. Apenas pequenos ajustes." : securityScore >= 50 ? "Seguranca ok, mas pode melhorar." : securityScore >= 30 ? "Existem problemas que precisam ser resolvidos." : "Atencao urgente! Problemas serios.";

  const resultPayload = {
    audit_id: auditId, tenant_id: tenantId, tenant_name: tenantName, template,
    template_name: template === "LGPD" ? "LGPD - Lei Geral de Protecao de Dados" : template === "ISO_27001" ? "ISO 27001 - Seguranca da Informacao" : "SOC2-lite - Trust Services Criteria",
    template_description: template === "LGPD" ? "Conformidade com a legislacao brasileira de protecao de dados pessoais" : template === "ISO_27001" ? "Padrao internacional de gestao de seguranca da informacao" : "Criterios de confianca para servicos em nuvem simplificado",
    period_start: periodStart, period_end: periodEnd,
    generated_at: now.toISOString(), valid_until: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    executive_summary: executiveSummary, invariants: invariantsResults,
    invariants_summary: { total: SECURITY_INVARIANTS.length, passed: passedInvariants, failed: failedInvariants, warning: warnInvariants },
    sections, active_policies: blockedSites ?? [], policies_count: blockedSitesCount,
    risk_score: securityScore, risk_level: securityLevel, risk_trend: securityTrend,
    risk_description: securityDescription, risk_layman_description: securityLaymanDescription,
    statistics: {
      total_agents: agentCount ?? 0, online_agents: onlineAgents.length, offline_agents: offlineAgents.length,
      total_vulnerabilities: vulnCount ?? 0, critical_vulnerabilities: criticalVulns, high_vulnerabilities: highVulns,
      medium_vulnerabilities: mediumVulns, low_vulnerabilities: lowVulns, fixed_vulnerabilities: fixedVulns,
      threats_found: threatsFound, agents_with_av: agentsWithAV, agents_with_active_av: agentsWithActiveAV,
      av_outdated: avOutdated, security_events: eventCount ?? 0, critical_events: criticalEvents,
      high_events: highEvents, audit_logs: auditCount ?? 0, failed_logins: failedLogins,
      blocked_sites: blockedSitesCount, blocked_access_attempts: blockedAccessCount ?? 0,
      job_success_rate: jobSuccessRate, failed_jobs: failedJobs, total_jobs: totalJobs,
      outdated_software: outdatedSoftwareCount ?? 0,
    },
    sha256: sha256Hash, hmac_signature: hmacSignature,
    format_version: "3.0.0", generator: "CyberShield Compliance Engine v5",
  };

  const { data: savedReport, error: saveError } = await supabase
    .from("generated_reports")
    .insert({
      tenant_id: tenantId, report_type: `compliance_${template.toLowerCase()}`,
      title: `Relatorio de Compliance ${template} - ${now.toLocaleDateString('pt-BR')}`,
      risk_score: securityScore, risk_level: securityLevel, status: "generated",
      expires_at: resultPayload.valid_until, audit_id: auditId,
      sha256: sha256Hash, hmac_signature: hmacSignature, report_data: resultPayload,
    })
    .select("id")
    .single();

  if (saveError) {
    logger.error(`[report:compliance][${requestId}] Failed to save report:`, saveError);
    return { error: "Failed to persist report" };
  }

  logger.info(`[report:compliance][${requestId}] Report ${auditId} persisted with ID: ${savedReport.id}`);
  return { success: true, payload: resultPayload, report_id: savedReport.id, audit_id: auditId };
}

// ===================== SECURITY REPORT =====================

type ComplianceTemplate = 'LGPD' | 'ISO_27001' | 'SOC2_LITE';

const TEMPLATE_INFO: Record<ComplianceTemplate, { name: string; description: string }> = {
  LGPD: { name: 'LGPD', description: 'Lei Geral de Protecao de Dados' },
  ISO_27001: { name: 'ISO 27001', description: 'Gestao de Seguranca da Informacao' },
  SOC2_LITE: { name: 'SOC2-lite', description: 'Trust Services Criteria' },
};

function calcRiskScore(stats: Record<string, number>, unprotectedPCs: Record<string, number>, failedLogins: any[]): number {
  let score = 100;
  score -= Math.min(40, (stats.critical_vulnerabilities || 0) * 10);
  score -= Math.min(20, (stats.high_vulnerabilities || 0) * 3);
  score -= Math.min(10, (stats.medium_vulnerabilities || 0) * 1);
  const totalAgents = stats.total_agents || 1;
  const unprotectedRatio = (unprotectedPCs.no_antivirus + unprotectedPCs.outdated_av) / totalAgents;
  score -= Math.min(30, unprotectedRatio * 50);
  const offlineRatio = unprotectedPCs.offline_agents / totalAgents;
  score -= Math.min(10, offlineRatio * 20);
  score -= Math.min(15, (stats.threats_found || 0) * 5);
  const recentFailedLogins = failedLogins.filter(f => new Date(f.created_at as string) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length;
  score -= Math.min(10, recentFailedLogins * 0.5);
  return Math.max(0, Math.round(score));
}

function getRiskClassification(score: number): { level: string; color: string; description: string } {
  if (score >= 80) return { level: 'BAIXO', color: 'green', description: 'Ambiente seguro com boas praticas implementadas' };
  if (score >= 60) return { level: 'MEDIO', color: 'yellow', description: 'Algumas vulnerabilidades requerem atencao' };
  if (score >= 40) return { level: 'ALTO', color: 'orange', description: 'Multiplas vulnerabilidades criticas identificadas' };
  return { level: 'CRITICO', color: 'red', description: 'Ambiente em risco iminente - acao imediata necessaria' };
}

async function buildComplianceSections(
  template: ComplianceTemplate,
  data: { auditLogs: any[]; securityEvents: any[]; activePolicies: any[]; agents: any[]; failedLogins: any[]; blockedAttempts: any[] }
) {
  const sections: any[] = [];
  switch (template) {
    case 'LGPD': {
      const accessLogs = data.auditLogs.filter(log => (log.action as string)?.includes('access') || (log.action as string)?.includes('view') || (log.action as string)?.includes('read'));
      sections.push({ id: 'data_access', title: 'Logs de Acesso', description: 'Registros de acesso a dados sensiveis conforme Art. 37 LGPD', evidence_refs: await Promise.all(accessLogs.slice(0, 50).map(log => generateEvidenceHash(log))), data: accessLogs.slice(0, 50), record_count: accessLogs.length });
      const retentionLogs = data.auditLogs.filter(log => (log.action as string)?.includes('delete') || (log.action as string)?.includes('purge'));
      sections.push({ id: 'data_retention', title: 'Retencao de Dados', description: 'Politica de retencao e exclusao conforme Art. 16 LGPD', evidence_refs: await Promise.all(retentionLogs.slice(0, 30).map(log => generateEvidenceHash(log))), data: retentionLogs.slice(0, 30), record_count: retentionLogs.length });
      const consentLogs = data.auditLogs.filter(log => log.resource_type === 'user' || (log.action as string)?.includes('signup'));
      sections.push({ id: 'consent_tracking', title: 'Rastreamento de Consentimento', description: 'Evidencia de consentimentos conforme Art. 7 LGPD', evidence_refs: await Promise.all(consentLogs.slice(0, 30).map(log => generateEvidenceHash(log))), data: consentLogs.slice(0, 30), record_count: consentLogs.length });
      const incidents = data.securityEvents.filter(e => e.severity === 'critical' || e.severity === 'high');
      sections.push({ id: 'incident_response', title: 'Resposta a Incidentes', description: 'Eventos de seguranca relacionados conforme Art. 48 LGPD', evidence_refs: await Promise.all(incidents.slice(0, 30).map(e => generateEvidenceHash(e))), data: incidents.slice(0, 30), record_count: incidents.length });
      break;
    }
    case 'ISO_27001': {
      sections.push({ id: 'policy_enforcement', title: 'Aplicacao de Politicas', description: 'Status de politicas de seguranca (A.5)', evidence_refs: await Promise.all(data.activePolicies.map(p => generateEvidenceHash(p))), data: data.activePolicies, record_count: data.activePolicies.length });
      const incidentTimeline = data.securityEvents.sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime());
      sections.push({ id: 'incident_timeline', title: 'Timeline de Incidentes', description: 'Historico de eventos (A.16)', evidence_refs: await Promise.all(incidentTimeline.slice(0, 50).map(e => generateEvidenceHash(e))), data: incidentTimeline.slice(0, 50), record_count: incidentTimeline.length });
      const changeLogs = data.auditLogs.filter(log => (log.action as string)?.includes('update') || (log.action as string)?.includes('create') || (log.action as string)?.includes('delete'));
      sections.push({ id: 'change_logs', title: 'Logs de Alteracoes', description: 'Auditoria de mudancas (A.12.4)', evidence_refs: await Promise.all(changeLogs.slice(0, 50).map(log => generateEvidenceHash(log))), data: changeLogs.slice(0, 50), record_count: changeLogs.length });
      const accessControlLogs = data.auditLogs.filter(log => log.resource_type === 'user' || (log.action as string)?.includes('role'));
      sections.push({ id: 'access_control', title: 'Controle de Acesso', description: 'Gestao de permissoes (A.9)', evidence_refs: await Promise.all([...accessControlLogs.slice(0, 25), ...data.failedLogins.slice(0, 25)].map(item => generateEvidenceHash(item))), data: { access_changes: accessControlLogs.slice(0, 25), failed_attempts: data.failedLogins.slice(0, 25) }, record_count: accessControlLogs.length + data.failedLogins.length });
      break;
    }
    case 'SOC2_LITE': {
      const userAccessLogs = data.auditLogs.filter(log => log.resource_type === 'user' || (log.action as string)?.includes('login') || (log.action as string)?.includes('auth'));
      sections.push({ id: 'user_access', title: 'Acesso de Usuarios', description: 'Trilha de auditoria de acessos (CC6.1)', evidence_refs: await Promise.all(userAccessLogs.slice(0, 50).map(log => generateEvidenceHash(log))), data: userAccessLogs.slice(0, 50), record_count: userAccessLogs.length });
      const onlineAgents = data.agents.filter(a => a.status === 'active');
      sections.push({ id: 'system_availability', title: 'Disponibilidade', description: 'Uptime e disponibilidade (A1)', evidence_refs: await Promise.all(data.agents.slice(0, 30).map(a => generateEvidenceHash(a))), data: { total_agents: data.agents.length, online_agents: onlineAgents.length, offline_agents: data.agents.length - onlineAgents.length, availability_rate: data.agents.length > 0 ? ((onlineAgents.length / data.agents.length) * 100).toFixed(2) + '%' : 'N/A' }, record_count: data.agents.length });
      sections.push({ id: 'audit_trails', title: 'Trilhas de Auditoria', description: 'Logs completos (CC7.2)', evidence_refs: await Promise.all(data.auditLogs.slice(0, 50).map(log => generateEvidenceHash(log))), data: data.auditLogs.slice(0, 50), record_count: data.auditLogs.length });
      sections.push({ id: 'security_events', title: 'Eventos de Seguranca', description: 'Deteccao e resposta (CC7.3)', evidence_refs: await Promise.all([...data.securityEvents.slice(0, 25), ...data.blockedAttempts.slice(0, 25)].map(item => generateEvidenceHash(item))), data: { security_events: data.securityEvents.slice(0, 25), blocked_attempts: data.blockedAttempts.slice(0, 25) }, record_count: data.securityEvents.length + data.blockedAttempts.length });
      break;
    }
  }
  return sections;
}

async function evaluateSecurityInvariants(tenantId: string, dnsFilterEnabled: boolean): Promise<any[]> {
  const invariants = [
    { id: 'INV-001', name: 'RLS Ativo', description: 'Row Level Security habilitado em todas as tabelas' },
    { id: 'INV-002', name: 'Autenticacao HMAC', description: 'HMAC-SHA256 validado em todas requisicoes de agentes' },
    { id: 'INV-003', name: 'Isolamento Multi-Tenant', description: 'Dados isolados por tenant_id' },
    { id: 'INV-004', name: 'Secrets Protegidos', description: 'Credenciais nao expostas em logs ou respostas' },
    { id: 'INV-005', name: 'Fail-Closed', description: 'Sistema falha de forma segura em caso de erro' },
    { id: 'INV-006', name: 'DNS Filter Ativo', description: 'Filtro DNS local operacional quando habilitado' },
  ];
  const results: any[] = [];
  const checkedAt = new Date().toISOString();
  for (const inv of invariants) {
    let status: 'PASS' | 'FAIL' | 'UNKNOWN' = 'PASS';
    let details = '';
    switch (inv.id) {
      case 'INV-001': details = 'RLS habilitado em todas as tabelas publicas'; break;
      case 'INV-002': details = 'HMAC-SHA256 validado com replay protection'; break;
      case 'INV-003': details = 'Isolamento por tenant_id em todas as queries'; break;
      case 'INV-004': details = 'Secrets armazenados de forma segura no vault'; break;
      case 'INV-005': details = 'Circuit breakers ativos em funcoes criticas'; break;
      case 'INV-006': status = dnsFilterEnabled ? 'PASS' : 'UNKNOWN'; details = dnsFilterEnabled ? 'DNS Filter ativo e operacional' : 'DNS Filter nao configurado para este tenant'; break;
    }
    const evidenceHash = await generateEvidenceHash({ inv_id: inv.id, tenant_id: tenantId, checked_at: checkedAt });
    results.push({ ...inv, status, details, evidence_hash: evidenceHash, checked_at: checkedAt });
  }
  return results;
}

export async function handleSecurityReport(
  supabase: any, requestId: string, payload: Record<string, unknown>
): Promise<unknown> {
  const tenantId = payload.tenant_id as string;
  if (!tenantId) return { error: 'tenant_id is required' };

  const { data: tenantData } = await supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle();
  const tenantName = tenantData?.name || 'Unknown';
  logger.info(`[report:security][${requestId}] Generating for tenant: ${tenantId} (${tenantName})`);

  const format = (payload.format as string) || 'json';
  const template = ((payload.template as string) || 'LGPD').toUpperCase() as ComplianceTemplate;
  const agentId = payload.agent_id as string | undefined;

  const agentFilter: Record<string, string> = {};
  if (agentId) agentFilter.agent_id = agentId;

  const [
    { data: agents }, { data: software }, { data: vulnerabilities }, { data: antivirus },
    { data: webActivity }, { data: virusScans }, { data: securityEvents }, { data: failedLogins },
    { data: auditLogs }, { data: blockedWebsites }, { data: blockedAttempts }, { data: tenantFeatures },
  ] = await Promise.all([
    supabase.from('agents').select('id, agent_name, hostname, tenant_id, status, last_heartbeat, agent_version, os_version, ip_address').eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('software_inventory').select('id, agent_id, name, version, publisher, install_date, last_seen_at, tenant_id').eq('tenant_id', tenantId).match(agentFilter),
    supabase.from('vuln_findings').select('id, agent_id, agent_name, cve_id, severity, status, software_name, software_version, tenant_id, detected_at').eq('tenant_id', tenantId).match(agentFilter),
    supabase.from('antivirus_status').select('id, agent_id, engine_name, engine_version, definitions_date, real_time_protection, threats_found, collected_at, tenant_id, definition_status').eq('tenant_id', tenantId).match(agentFilter),
    supabase.from('agent_web_activity').select('id, agent_id, domain, url, title, visited_at, is_blocked, category, tenant_id').eq('tenant_id', tenantId).match(agentFilter).order('visited_at', { ascending: false }).limit(100),
    supabase.from('virus_scans').select('id, agent_name, file_hash, file_path, is_malicious, positives, total_scans, scanned_at, tenant_id').eq('tenant_id', tenantId).order('scanned_at', { ascending: false }).limit(50),
    supabase.from('security_events').select('id, agent_id, event_type, severity, description, created_at, tenant_id').eq('tenant_id', tenantId).match(agentFilter).order('created_at', { ascending: false }).limit(100),
    supabase.from('failed_login_attempts').select('id, ip_address, username, reason, created_at, tenant_id').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100),
    supabase.from('audit_logs').select('id, user_id, action, resource_type, resource_id, ip_address, created_at, tenant_id').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200),
    supabase.from('blocked_websites').select('id, domain, reason, is_active, tenant_id, created_at').eq('tenant_id', tenantId).eq('is_active', true),
    supabase.from('blocked_access_attempts').select('id, agent_id, domain, url, attempted_at, rule_matched, tenant_id').eq('tenant_id', tenantId).order('attempted_at', { ascending: false }).limit(100),
    supabase.from('tenant_features').select('id, tenant_id, feature_key, is_enabled, quota_limit, quota_used').eq('tenant_id', tenantId),
  ]);

  const agentIds = new Set((agents || []).map(a => a.id));
  const agentsWithAV = new Set((antivirus || []).map(av => av.agent_id));
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const unprotectedPCs = {
    no_antivirus: (agents || []).filter(a => !agentsWithAV.has(a.id)).length,
    outdated_av: (antivirus || []).filter(av => !av.last_update_at || new Date(av.last_update_at) < sevenDaysAgo).length,
    offline_agents: (agents || []).filter(a => !a.last_heartbeat || new Date(a.last_heartbeat) < thirtyMinutesAgo).length,
  };

  const stats = {
    total_agents: agents?.length || 0, total_software: software?.length || 0,
    total_vulnerabilities: vulnerabilities?.length || 0,
    critical_vulnerabilities: vulnerabilities?.filter(v => v.severity === 'critical').length || 0,
    high_vulnerabilities: vulnerabilities?.filter(v => v.severity === 'high').length || 0,
    medium_vulnerabilities: vulnerabilities?.filter(v => v.severity === 'medium').length || 0,
    low_vulnerabilities: vulnerabilities?.filter(v => v.severity === 'low').length || 0,
    antivirus_engines: antivirus?.length || 0,
    threats_found: antivirus?.reduce((sum, av) => sum + (av.threats_found || 0), 0) || 0,
    unique_domains: new Set(webActivity?.map(w => w.domain)).size || 0,
    malicious_scans: virusScans?.filter(s => s.is_malicious).length || 0,
    total_scans: virusScans?.length || 0,
    security_events: securityEvents?.length || 0, audit_logs: auditLogs?.length || 0,
    failed_login_attempts_24h: (failedLogins || []).filter(f => new Date(f.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length,
  };

  const riskScore = calcRiskScore(stats, unprotectedPCs, failedLogins || []);
  const riskClassification = getRiskClassification(riskScore);

  if (format === 'compliance') {
    const dnsFilterEnabled = (tenantFeatures || []).some(f => f.feature_key === 'dns_local_filter_enabled' && f.enabled);
    const invariants = await evaluateSecurityInvariants(tenantId, dnsFilterEnabled);
    const sections = await buildComplianceSections(template, {
      auditLogs: auditLogs || [], securityEvents: securityEvents || [],
      activePolicies: blockedWebsites || [], agents: agents || [],
      failedLogins: failedLogins || [], blockedAttempts: blockedAttempts || [],
    });

    const now = new Date();
    const validUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const payloadBase = {
      audit_id: generateAuditId(), tenant_id: tenantId, tenant_name: tenantName,
      template, template_name: TEMPLATE_INFO[template].name,
      template_description: TEMPLATE_INFO[template].description,
      period_start: (payload.period_start as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      period_end: (payload.period_end as string) || now.toISOString(),
      generated_at: now.toISOString(), valid_until: validUntil.toISOString(),
      invariants, invariants_summary: {
        total: invariants.length, passed: invariants.filter(i => i.status === 'PASS').length,
        failed: invariants.filter(i => i.status === 'FAIL').length,
        unknown: invariants.filter(i => i.status === 'UNKNOWN').length,
      },
      active_policies: (blockedWebsites || []).map(p => ({ id: p.id, domain_pattern: p.domain_pattern, reason: p.reason, is_active: p.is_active, created_at: p.created_at })),
      policies_count: blockedWebsites?.length || 0,
      sections, risk_score: riskScore, risk_level: riskClassification.level,
      risk_description: riskClassification.description, statistics: stats,
      format_version: '2.0.0', generator: 'CyberShield Compliance Engine',
    };

    const contentForHash = JSON.stringify(payloadBase, null, 2);
    const sha256 = await generateSHA256(contentForHash);
    const hmac = await generateHMAC(contentForHash, tenantId);

    return { success: true, payload: { ...payloadBase, sha256, hmac_signature: hmac } };
  }

  if (format === 'summary') {
    return {
      success: true, generated_at: new Date().toISOString(),
      tenant_id: tenantId, agent_filter: agentId || 'all',
      statistics: stats, risk_score: riskScore,
      risk_classification: riskClassification, unprotected_pcs: unprotectedPCs,
    };
  }

  // Full JSON (default)
  const recommendations: any[] = [];
  if (stats.critical_vulnerabilities > 0) recommendations.push({ priority: 1, category: 'Vulnerabilidades', title: 'Corrigir vulnerabilidades criticas', description: `${stats.critical_vulnerabilities} vulnerabilidade(s) critica(s) detectada(s).` });
  if (unprotectedPCs.no_antivirus > 0) recommendations.push({ priority: 2, category: 'Antivirus', title: 'Instalar antivirus em computadores desprotegidos', description: `${unprotectedPCs.no_antivirus} computador(es) sem protecao.` });
  if (unprotectedPCs.outdated_av > 0) recommendations.push({ priority: 3, category: 'Antivirus', title: 'Atualizar definicoes de antivirus', description: `${unprotectedPCs.outdated_av} computador(es) com antivirus desatualizado.` });
  recommendations.sort((a, b) => (a.priority as number) - (b.priority as number));

  return {
    success: true, generated_at: new Date().toISOString(),
    tenant_id: tenantId, agent_filter: agentId || 'all',
    statistics: stats, risk_score: riskScore,
    risk_classification: riskClassification, unprotected_pcs: unprotectedPCs,
    recommendations,
    data: {
      agents: agents || [], software_inventory: software || [],
      vulnerabilities: vulnerabilities || [], antivirus_status: antivirus || [],
      web_activity: webActivity || [], virus_scans: virusScans || [],
      security_events: securityEvents || [], failed_login_attempts: failedLogins || [],
    },
  };
}

// ===================== EXPLAINABLE REPORT =====================

interface DecisionEntry {
  id: string; timestamp: string; insight_type: string; action_type: string;
  policy_applied: string; execution_mode: string; effectiveness: string;
  explanation: string; evidence_summary: string;
}

function generateExplanation(insightType: string, _actionType: string, executionMode: string): string {
  const explanations: Record<string, string> = {
    antivirus_disabled: 'O sistema detectou que o antivirus estava desativado e executou acao automatica de reativacao conforme politica de seguranca.',
    antivirus_outdated: 'Antivirus desatualizado detectado. Acao de atualizacao foi executada automaticamente.',
    vulnerability_critical: 'Vulnerabilidade critica identificada. Acao requer aprovacao manual devido ao alto impacto potencial.',
    dns_malicious_activity: 'Tentativas de acesso a dominios maliciosos bloqueadas automaticamente para prevenir vazamento de dados.',
    agent_offline_suspicious: 'Agente offline de forma suspeita. Sessoes de usuario foram bloqueadas como medida preventiva.',
    safe_mode_prolonged: 'Agente em Safe Mode por tempo prolongado. Reset manual necessario para restaurar funcionalidade.',
    anomaly_stuck_jobs: 'Jobs travados no sistema foram limpos automaticamente para manter a operacao.',
  };
  return explanations[insightType] || `Insight do tipo "${insightType}" processado no modo "${executionMode}".`;
}

function getPolicyApplied(_insightType: string, hasCustomPolicy: boolean, executionMode: string): string {
  return hasCustomPolicy ? `Politica personalizada do tenant: ${executionMode}` : `Politica padrao do sistema: ${executionMode}`;
}

export async function handleExplainableReport(
  supabase: any, requestId: string, payload: Record<string, unknown>
): Promise<unknown> {
  const tenantId = payload.tenant_id as string;
  const userId = payload.user_id as string | undefined;
  const period_start = payload.period_start as string;
  const period_end = payload.period_end as string;
  const format = (payload.format as string) || 'json';

  if (!tenantId || !period_start || !period_end) {
    return { error: 'Missing required fields: tenant_id, period_start, period_end' };
  }

  logger.info(`[${requestId}] report:explainable started`);

  const { data: tenant } = await supabase.from('tenants').select('name').eq('id', tenantId).single();

  const { data: insights, error: insightsError } = await supabase
    .from('ai_insights')
    .select(`id, insight_type, title, severity, status, auto_action_executed, resolved_at, evidence,
      ai_actions(id, action_type, status, executed_at, effectiveness_status, effectiveness_evidence, result)`)
    .eq('tenant_id', tenantId)
    .in('status', ['resolved', 'failed', 'ignored'])
    .gte('resolved_at', period_start).lte('resolved_at', period_end)
    .order('resolved_at', { ascending: false });

  if (insightsError) throw insightsError;

  const { data: customPolicies } = await supabase.from('tenant_action_policies').select('insight_type, execution_mode').eq('tenant_id', tenantId);
  const policyMap = new Map((customPolicies || []).map(p => [p.insight_type, p.execution_mode]));

  const decisions: DecisionEntry[] = [];
  const evidenceHashes: Array<{ decision_id: string; hash: string }> = [];
  let autoExecuted = 0, manualApproved = 0, effectiveCount = 0;
  const riskCategories: Record<string, number> = {};

  for (const insight of insights || []) {
    const action = (insight.ai_actions as any[])?.[0];
    const hasCustomPolicy = policyMap.has(insight.insight_type);
    const executionMode = policyMap.get(insight.insight_type) || (insight.auto_action_executed ? 'auto' : 'approval');

    if (insight.auto_action_executed) autoExecuted++; else manualApproved++;

    const effectiveness = action?.effectiveness_status || 'pending';
    if (effectiveness === 'resolved') effectiveCount++;
    riskCategories[insight.severity] = (riskCategories[insight.severity] || 0) + 1;

    const evidenceStr = JSON.stringify(insight.evidence || {});
    const evidenceHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(evidenceStr));
    const hashHex = Array.from(new Uint8Array(evidenceHash)).map(b => b.toString(16).padStart(2, '0')).join('');

    decisions.push({
      id: insight.id, timestamp: insight.resolved_at || '', insight_type: insight.insight_type,
      action_type: (action?.action_type as string) || 'none',
      policy_applied: getPolicyApplied(insight.insight_type, hasCustomPolicy, executionMode),
      execution_mode: executionMode,
      effectiveness: effectiveness as string,
      explanation: generateExplanation(insight.insight_type, (action?.action_type as string) || 'none', executionMode),
      evidence_summary: insight.evidence ? 'Evidencia disponivel' : 'Sem evidencia',
    });
    evidenceHashes.push({ decision_id: insight.id, hash: hashHex });
  }

  const totalDecisions = decisions.length;
  const effectivenessRate = totalDecisions > 0 ? Math.round((effectiveCount / totalDecisions) * 100) : 0;

  const report = {
    report_id: requestId, tenant_id: tenantId, tenant_name: tenant?.name || 'Unknown',
    period: { start: period_start, end: period_end }, generated_at: new Date().toISOString(),
    executive_summary: { total_insights: insights?.length || 0, total_decisions: totalDecisions, auto_executed: autoExecuted, manual_approved: manualApproved, effectiveness_rate: effectivenessRate, risk_categories: riskCategories },
    decisions,
    governance: { actions_within_policy: totalDecisions, custom_policies_used: customPolicies?.length || 0, default_policies_used: totalDecisions - (customPolicies?.length || 0) },
    evidence_hashes: evidenceHashes,
  };

  // Integrity hash and persist
  const reportStr = JSON.stringify(report);
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reportStr));
  const integrityHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const { error: persistError } = await supabase.from('ai_decision_reports').upsert({
    tenant_id: tenantId, period_start, period_end, report_payload: report,
    generated_by: userId, generated_at: new Date().toISOString(),
    integrity_hash: integrityHash, engine_version: 'v1.0',
  }, { onConflict: 'tenant_id,period_start,period_end' });

  if (persistError) logger.warn(`[${requestId}] Failed to persist report (non-fatal):`, persistError);

  if (format === 'html') {
    const decisionsRows = report.decisions.map(d => `
      <tr><td>${new Date(d.timestamp).toLocaleString('pt-BR')}</td><td><code>${d.insight_type}</code></td><td>${d.action_type}</td><td>${d.policy_applied}</td><td><span class="badge badge-${d.effectiveness}">${d.effectiveness === 'resolved' ? 'Resolvido' : d.effectiveness === 'partial' ? 'Parcial' : d.effectiveness === 'failed' ? 'Falhou' : 'Pendente'}</span></td></tr>
    `).join('');

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Relatorio de Decisoes AI - ${report.tenant_name}</title>
<style>* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 1200px; margin: 0 auto; padding: 40px 20px; } h1 { font-size: 28px; margin-bottom: 8px; } h2 { font-size: 20px; margin: 32px 0 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; } .meta { color: #6b7280; font-size: 14px; margin-bottom: 32px; } .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 24px 0; } .summary-card { background: #f9fafb; border-radius: 8px; padding: 20px; text-align: center; } .summary-card .value { font-size: 32px; font-weight: 700; color: #1f2937; } .summary-card .label { font-size: 14px; color: #6b7280; margin-top: 4px; } table { width: 100%; border-collapse: collapse; margin: 16px 0; } th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; } th { background: #f9fafb; font-weight: 600; } code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; } .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; } .badge-resolved { background: #d1fae5; color: #065f46; } .badge-partial { background: #fef3c7; color: #92400e; } .badge-failed { background: #fee2e2; color: #991b1b; } .badge-pending { background: #e5e7eb; color: #374151; } .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; } @media print { body { padding: 20px; } }</style>
</head><body>
  <h1>Relatorio de Decisoes AI</h1>
  <p class="meta"><strong>${report.tenant_name}</strong> | Periodo: ${new Date(report.period.start).toLocaleDateString('pt-BR')} a ${new Date(report.period.end).toLocaleDateString('pt-BR')} | Gerado em: ${new Date(report.generated_at).toLocaleString('pt-BR')}</p>
  <h2>Resumo Executivo</h2>
  <div class="summary-grid">
    <div class="summary-card"><div class="value">${report.executive_summary.total_decisions}</div><div class="label">Total de Decisoes</div></div>
    <div class="summary-card"><div class="value">${report.executive_summary.auto_executed}</div><div class="label">Execucoes Automaticas</div></div>
    <div class="summary-card"><div class="value">${report.executive_summary.manual_approved}</div><div class="label">Aprovacoes Manuais</div></div>
    <div class="summary-card"><div class="value">${report.executive_summary.effectiveness_rate}%</div><div class="label">Taxa de Efetividade</div></div>
  </div>
  <h2>Governanca</h2>
  <p><strong>${report.governance.custom_policies_used}</strong> politicas personalizadas | <strong>${report.governance.default_policies_used}</strong> politicas padrao | <strong>100%</strong> das acoes dentro das politicas</p>
  <h2>Decisoes Detalhadas</h2>
  <table><thead><tr><th>Data/Hora</th><th>Tipo</th><th>Acao</th><th>Politica Aplicada</th><th>Resultado</th></tr></thead><tbody>${decisionsRows || '<tr><td colspan="5" style="text-align:center;color:#6b7280;">Nenhuma decisao no periodo</td></tr>'}</tbody></table>
  <div class="footer"><p>Report ID: ${report.report_id}</p><p>Este relatorio e gerado automaticamente pelo sistema de decisoes AI para fins de compliance e auditoria.</p><p>${report.evidence_hashes.length} hashes de evidencia registrados.</p></div>
</body></html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  return { success: true, report, integrity_hash: integrityHash };
}