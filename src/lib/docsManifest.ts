/**
 * Manifest of all documentation files organized by category.
 * Used by the DocsExport page to generate PDFs.
 * 
 * IMPORTANT: All paths must match actual files in the /docs/ directory.
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
      { title: 'Privacidade e LGPD', path: 'policies/10_privacy_lgpd_policy.md' },
      { title: 'Criptografia', path: 'policies/11_cryptography_policy.md' },
      { title: 'Gestão de Vulnerabilidades', path: 'policies/12_vulnerability_management_policy.md' },
      { title: 'Uso Aceitável', path: 'policies/13_acceptable_use_policy.md' },
      { title: 'Conscientização de Segurança', path: 'policies/14_security_awareness_training.md' },
      { title: 'Política de Senhas', path: 'policies/16_password_policy.md' },
      { title: 'Política de Backup e Restore', path: 'policies/17_backup_restore_policy.md' },
      { title: 'Gestão de Patches', path: 'policies/18_patch_management_policy.md' },
      { title: 'Classificação da Informação', path: 'policies/19_information_classification_policy.md' },
      { title: 'Trabalho Remoto', path: 'policies/20_remote_work_policy.md' },
      { title: 'Política de Dados do Agente', path: 'policies/DATA-AGENT-001.md' },
    ],
  },
  {
    name: 'Conformidade',
    icon: '✅',
    docs: [
      { title: 'Matriz de Evidências SOC 2', path: 'compliance/soc2_evidence_matrix.md' },
      { title: 'DPIA / RIPD', path: 'compliance/DPIA_RIPD.md' },
      { title: 'ROPA', path: 'compliance/ROPA.md' },
      { title: 'SLA / SLO', path: 'compliance/SLA_SLO.md' },
      { title: 'Inventário de Ativos', path: 'compliance/asset_inventory.md' },
      { title: 'Plano de Comunicação de Violação', path: 'compliance/breach_communication_plan.md' },
      { title: 'Registro de Consentimento (LGPD)', path: 'compliance/consent_register.md' },
      { title: 'Matriz de Riscos', path: 'compliance/risk_assessment_matrix.md' },
      { title: 'Relatório de Conformidade (ADR-026)', path: 'compliance/ADR-026-COMPLIANCE-REPORT.md' },
      { title: 'Charter do CAB', path: 'compliance/cab_charter.md' },
      { title: 'Roadmap de Conformidade', path: 'compliance/compliance_roadmap.md' },
      { title: 'Template de Pentest', path: 'compliance/pentest_report_template.md' },
      { title: 'Mapa de Integrações de Terceiros', path: 'compliance/third_party_integrations_map.md' },
      { title: 'Mapa de Preços Stripe', path: 'compliance/stripe-pricing-map.md' },
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
      { title: 'Plano de Recuperação de Desastres', path: 'procedures/disaster_recovery_plan.md' },
      { title: 'Procedimento de Reset MFA', path: 'procedures/mfa_reset_procedure.md' },
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
      { title: 'Changelog de Invariantes', path: 'security/SECURITY_INVARIANTS_CHANGELOG.md' },
      { title: 'Auditoria de Segurança 2025', path: 'security/CYBERSHIELD_SECURITY_AUDIT_2025.md' },
      { title: 'Boas Práticas RLS', path: 'security/RLS_BEST_PRACTICES.md' },
      { title: 'Mapa de Políticas RLS', path: 'security/RLS_POLICY_MAP.md' },
      { title: 'Auditoria de Políticas RLS', path: 'security/rls-policies-audit.md' },
      { title: 'Segurança Super Admin', path: 'security/SUPER_ADMIN_SECURITY.md' },
      { title: 'Divulgação Responsável', path: 'security/responsible_disclosure_policy.md' },
      { title: 'Visão Geral de Segurança', path: 'security/SECURITY.md' },
      { title: 'Auditoria Security Definer', path: 'security/SECURITY_DEFINER_AUDIT.md' },
      { title: 'Validação de Correções', path: 'security/SECURITY_FIXES_VALIDATION.md' },
      { title: 'Validação de Segurança', path: 'security/SECURITY_VALIDATION.md' },
      { title: 'Auditoria de Isolamento', path: 'security/security-isolation-audit.md' },
      { title: 'Regressão HMAC (2026-01)', path: 'security/FINDING-2026-01-16-hmac-regression.md' },
    ],
  },
  {
    name: 'Arquitetura',
    icon: '🏗️',
    docs: [
      { title: 'Visão Geral da Arquitetura', path: 'architecture/ARCHITECTURE_OVERVIEW.md' },
      { title: 'Arquitetura do Banco de Dados', path: 'architecture/DATABASE_ARCHITECTURE.md' },
      { title: 'Documentação do Banco', path: 'architecture/DATABASE_DOCUMENTATION.md' },
      { title: 'Fluxo de Dados', path: 'architecture/DATA_FLOW_ARCHITECTURE.md' },
      { title: 'Fluxo de Dados (Atualizado)', path: 'architecture/DATA_FLOW_UPDATED.md' },
      { title: 'Especificação HMAC', path: 'architecture/HMAC_SPECIFICATION.md' },
      { title: 'Arquitetura Multi-Provider IA', path: 'architecture/AI_MULTI_PROVIDER_ARCHITECTURE.md' },
      { title: 'ADR-007: View Active Agents', path: 'architecture/ADR-007-active-agents-view.md' },
      { title: 'ADR-008: Governança de Incidentes', path: 'architecture/ADR-008-incident-governance-jan2026.md' },
      { title: 'ADR-021: Closed-Loop Governance', path: 'architecture/ADR-021-closed-loop-governance.md' },
      { title: 'ADR-023: Hardening RLS', path: 'architecture/ADR-023-rls-hardening.md' },
      { title: 'ADR-024: Hardening RLS Fase 2', path: 'architecture/ADR-024-rls-hardening-phase2.md' },
      { title: 'ADR-024: Task Engine', path: 'architecture/ADR-024-task-engine.md' },
      { title: 'ADR-025: Fechamento de Governança', path: 'architecture/ADR-025-governance-closure.md' },
      { title: 'ADR-026: Isolamento de Tenant', path: 'architecture/ADR-026-active-tenant-isolation.md' },
      { title: 'ADR-026: Operações de Segurança', path: 'architecture/ADR-026-security-operations.md' },
      { title: 'ADR-027: Contratos de Edge', path: 'architecture/ADR-027-edge-contracts.md' },
      { title: 'ADR-028: Kill Switch Semântico', path: 'architecture/ADR-028-kill-switch-semantics.md' },
      { title: 'ADR-037: Security Views RLS Review', path: 'architecture/ADR-037-security-views-rls-review.md' },
    ],
  },
  {
    name: 'Agente',
    icon: '🤖',
    docs: [
      { title: 'Guia de Deploy do Agente', path: 'agente/AGENT_DEPLOYMENT_GUIDE.md' },
      { title: 'Troubleshooting do Agente', path: 'agente/AGENT_TROUBLESHOOTING_NINJA.md' },
      { title: 'Guia de Atualização v3', path: 'agente/AGENT_V3_UPGRADE_GUIDE.md' },
      { title: 'Reinstalação em Massa v4.12', path: 'agente/AGENT_MASS_REINSTALL_V412.md' },
      { title: 'Arquitetura do Instalador', path: 'agente/INSTALLER_ARCHITECTURE.md' },
      { title: 'Assinatura macOS', path: 'agente/MACOS_CODE_SIGNING.md' },
      { title: 'Instalação macOS', path: 'agente/MACOS_INSTALLATION_GUIDE.md' },
      { title: 'Suporte a Proxy macOS', path: 'agente/MACOS_PROXY_SUPPORT.md' },
      { title: 'Guia de Limpeza do Agente', path: 'agente/AGENT_CLEANUP_GUIDE.md' },
      { title: 'Guia de Redeploy', path: 'agente/AGENT_REDEPLOY_GUIDE.md' },
      { title: 'Instruções de Reinstalação', path: 'agente/AGENT_REINSTALL_INSTRUCTIONS.md' },
      { title: 'Reinstalação v4', path: 'agente/AGENT_REINSTALL_V4.md' },
      { title: 'Sincronização de Scripts', path: 'agente/AGENT_SCRIPT_SYNC.md' },
      { title: 'Validação de Assinatura', path: 'agente/AGENT_SIGNATURE_VALIDATION.md' },
      { title: 'Auto Update (Produção)', path: 'agente/AUTO_UPDATE_PRODUCTION.md' },
      { title: 'Hardening do Instalador', path: 'agente/INSTALLER_HARDENING_IMPLEMENTED.md' },
      { title: 'Análise de Log do Instalador', path: 'agente/INSTALLER_LOG_ANALYSIS_GUIDE.md' },
      { title: 'Troubleshooting do Instalador', path: 'agente/INSTALLER_TROUBLESHOOTING.md' },
      { title: 'Procedimento de Reinstalação v3', path: 'agente/REINSTALL_PROCEDURE_V3.md' },
      { title: 'Monitor de Agentes Travados', path: 'agente/STUCK_AGENTS_MONITOR.md' },
    ],
  },
  {
    name: 'Operações',
    icon: '⚙️',
    docs: [
      { title: 'Guia do Dashboard', path: 'operacoes/DASHBOARD_USER_GUIDE_UPDATED.md' },
      { title: 'Troubleshooting do Dashboard', path: 'operacoes/DASHBOARD_TROUBLESHOOTING.md' },
      { title: 'Checklist de Deploy', path: 'operacoes/DEPLOYMENT_CHECKLIST.md' },
      { title: 'Guia de Setup', path: 'operacoes/SETUP_GUIDE.md' },
      { title: 'Troubleshooting', path: 'operacoes/TROUBLESHOOTING.md' },
      { title: 'Troubleshooting do Instalador', path: 'operacoes/TROUBLESHOOTING_INSTALLER.md' },
      { title: 'Guia de Linguagem', path: 'operacoes/LANGUAGE_GUIDE.md' },
      { title: 'Plano de Capacidade', path: 'operacoes/capacity_plan.md' },
      { title: 'Enforcement ASCII', path: 'operacoes/ASCII_ENFORCEMENT.md' },
      { title: 'Guia de Limpeza', path: 'operacoes/CLEANUP_GUIDE.md' },
      { title: 'Implementação de Diagnósticos', path: 'operacoes/DIAGNOSTICS_IMPLEMENTATION.md' },
      { title: 'Operações de Filtro DNS', path: 'operacoes/DNS_FILTER_OPERATIONS.md' },
      { title: 'Handling de Múltiplos Roles', path: 'operacoes/MULTIPLE_ROLES_HANDLING.md' },
      { title: 'Análise de Performance SQL', path: 'operacoes/SQL_PERFORMANCE_ANALYSIS.md' },
      { title: 'Resultados de Performance SQL', path: 'operacoes/SQL_PERFORMANCE_RESULTS.md' },
      { title: 'Diagnósticos do Sistema', path: 'operacoes/SYSTEM_DIAGNOSTICS.md' },
      { title: 'Teste de Saúde da Instalação', path: 'operacoes/TESTING_INSTALLATION_HEALTH.md' },
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
      { title: 'Playbook de Resposta a Incidentes', path: 'governanca/PLAYBOOK_INCIDENT_RESPONSE.md' },
    ],
  },
  {
    name: 'Jobs',
    icon: '⏱️',
    docs: [
      { title: 'Governança da Engine de Jobs', path: 'jobs/JOB_ENGINE_GOVERNANCE.md' },
      { title: 'Migração Jobs v1 vs v3', path: 'jobs/JOBS_V1_VS_V3.md' },
      { title: 'Migração v3 Completa', path: 'jobs/JOBS_V3_MIGRATION_COMPLETE.md' },
      { title: 'Validação Canônica de Jobs', path: 'jobs/JOB_CANONICO_VALIDACAO.md' },
      { title: 'Validação de Scan de Jobs', path: 'jobs/JOB_SCAN_VALIDATION.md' },
    ],
  },
];

/** Total number of documents */
export const totalDocs = docsManifest.reduce((sum, cat) => sum + cat.docs.length, 0);
