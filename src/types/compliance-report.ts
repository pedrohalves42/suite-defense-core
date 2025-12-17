/**
 * BLOCO 2: Compliance Evidence Bundle - Type Contracts
 * 
 * Contrato formal para relatórios de compliance com validade jurídica.
 * Nenhum PDF pode ser gerado fora desse payload.
 */

export type ComplianceTemplate = "LGPD" | "ISO_27001" | "SOC2_LITE";

export interface ComplianceSection {
  id: string;
  title: string;
  description: string;
  evidence_refs: string[]; // IDs ou hashes das evidências
  data: unknown;
  record_count: number;
}

export type InvariantStatus = "PASS" | "FAIL" | "UNKNOWN";

export interface SecurityInvariantStatus {
  id: string; // INV-001 a INV-006
  name: string;
  description: string;
  status: InvariantStatus;
  evidence_hash: string;
  details?: string;
  checked_at: string;
}

export interface ActivePolicy {
  id: string;
  domain_pattern: string;
  reason: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ComplianceReportPayload {
  // Identificação
  audit_id: string; // LAUDO-{uuid.slice(0,8)}-{timestamp}
  tenant_id: string;
  tenant_name: string;
  
  // Template e período
  template: ComplianceTemplate;
  template_name: string;
  template_description: string;
  period_start: string;
  period_end: string;
  
  // Timestamps
  generated_at: string; // UTC-3
  valid_until: string; // +30 dias
  
  // Invariantes de segurança
  invariants: SecurityInvariantStatus[];
  invariants_summary: {
    total: number;
    passed: number;
    failed: number;
    unknown: number;
  };
  
  // Políticas ativas
  active_policies: ActivePolicy[];
  policies_count: number;
  
  // Seções do template
  sections: ComplianceSection[];
  
  // Métricas de risco
  risk_score: number;
  risk_level: string;
  risk_description: string;
  
  // Estatísticas gerais
  statistics: {
    total_agents: number;
    total_vulnerabilities: number;
    critical_vulnerabilities: number;
    high_vulnerabilities: number;
    threats_found: number;
    security_events: number;
    audit_logs: number;
  };
  
  // Criptografia - OBRIGATÓRIO
  sha256: string;
  hmac_signature: string;
  
  // Metadados
  format_version: string;
  generator: string;
}

export interface ComplianceReportRequest {
  template: ComplianceTemplate;
  period_start?: string;
  period_end?: string;
  agent_id?: string;
}

export interface ComplianceReportResponse {
  success: boolean;
  payload?: ComplianceReportPayload;
  error?: string;
}

// Template definitions for UI
export interface TemplateDefinition {
  id: ComplianceTemplate;
  name: string;
  description: string;
  icon: string;
  color: string;
  sections: {
    id: string;
    title: string;
    description: string;
  }[];
}

export const TEMPLATE_DEFINITIONS: Record<ComplianceTemplate, TemplateDefinition> = {
  LGPD: {
    id: "LGPD",
    name: "LGPD",
    description: "Lei Geral de Proteção de Dados",
    icon: "Scale",
    color: "blue",
    sections: [
      { id: "data_access", title: "Logs de Acesso", description: "Registros de acesso a dados sensíveis" },
      { id: "data_retention", title: "Retenção de Dados", description: "Política de retenção e exclusão" },
      { id: "consent_tracking", title: "Rastreamento de Consentimento", description: "Evidência de consentimentos" },
      { id: "incident_response", title: "Resposta a Incidentes", description: "Eventos de segurança relacionados" },
    ],
  },
  ISO_27001: {
    id: "ISO_27001",
    name: "ISO 27001",
    description: "Gestão de Segurança da Informação",
    icon: "Shield",
    color: "green",
    sections: [
      { id: "policy_enforcement", title: "Aplicação de Políticas", description: "Status de políticas de segurança" },
      { id: "incident_timeline", title: "Timeline de Incidentes", description: "Histórico de eventos de segurança" },
      { id: "change_logs", title: "Logs de Alterações", description: "Auditoria de mudanças no sistema" },
      { id: "access_control", title: "Controle de Acesso", description: "Gestão de permissões e acessos" },
    ],
  },
  SOC2_LITE: {
    id: "SOC2_LITE",
    name: "SOC2-lite",
    description: "Trust Services Criteria",
    icon: "Lock",
    color: "purple",
    sections: [
      { id: "user_access", title: "Acesso de Usuários", description: "Trilha de auditoria de acessos" },
      { id: "system_availability", title: "Disponibilidade", description: "Uptime e disponibilidade do sistema" },
      { id: "audit_trails", title: "Trilhas de Auditoria", description: "Logs completos de operações" },
      { id: "security_events", title: "Eventos de Segurança", description: "Detecção e resposta a ameaças" },
    ],
  },
};

// Security Invariants definitions
export const SECURITY_INVARIANTS_DEFINITIONS = [
  { id: "INV-001", name: "RLS Ativo", description: "Row Level Security habilitado em todas as tabelas" },
  { id: "INV-002", name: "Autenticação HMAC", description: "HMAC-SHA256 validado em todas requisições de agentes" },
  { id: "INV-003", name: "Isolamento Multi-Tenant", description: "Dados isolados por tenant_id" },
  { id: "INV-004", name: "Secrets Protegidos", description: "Credenciais não expostas em logs ou respostas" },
  { id: "INV-005", name: "Fail-Closed", description: "Sistema falha de forma segura em caso de erro" },
  { id: "INV-006", name: "DNS Filter Ativo", description: "Filtro DNS local operacional quando habilitado" },
] as const;
