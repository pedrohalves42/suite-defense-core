/**
 * Manifest of all documentation files organized by category.
 * Used by the DocsExport page to generate PDFs.
 */

export interface DocEntry {
  title: string;
  path: string;
}

export interface DocCategory {
  name: string;
  icon: string;
  docs: DocEntry[];
}

export const docsManifest: DocCategory[] = [
  {
    name: 'Políticas de Segurança',
    icon: '🔒',
    docs: [
      { title: 'Política de Segurança da Informação', path: 'policies/01_information_security_policy.md' },
      { title: 'Controle de Acesso', path: 'policies/02_access_control_policy.md' },
      { title: 'Gestão de Mudanças', path: 'policies/03_change_management_policy.md' },
      { title: 'Resposta a Incidentes', path: 'policies/04_incident_response_policy.md' },
      { title: 'Logging e Monitoramento', path: 'policies/05_logging_monitoring_policy.md' },
      { title: 'Classificação e Retenção de Dados', path: 'policies/06_data_retention_policy.md' },
      { title: 'Risco de Fornecedores', path: 'policies/07_vendor_risk_policy.md' },
      { title: 'Continuidade de Negócios', path: 'policies/08_business_continuity_policy.md' },
      { title: 'Desenvolvimento Seguro', path: 'policies/09_secure_development_policy.md' },
      { title: 'Segurança Física', path: 'policies/10_physical_security_policy.md' },
      { title: 'Criptografia', path: 'policies/11_cryptography_policy.md' },
      { title: 'Segurança de Rede', path: 'policies/12_network_security_policy.md' },
      { title: 'Privacidade de Dados', path: 'policies/13_data_privacy_policy.md' },
      { title: 'Uso Aceitável', path: 'policies/14_acceptable_use_policy.md' },
      { title: 'Divulgação Responsável', path: 'policies/15_responsible_disclosure_policy.md' },
    ],
  },
  {
    name: 'Conformidade',
    icon: '✅',
    docs: [
      { title: 'Matriz de Evidências SOC 2', path: 'compliance/soc2_evidence_matrix.md' },
      { title: 'DPIA / RIPD', path: 'compliance/DPIA_RIPD.md' },
      { title: 'ROPA', path: 'compliance/ROPA.md' },
      { title: 'SLA', path: 'compliance/SLA.md' },
      { title: 'Inventário de Ativos', path: 'compliance/asset_inventory.md' },
      { title: 'Plano de Comunicação de Violação', path: 'compliance/breach_communication_plan.md' },
      { title: 'Plano de Recuperação de Desastres', path: 'compliance/disaster_recovery_plan.md' },
      { title: 'Procedimento MFA', path: 'compliance/mfa_enforcement_procedure.md' },
      { title: 'Programa de Privacidade', path: 'compliance/privacy_program.md' },
      { title: 'Plano de Remediação de Riscos', path: 'compliance/risk_remediation_plan.md' },
      { title: 'Matriz de Riscos', path: 'compliance/risk_matrix.md' },
      { title: 'Controles de Segurança', path: 'compliance/security_controls.md' },
    ],
  },
  {
    name: 'Jurídico',
    icon: '⚖️',
    docs: [
      { title: 'Termos de Serviço', path: 'legal/terms_of_service.md' },
      { title: 'Acordo de Processamento de Dados (DPA)', path: 'legal/data_processing_agreement.md' },
    ],
  },
  {
    name: 'Procedimentos',
    icon: '📋',
    docs: [
      { title: 'Procedimento Break Glass', path: 'procedures/break_glass_procedure.md' },
      { title: 'Plano de Resposta a Incidentes', path: 'procedures/incident_response_plan.md' },
      { title: 'Procedimento de Recuperação de Desastres', path: 'procedures/disaster_recovery_procedure.md' },
      { title: 'Procedimento MFA', path: 'procedures/mfa_procedure.md' },
    ],
  },
  {
    name: 'Runbooks',
    icon: '🔧',
    docs: [
      { title: 'Modo de Emergência (Kill Switch)', path: 'runbooks/RUNBOOK-EMERGENCY-MODE.md' },
      { title: 'Erros 500 em Edge Functions', path: 'runbooks/RUNBOOK-EDGE-500.md' },
      { title: 'Rotação de Chaves', path: 'runbooks/RUNBOOK-KEY-ROTATION.md' },
      { title: 'Cron Job Silencioso', path: 'runbooks/RUNBOOK-CRON-SILENT.md' },
      { title: 'Detecção de Schema Drift', path: 'runbooks/RUNBOOK-SCHEMA-DRIFT.md' },
      { title: 'Ciclo de Vida do Tenant', path: 'runbooks/RUNBOOK-TENANT-LIFECYCLE.md' },
    ],
  },
  {
    name: 'Segurança',
    icon: '🛡️',
    docs: [
      { title: 'Arquitetura de Segurança', path: 'security/SECURITY_ARCHITECTURE.md' },
      { title: 'Invariantes de Segurança', path: 'security/SECURITY_INVARIANTS.md' },
      { title: 'Auditoria de Segurança 2025', path: 'security/CYBERSHIELD_SECURITY_AUDIT_2025.md' },
      { title: 'Boas Práticas RLS', path: 'security/RLS_BEST_PRACTICES.md' },
      { title: 'Mapa de Políticas RLS', path: 'security/RLS_POLICY_MAP.md' },
      { title: 'Segurança Super Admin', path: 'security/SUPER_ADMIN_SECURITY.md' },
      { title: 'Divulgação Responsável', path: 'security/responsible_disclosure_policy.md' },
    ],
  },
  {
    name: 'Arquitetura',
    icon: '🏗️',
    docs: [
      { title: 'Visão Geral da Arquitetura', path: 'architecture/ARCHITECTURE_OVERVIEW.md' },
      { title: 'Arquitetura do Banco de Dados', path: 'architecture/DATABASE_ARCHITECTURE.md' },
      { title: 'Fluxo de Dados', path: 'architecture/DATA_FLOW_ARCHITECTURE.md' },
      { title: 'Especificação HMAC', path: 'architecture/HMAC_SPECIFICATION.md' },
    ],
  },
  {
    name: 'Agente',
    icon: '🤖',
    docs: [
      { title: 'Guia de Deploy do Agente', path: 'agente/AGENT_DEPLOYMENT_GUIDE.md' },
      { title: 'Troubleshooting do Agente', path: 'agente/AGENT_TROUBLESHOOTING_NINJA.md' },
      { title: 'Guia de Atualização v3', path: 'agente/AGENT_V3_UPGRADE_GUIDE.md' },
      { title: 'Reinstalação em Massa', path: 'agente/AGENT_MASS_REINSTALL_V412.md' },
      { title: 'Arquitetura do Instalador', path: 'agente/INSTALLER_ARCHITECTURE.md' },
      { title: 'Assinatura macOS', path: 'agente/MACOS_CODE_SIGNING.md' },
      { title: 'Instalação macOS', path: 'agente/MACOS_INSTALLATION_GUIDE.md' },
    ],
  },
  {
    name: 'Operações',
    icon: '⚙️',
    docs: [
      { title: 'Guia do Dashboard', path: 'operacoes/DASHBOARD_USER_GUIDE_UPDATED.md' },
      { title: 'Checklist de Deploy', path: 'operacoes/DEPLOYMENT_CHECKLIST.md' },
      { title: 'Guia de Setup', path: 'operacoes/SETUP_GUIDE.md' },
      { title: 'Troubleshooting', path: 'operacoes/TROUBLESHOOTING.md' },
      { title: 'Guia de Linguagem', path: 'operacoes/LANGUAGE_GUIDE.md' },
    ],
  },
  {
    name: 'Governança',
    icon: '📊',
    docs: [
      { title: 'Whitepaper CyberShield', path: 'governanca/CYBERSHIELD_WHITEPAPER.md' },
      { title: 'Governança de IA', path: 'governanca/AI_GOVERNANCE_POLICY.md' },
      { title: 'Framework de Auditoria', path: 'governanca/AUDIT_FRAMEWORK.md' },
      { title: 'Metodologia Nullmann', path: 'governanca/NULLMANN_METHODOLOGY.md' },
    ],
  },
  {
    name: 'Jobs',
    icon: '⏱️',
    docs: [
      { title: 'Governança da Engine de Jobs', path: 'jobs/JOB_ENGINE_GOVERNANCE.md' },
      { title: 'Migração Jobs v1 vs v3', path: 'jobs/JOBS_V1_VS_V3.md' },
      { title: 'Migração v3 Completa', path: 'jobs/JOBS_V3_MIGRATION_COMPLETE.md' },
    ],
  },
];

/** Total number of documents */
export const totalDocs = docsManifest.reduce((sum, cat) => sum + cat.docs.length, 0);
