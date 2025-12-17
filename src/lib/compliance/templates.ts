/**
 * BLOCO 2: Compliance Evidence Bundle - Template Engine
 * 
 * Engine que seleciona automaticamente evidências por template.
 * Templates NÃO dependem de input humano - seleção é automática.
 */

import type { 
  ComplianceTemplate, 
  ComplianceSection 
} from "@/types/compliance-report";
import { generateEvidenceHash } from "./crypto";

interface RawData {
  auditLogs?: Array<{
    id: string;
    action: string;
    resource_type: string;
    created_at: string;
    success: boolean;
    details?: unknown;
  }>;
  securityEvents?: Array<{
    id: string;
    severity: string;
    title: string;
    created_at: string;
    status: string;
  }>;
  activePolicies?: Array<{
    id: string;
    domain_pattern: string;
    reason: string | null;
    is_active: boolean;
    created_at: string;
  }>;
  agents?: Array<{
    id: string;
    agent_name: string;
    status: string;
    last_heartbeat: string | null;
  }>;
  vulnerabilities?: Array<{
    id: string;
    cve_id: string;
    severity: string;
    software_name: string;
  }>;
  failedLogins?: Array<{
    id: string;
    ip_address: string;
    created_at: string;
  }>;
  blockedAttempts?: Array<{
    id: string;
    domain: string;
    attempted_at: string;
    agent_name: string;
  }>;
}

/**
 * Constrói seções de compliance baseado no template selecionado.
 * Seleção de evidências é AUTOMÁTICA - não depende de input humano.
 */
export async function buildComplianceSections(
  template: ComplianceTemplate,
  data: RawData
): Promise<ComplianceSection[]> {
  switch (template) {
    case "LGPD":
      return buildLGPDSections(data);
    case "ISO_27001":
      return buildISO27001Sections(data);
    case "SOC2_LITE":
      return buildSOC2Sections(data);
    default:
      return [];
  }
}

async function buildLGPDSections(data: RawData): Promise<ComplianceSection[]> {
  const sections: ComplianceSection[] = [];

  // 1. Logs de Acesso
  const accessLogs = (data.auditLogs || []).filter(
    (log) => log.action.includes("access") || log.action.includes("view") || log.action.includes("read")
  );
  sections.push({
    id: "data_access",
    title: "Logs de Acesso",
    description: "Registros de acesso a dados sensíveis conforme Art. 37 LGPD",
    evidence_refs: await Promise.all(
      accessLogs.slice(0, 50).map((log) => generateEvidenceHash(log))
    ),
    data: accessLogs.slice(0, 50),
    record_count: accessLogs.length,
  });

  // 2. Retenção de Dados
  const retentionLogs = (data.auditLogs || []).filter(
    (log) => log.action.includes("delete") || log.action.includes("purge") || log.action.includes("retention")
  );
  sections.push({
    id: "data_retention",
    title: "Retenção de Dados",
    description: "Política de retenção e exclusão conforme Art. 16 LGPD",
    evidence_refs: await Promise.all(
      retentionLogs.slice(0, 30).map((log) => generateEvidenceHash(log))
    ),
    data: retentionLogs.slice(0, 30),
    record_count: retentionLogs.length,
  });

  // 3. Rastreamento de Consentimento
  const consentLogs = (data.auditLogs || []).filter(
    (log) => log.resource_type === "user" || log.action.includes("consent") || log.action.includes("signup")
  );
  sections.push({
    id: "consent_tracking",
    title: "Rastreamento de Consentimento",
    description: "Evidência de consentimentos conforme Art. 7 LGPD",
    evidence_refs: await Promise.all(
      consentLogs.slice(0, 30).map((log) => generateEvidenceHash(log))
    ),
    data: consentLogs.slice(0, 30),
    record_count: consentLogs.length,
  });

  // 4. Resposta a Incidentes
  const incidents = (data.securityEvents || []).filter(
    (e) => e.severity === "critical" || e.severity === "high"
  );
  sections.push({
    id: "incident_response",
    title: "Resposta a Incidentes",
    description: "Eventos de segurança relacionados conforme Art. 48 LGPD",
    evidence_refs: await Promise.all(
      incidents.slice(0, 30).map((e) => generateEvidenceHash(e))
    ),
    data: incidents.slice(0, 30),
    record_count: incidents.length,
  });

  return sections;
}

