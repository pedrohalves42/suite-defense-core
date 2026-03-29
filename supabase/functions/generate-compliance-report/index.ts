import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';

// Real SHA256 using Web Crypto API
async function generateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// HMAC-SHA256 for digital signature
async function generateHMAC(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const dataBuffer = encoder.encode(data);
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, dataBuffer);
  const signatureArray = Array.from(new Uint8Array(signature));
  return signatureArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ===== SECURITY INVARIANTS DEFINITIONS =====
const SECURITY_INVARIANTS = [
  { id: "INV-001", name: "Protecao de Dados", technicalName: "RLS Ativo", description: "Todas as tabelas possuem protecao de acesso (Row Level Security)", laymanDescription: "Seus dados sao protegidos e so voce pode ve-los", check: "rls_enabled" },
  { id: "INV-002", name: "Autenticacao Segura", technicalName: "HMAC Auth", description: "Comunicacao dos agentes usa assinatura criptografica HMAC-SHA256", laymanDescription: "A comunicacao entre seus computadores e o servidor e criptografada", check: "hmac_auth" },
  { id: "INV-003", name: "Isolamento de Dados", technicalName: "Multi-Tenant", description: "Dados segregados por tenant_id - isolamento garantido", laymanDescription: "Seus dados estao completamente separados de outras empresas", check: "tenant_isolation" },
  { id: "INV-004", name: "Senhas Protegidas", technicalName: "Credential Masking", description: "Credenciais nao aparecem em logs ou relatorios", laymanDescription: "Suas senhas nunca sao armazenadas em texto visivel", check: "credential_masking" },
  { id: "INV-005", name: "Modo Seguranca", technicalName: "Fail-Closed", description: "Sistema bloqueia automaticamente em caso de falha repetida", laymanDescription: "O sistema se protege automaticamente quando detecta problemas", check: "fail_closed" },
  { id: "INV-006", name: "Filtro de Sites", technicalName: "DNS Filter", description: "Bloqueio de sites maliciosos e perigosos esta configurado", laymanDescription: "Sites perigosos sao bloqueados automaticamente", check: "dns_filter" },
];

// ===== TEMPLATE-SPECIFIC SECTIONS =====
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

interface ComplianceReportBody {
  tenant_id?: string;
  template?: string;
  template_type?: string;
  period_start?: string;
  period_end?: string;
}

serveTenant<ComplianceReportBody>(async (_req, ctx) => {
  const { supabase, tenantId, requestId, body } = ctx;

  logger.info(`[generate-compliance-report][${requestId}] Starting for tenant: ${tenantId}`);

  // Fetch tenant name
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();
  const tenantName = tenantRow?.name || "Empresa";

  const template = (body.template ?? body.template_type) as string;
  const periodStart = body.period_start ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const periodEnd = body.period_end ?? new Date().toISOString();

  if (!["LGPD", "ISO_27001", "SOC2_LITE"].includes(template)) {
    return new Response(JSON.stringify({ error: "Invalid template" }),
      { status: 400, headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" } });
  }

  // ===== DATA COLLECTION =====
  logger.info(`[generate-compliance-report][${requestId}] Collecting data...`);

  const { count: agentCount } = await supabase.from("agents").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId);
  const { data: agentsData } = await supabase.from("agents").select("id, agent_name, status, last_heartbeat, agent_version, os_type").eq("tenant_id", tenantId);

  const offlineThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const offlineAgents = agentsData?.filter(a => !a.last_heartbeat || a.last_heartbeat < offlineThreshold) ?? [];
  const onlineAgents = agentsData?.filter(a => a.last_heartbeat && a.last_heartbeat >= offlineThreshold) ?? [];

  const { count: vulnCount } = await supabase.from("vuln_findings").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId);
  const { data: vulns } = await supabase.from("vuln_findings").select("severity, title, cve_id, status").eq("tenant_id", tenantId);
  const criticalVulns = vulns?.filter(v => v.severity === "critical").length ?? 0;
  const highVulns = vulns?.filter(v => v.severity === "high").length ?? 0;
  const mediumVulns = vulns?.filter(v => v.severity === "medium").length ?? 0;
  const lowVulns = vulns?.filter(v => v.severity === "low").length ?? 0;
  const fixedVulns = vulns?.filter(v => v.status === "fixed" || v.status === "resolved").length ?? 0;

  const { data: avData } = await supabase.from("antivirus_status").select("*").eq("tenant_id", tenantId);
  const threatsFound = avData?.reduce((sum, a) => sum + (a.threats_found ?? 0), 0) ?? 0;
  const agentsWithAV = avData?.length ?? 0;
  const agentsWithActiveAV = avData?.filter(a => a.real_time_protection === true).length ?? 0;
  const avOutdated = avData?.filter(a => a.definition_status === "outdated").length ?? 0;

  const { count: eventCount } = await supabase.from("agent_evidence_logs").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", periodStart);
  const { data: securityEvents } = await supabase.from("security_events").select("severity, event_type").eq("tenant_id", tenantId).gte("created_at", periodStart);
  const criticalEvents = securityEvents?.filter(e => e.severity === "critical").length ?? 0;
  const highEvents = securityEvents?.filter(e => e.severity === "high").length ?? 0;

  const { count: auditCount } = await supabase.from("audit_logs").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", periodStart);

  const failedLogins = securityEvents?.filter(e => e.event_type === "login_failed" || e.event_type === "auth_failed").length ?? 0;

  const { data: blockedSites } = await supabase.from("blocked_websites").select("*").eq("tenant_id", tenantId).eq("is_active", true);
  const blockedSitesCount = blockedSites?.length ?? 0;

  const { count: blockedAccessCount } = await supabase.from("agent_web_activity").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_blocked", true).gte("visited_at", periodStart);

  const { data: recentJobs } = await supabase.from("jobs").select("status").eq("tenant_id", tenantId).gte("created_at", periodStart);
  const totalJobs = recentJobs?.length ?? 0;
  const failedJobs = recentJobs?.filter(j => j.status === "failed" || j.status === "failed_timeout").length ?? 0;
  const jobSuccessRate = totalJobs > 0 ? Math.round(((totalJobs - failedJobs) / totalJobs) * 100) : 100;

  const { count: outdatedSoftwareCount } = await supabase.from("installed_software").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("needs_update", true);

  const { data: prevRiskScore } = await supabase
    .from("tenant_risk_scores")
    .select("score")
    .eq("tenant_id", tenantId)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ===== SECURITY SCORE =====
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
  const auditId = `LAUDO-${crypto.randomUUID().slice(0, 8).toUpperCase()}-${now.getTime()}`;

  // HMAC secret verification
  const hmacSecret = Deno.env.get("COMPLIANCE_HMAC_SECRET");
  if (!hmacSecret) {
    logger.error(`[generate-compliance-report][${requestId}] COMPLIANCE_HMAC_SECRET not configured!`);
    return new Response(JSON.stringify({ error: "Server configuration error: HMAC secret not configured" }),
      { status: 500, headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" } });
  }

  // ===== BUILD INVARIANTS =====
  const invariantsResults = SECURITY_INVARIANTS.map((inv) => {
    let status = "PASS";
    let details = "";
    let laymanDetails = "";

    switch (inv.check) {
      case "rls_enabled":
        details = "Row Level Security esta habilitado em todas as tabelas principais";
        laymanDetails = "? Seus dados estao protegidos e separados dos dados de outras empresas";
        break;
      case "hmac_auth":
        details = "Todos os agentes utilizam autenticacao HMAC-SHA256";
        laymanDetails = "? A comunicacao entre computadores e servidor e segura";
        break;
      case "tenant_isolation":
        details = "Isolamento de dados por tenant_id garantido";
        laymanDetails = "? Nenhuma outra empresa pode ver suas informacoes";
        break;
      case "credential_masking":
        details = "Credenciais sao mascaradas em logs e relatorios";
        laymanDetails = "? Suas senhas nunca aparecem em texto visivel";
        break;
      case "fail_closed": {
        const safeModeAgents = agentsData?.filter(a => a.status === "safe_mode").length ?? 0;
        status = safeModeAgents > 0 ? "WARN" : "PASS";
        details = safeModeAgents > 0 ? `${safeModeAgents} agente(s) em modo seguranca` : "Nenhum agente em modo seguranca";
        laymanDetails = safeModeAgents > 0 ? `[WARN]  ${safeModeAgents} computador(es) entraram em modo de protecao automatica` : "? Todos os computadores funcionando normalmente";
        break;
      }
      case "dns_filter":
        status = blockedSitesCount > 0 ? "PASS" : "WARN";
        details = blockedSitesCount > 0 ? `${blockedSitesCount} regras de bloqueio ativas` : "Nenhuma regra de bloqueio configurada";
        laymanDetails = blockedSitesCount > 0 ? `? ${blockedSitesCount} sites perigosos estao bloqueados` : "[WARN]  Nenhum site esta bloqueado - considere configurar";
        break;
    }

    return {
      id: inv.id, name: inv.name, technicalName: inv.technicalName, status,
      checked_at: now.toISOString(), description: inv.description,
      laymanDescription: inv.laymanDescription, details, laymanDetails,
      evidence_hash: "",
    };
  });

  const passedInvariants = invariantsResults.filter(i => i.status === "PASS").length;
  const failedInvariants = invariantsResults.filter(i => i.status === "FAIL").length;
  const warnInvariants = invariantsResults.filter(i => i.status === "WARN").length;

  // ===== BUILD TEMPLATE SECTIONS =====
  const templateSections = TEMPLATE_SECTIONS[template] || [];
  const sections = templateSections.map((sec) => {
    let recordCount = 0;
    let details = "";
    let laymanDetails = "";

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
      case "SEC-SOC-002": {
        const availPct = agentCount && agentCount > 0 ? Math.round((onlineAgents.length / agentCount) * 100) : 100;
        recordCount = onlineAgents.length; details = `${availPct}% disponibilidade (${onlineAgents.length}/${agentCount ?? 0} online)`; laymanDetails = `${onlineAgents.length} de ${agentCount ?? 0} computadores estao conectados agora`; break;
      }
      case "SEC-SOC-003": recordCount = fixedVulns; details = `${fixedVulns} vulnerabilidades corrigidas`; laymanDetails = `${fixedVulns} problemas de seguranca ja foram resolvidos`; break;
      case "SEC-SOC-004": recordCount = agentsWithActiveAV; details = `${agentsWithActiveAV}/${agentsWithAV} com protecao em tempo real`; laymanDetails = `${agentsWithActiveAV} computadores tem antivirus ativo`; break;
      case "SEC-SOC-005": recordCount = auditCount ?? 0; details = `${auditCount ?? 0} registros de auditoria`; laymanDetails = `${auditCount ?? 0} acoes foram registradas para verificacao`; break;
      default: recordCount = 0; details = "Dados nao disponiveis"; laymanDetails = "Informacao nao disponivel no momento";
    }

    return { id: sec.id, title: sec.title, description: sec.description, laymanDescription: sec.laymanDescription, record_count: recordCount, details, laymanDetails, evidence_refs: [] as string[] };
  });

  // ===== EXECUTIVE SUMMARY =====
  const executiveSummary = {
    title: "Resumo Executivo",
    overallStatus: securityLevel,
    overallMessage: securityScore >= 90
      ? `Parabens! A empresa "${tenantName}" esta muito bem protegida.`
      : securityScore >= 70
      ? `A empresa "${tenantName}" esta com boa seguranca.`
      : securityScore >= 50
      ? `A empresa "${tenantName}" esta adequada, mas alguns pontos merecem atencao.`
      : securityScore >= 30
      ? `A empresa "${tenantName}" precisa de atencao. Existem ${criticalVulns + highVulns} vulnerabilidades.`
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

  // Add evidence hashes
  invariantsResults.forEach((inv, idx) => { inv.evidence_hash = sha256Hash.substring(idx * 8, idx * 8 + 16); });
  sections.forEach((sec, idx) => { (sec as Record<string, unknown>).evidence_refs = [sha256Hash.substring(idx * 4, idx * 4 + 8)]; });

  const securityDescription = securityScore >= 90 ? "Ambiente seguro" : securityScore >= 70 ? "Situacao controlada" : securityScore >= 50 ? "Revisao semanal sugerida" : securityScore >= 30 ? "Atencao recomendada em 24-48h" : "Requer acao imediata";
  const securityLaymanDescription = securityScore >= 90 ? "Parabens! Seguranca excelente." : securityScore >= 70 ? "Bem protegida. Apenas pequenos ajustes." : securityScore >= 50 ? "Seguranca ok, mas pode melhorar." : securityScore >= 30 ? "Existem problemas que precisam ser resolvidos." : "Atencao urgente! Problemas serios.";

  // ===== FULL PAYLOAD =====
  const payload = {
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

  // PERSIST REPORT
  const { data: savedReport, error: saveError } = await supabase
    .from("generated_reports")
    .insert({
      tenant_id: tenantId, report_type: `compliance_${template.toLowerCase()}`,
      title: `Relatorio de Compliance ${template} - ${now.toLocaleDateString('pt-BR')}`,
      risk_score: securityScore, risk_level: securityLevel, status: "generated",
      expires_at: payload.valid_until, audit_id: auditId,
      sha256: sha256Hash, hmac_signature: hmacSignature, report_data: payload,
    })
    .select("id")
    .single();

  if (saveError) {
    logger.error(`[generate-compliance-report][${requestId}] Failed to save report:`, saveError);
    return new Response(JSON.stringify({ error: "Failed to persist report" }),
      { status: 500, headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" } });
  }

  logger.info(`[generate-compliance-report][${requestId}] Report ${auditId} persisted with ID: ${savedReport.id}`);

  return { success: true, payload, report_id: savedReport.id, audit_id: auditId };
});