async function buildISO27001Sections(data: RawData): Promise<ComplianceSection[]> {
  const sections: ComplianceSection[] = [];

  // 1. Aplicação de Políticas
  const policyLogs = (data.activePolicies || []);
  sections.push({
    id: "policy_enforcement",
    title: "Aplicação de Políticas",
    description: "Status de políticas de segurança (A.5 - Políticas de SI)",
    evidence_refs: await Promise.all(
      policyLogs.map((p) => generateEvidenceHash(p))
    ),
    data: policyLogs,
    record_count: policyLogs.length,
  });

  // 2. Timeline de Incidentes
  const incidentTimeline = (data.securityEvents || []).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  sections.push({
    id: "incident_timeline",
    title: "Timeline de Incidentes",
    description: "Histórico de eventos de segurança (A.16 - Gestão de Incidentes)",
    evidence_refs: await Promise.all(
      incidentTimeline.slice(0, 50).map((e) => generateEvidenceHash(e))
    ),
    data: incidentTimeline.slice(0, 50),
    record_count: incidentTimeline.length,
  });

  // 3. Logs de Alterações
  const changeLogs = (data.auditLogs || []).filter(
    (log) => log.action.includes("update") || log.action.includes("create") || log.action.includes("delete")
  );
  sections.push({
    id: "change_logs",
    title: "Logs de Alterações",
    description: "Auditoria de mudanças no sistema (A.12.4 - Logging)",
    evidence_refs: await Promise.all(
      changeLogs.slice(0, 50).map((log) => generateEvidenceHash(log))
    ),
    data: changeLogs.slice(0, 50),
    record_count: changeLogs.length,
  });

  // 4. Controle de Acesso
  const accessControlLogs = (data.auditLogs || []).filter(
    (log) => log.resource_type === "user" || log.action.includes("role") || log.action.includes("permission")
  );
  const failedAccess = data.failedLogins || [];
  sections.push({
    id: "access_control",
    title: "Controle de Acesso",
    description: "Gestão de permissões e acessos (A.9 - Controle de Acesso)",
    evidence_refs: await Promise.all(
      [...accessControlLogs.slice(0, 25), ...failedAccess.slice(0, 25)].map((item) =>
        generateEvidenceHash(item)
      )
    ),
    data: {
      access_changes: accessControlLogs.slice(0, 25),
      failed_attempts: failedAccess.slice(0, 25),
    },
    record_count: accessControlLogs.length + failedAccess.length,
  });

  return sections;
}

async function buildSOC2Sections(data: RawData): Promise<ComplianceSection[]> {
  const sections: ComplianceSection[] = [];

  // 1. Acesso de Usuários
  const userAccessLogs = (data.auditLogs || []).filter(
    (log) => log.resource_type === "user" || log.action.includes("login") || log.action.includes("auth")
  );
  sections.push({
    id: "user_access",
    title: "Acesso de Usuários",
    description: "Trilha de auditoria de acessos (CC6.1 - Logical Access)",
    evidence_refs: await Promise.all(
      userAccessLogs.slice(0, 50).map((log) => generateEvidenceHash(log))
    ),
    data: userAccessLogs.slice(0, 50),
    record_count: userAccessLogs.length,
  });

  // 2. Disponibilidade
  const onlineAgents = (data.agents || []).filter((a) => a.status === "active");
  const offlineAgents = (data.agents || []).filter((a) => a.status !== "active");
  sections.push({
    id: "system_availability",
    title: "Disponibilidade",
    description: "Uptime e disponibilidade do sistema (A1 - Availability)",
    evidence_refs: await Promise.all(
      (data.agents || []).slice(0, 30).map((a) => generateEvidenceHash(a))
    ),
    data: {
      total_agents: (data.agents || []).length,
      online_agents: onlineAgents.length,
      offline_agents: offlineAgents.length,
      availability_rate: (data.agents || []).length > 0
        ? ((onlineAgents.length / (data.agents || []).length) * 100).toFixed(2) + "%"
        : "N/A",
    },
    record_count: (data.agents || []).length,
  });

  // 3. Trilhas de Auditoria
  const allAuditLogs = (data.auditLogs || []).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  sections.push({
    id: "audit_trails",
    title: "Trilhas de Auditoria",
    description: "Logs completos de operações (CC7.2 - System Monitoring)",
    evidence_refs: await Promise.all(
      allAuditLogs.slice(0, 50).map((log) => generateEvidenceHash(log))
    ),
    data: allAuditLogs.slice(0, 50),
    record_count: allAuditLogs.length,
  });

  // 4. Eventos de Segurança
  const securityEvents = (data.securityEvents || []);
  const blockedAttempts = (data.blockedAttempts || []);
  sections.push({
    id: "security_events",
    title: "Eventos de Segurança",
    description: "Detecção e resposta a ameaças (CC7.3 - Security Events)",
    evidence_refs: await Promise.all(
      [...securityEvents.slice(0, 25), ...blockedAttempts.slice(0, 25)].map((item) =>
        generateEvidenceHash(item)
      )
    ),
    data: {
      security_events: securityEvents.slice(0, 25),
      blocked_attempts: blockedAttempts.slice(0, 25),
    },
    record_count: securityEvents.length + blockedAttempts.length,
  });

  return sections;
}

/**
 * Calcula resumo dos invariantes
 */
export function calculateInvariantsSummary(
  invariants: Array<{ status: string }>
): { total: number; passed: number; failed: number; unknown: number } {
  return {
    total: invariants.length,
    passed: invariants.filter((i) => i.status === "PASS").length,
    failed: invariants.filter((i) => i.status === "FAIL").length,
    unknown: invariants.filter((i) => i.status === "UNKNOWN").length,
  };
}
