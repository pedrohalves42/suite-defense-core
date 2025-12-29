/**
 * SOC 2 Trust Services Criteria Types
 * Complete type definitions for SOC 2 Type I compliance tracking
 */

export type SOC2Status = 'not_started' | 'in_progress' | 'implemented' | 'verified';

export type CriteriaCode = 'CC1' | 'CC2' | 'CC3' | 'CC4' | 'CC5' | 'CC6' | 'CC7' | 'CC8' | 'CC9';

export type PolicyStatus = 'draft' | 'review' | 'approved' | 'deprecated';

export type VendorCriticality = 'low' | 'medium' | 'high' | 'critical';

export type VendorStatus = 'active' | 'pending_review' | 'suspended' | 'terminated';

export interface SOC2Control {
  id: string;
  tenantId: string;
  criteriaId: string;
  controlCode: string;
  controlName: string;
  description?: string;
  status: SOC2Status;
  evidenceType?: 'table' | 'function' | 'policy' | 'document' | 'trigger' | 'rls';
  evidenceRef?: string;
  gapNotes?: string;
  remediationPlan?: string;
  owner?: string;
  dueDate?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SOC2Criteria {
  id: string;
  tenantId: string;
  criteriaCode: CriteriaCode;
  criteriaName: string;
  description?: string;
  status: SOC2Status;
  implementationNotes?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  createdAt: string;
  updatedAt: string;
  controls?: SOC2Control[];
}

export interface CompliancePolicy {
  id: string;
  tenantId: string;
  policyCode: string;
  policyName: string;
  version: string;
  status: PolicyStatus;
  contentHash?: string;
  owner?: string;
  approvedBy?: string;
  approvedAt?: string;
  effectiveDate?: string;
  reviewDate?: string;
  soc2Criteria: CriteriaCode[];
  filePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VendorRisk {
  id: string;
  tenantId: string;
  vendorName: string;
  vendorType: 'cloud' | 'payment' | 'email' | 'database' | 'other';
  criticality: VendorCriticality;
  servicesProvided: string[];
  dataShared: string[];
  complianceCertifications: string[];
  contractStartDate?: string;
  contractEndDate?: string;
  lastReviewDate?: string;
  nextReviewDate?: string;
  riskScore?: number;
  riskNotes?: string;
  status: VendorStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SOC2ReadinessView {
  tenantId: string;
  criteriaCode: CriteriaCode;
  criteriaName: string;
  criteriaStatus: SOC2Status;
  totalControls: number;
  verifiedControls: number;
  implementedControls: number;
  inProgressControls: number;
  notStartedControls: number;
  criteriaReadinessScore: number;
}

// ============================================
// SOC 2 TRUST SERVICES CRITERIA DEFINITIONS
// ============================================

export interface CriteriaDefinition {
  code: CriteriaCode;
  name: string;
  fullName: string;
  description: string;
  objective: string;
  controls: ControlDefinition[];
}

export interface ControlDefinition {
  code: string;
  name: string;
  description: string;
  evidenceType: SOC2Control['evidenceType'];
  evidenceRef: string;
  cyberShieldImplementation: string;
}

export const SOC2_TRUST_CRITERIA: CriteriaDefinition[] = [
  {
    code: 'CC1',
    name: 'Control Environment',
    fullName: 'CC1 — Control Environment',
    description: 'Governance, ethics, responsibility, and organizational commitment to security.',
    objective: 'Ensure the organization demonstrates commitment with integrity, ethics, security, and responsibility.',
    controls: [
      {
        code: 'CC1.1',
        name: 'Organizational Structure',
        description: 'Clear separation between users, tenants, and agents',
        evidenceType: 'table',
        evidenceRef: 'user_roles, tenants',
        cyberShieldImplementation: 'RBAC formal with explicit roles in the system',
      },
      {
        code: 'CC1.2',
        name: 'Security Principles',
        description: 'Security-by-design and Zero Trust',
        evidenceType: 'policy',
        evidenceRef: 'Information Security Policy',
        cyberShieldImplementation: 'Backend validation + HMAC mandatory',
      },
      {
        code: 'CC1.3',
        name: 'Tenant Isolation',
        description: 'Mandatory tenant_id in all entities',
        evidenceType: 'rls',
        evidenceRef: 'RLS policies on all tables',
        cyberShieldImplementation: 'RLS in all sensitive tables',
      },
      {
        code: 'CC1.4',
        name: 'Accountability',
        description: 'All actions are logged',
        evidenceType: 'table',
        evidenceRef: 'audit_logs, job_executions',
        cyberShieldImplementation: 'Immutable logs with hashes',
      },
    ],
  },
  {
    code: 'CC2',
    name: 'Communication & Information',
    fullName: 'CC2 — Communication & Information',
    description: 'Documented and communicated policies.',
    objective: 'Ensure relevant policies are documented and adequately communicated.',
    controls: [
      {
        code: 'CC2.1',
        name: 'Formal Policies',
        description: 'Documented SOC 2 policy set',
        evidenceType: 'document',
        evidenceRef: 'docs/policies/',
        cyberShieldImplementation: 'Versioned policies in repository',
      },
      {
        code: 'CC2.2',
        name: 'Internal Communication',
        description: 'Docs + versioning',
        evidenceType: 'document',
        evidenceRef: 'Repository with history',
        cyberShieldImplementation: 'Git + history',
      },
    ],
  },
  {
    code: 'CC3',
    name: 'Risk Assessment',
    fullName: 'CC3 — Risk Assessment',
    description: 'Identification and mitigation of risks.',
    objective: 'Identify risks that may affect security, availability, or integrity.',
    controls: [
      {
        code: 'CC3.1',
        name: 'Cross-tenant Attack',
        description: 'RLS + backend validations',
        evidenceType: 'rls',
        evidenceRef: 'RLS policies',
        cyberShieldImplementation: 'RLS + explicit validations in Edge Functions',
      },
      {
        code: 'CC3.2',
        name: 'Compromised Agent',
        description: 'HMAC + nonce',
        evidenceType: 'function',
        evidenceRef: 'verifyHmacSignature()',
        cyberShieldImplementation: 'HMAC mandatory for all agent calls',
      },
      {
        code: 'CC3.3',
        name: 'Replay Attack',
        description: 'Tokens with expiration',
        evidenceType: 'table',
        evidenceRef: 'agent_tokens',
        cyberShieldImplementation: 'Token expiration + nonce',
      },
      {
        code: 'CC3.4',
        name: 'Human Error',
        description: 'Backend enforcement',
        evidenceType: 'trigger',
        evidenceRef: 'SQL triggers',
        cyberShieldImplementation: 'Validation triggers + RLS',
      },
    ],
  },
  {
    code: 'CC4',
    name: 'Monitoring Activities',
    fullName: 'CC4 — Monitoring Activities',
    description: 'Continuous monitoring.',
    objective: 'Detect control failures and security incidents.',
    controls: [
      {
        code: 'CC4.1',
        name: 'Job Monitoring',
        description: 'Formal states',
        evidenceType: 'table',
        evidenceRef: 'jobs, job_executions',
        cyberShieldImplementation: 'State machine with formal states',
      },
      {
        code: 'CC4.2',
        name: 'Failure Monitoring',
        description: 'Structured logs',
        evidenceType: 'table',
        evidenceRef: 'security_events',
        cyberShieldImplementation: 'Error logs with severity',
      },
      {
        code: 'CC4.3',
        name: 'Abuse Monitoring',
        description: 'Rate limiting',
        evidenceType: 'function',
        evidenceRef: 'Rate limiting in Edge Functions',
        cyberShieldImplementation: 'Rate limiting + automatic blocking',
      },
    ],
  },
  {
    code: 'CC5',
    name: 'Control Activities',
    fullName: 'CC5 — Control Activities',
    description: 'Execution of technical controls.',
    objective: 'Ensure security controls are executed correctly.',
    controls: [
      {
        code: 'CC5.1',
        name: 'Authorization',
        description: 'Backend-only',
        evidenceType: 'function',
        evidenceRef: 'Edge Functions',
        cyberShieldImplementation: 'All authorization in Edge Functions',
      },
      {
        code: 'CC5.2',
        name: 'Validation',
        description: 'Edge Functions',
        evidenceType: 'function',
        evidenceRef: 'Zod validation',
        cyberShieldImplementation: 'Zod schema validation',
      },
      {
        code: 'CC5.3',
        name: 'Enforcement',
        description: 'SQL Triggers',
        evidenceType: 'trigger',
        evidenceRef: 'State transition triggers',
        cyberShieldImplementation: 'Triggers blocking illegal transitions',
      },
      {
        code: 'CC5.4',
        name: 'Immutability',
        description: 'No DELETE/UPDATE',
        evidenceType: 'rls',
        evidenceRef: 'Audit log policies',
        cyberShieldImplementation: 'RLS blocking deletion of audit logs',
      },
    ],
  },
  {
    code: 'CC6',
    name: 'Logical Access Controls',
    fullName: 'CC6 — Logical & Physical Access Controls',
    description: 'Logical access control.',
    objective: 'Restrict access to systems and data.',
    controls: [
      {
        code: 'CC6.1',
        name: 'Authentication',
        description: 'Tokens with expiration',
        evidenceType: 'table',
        evidenceRef: 'agent_tokens',
        cyberShieldImplementation: 'JWT + token expiration',
      },
      {
        code: 'CC6.2',
        name: 'Authorization',
        description: 'RBAC',
        evidenceType: 'table',
        evidenceRef: 'user_roles',
        cyberShieldImplementation: 'Role-based access control',
      },
      {
        code: 'CC6.3',
        name: 'Isolation',
        description: 'Native multi-tenant',
        evidenceType: 'rls',
        evidenceRef: 'All RLS policies',
        cyberShieldImplementation: 'tenant_id in all tables + RLS',
      },
      {
        code: 'CC6.4',
        name: 'Protection',
        description: 'Zero Trust',
        evidenceType: 'function',
        evidenceRef: 'HMAC verification',
        cyberShieldImplementation: 'HMAC mandatory + validation',
      },
    ],
  },
  {
    code: 'CC7',
    name: 'System Operations',
    fullName: 'CC7 — System Operations',
    description: 'Secure system operation.',
    objective: 'Detect and respond to operational and security incidents.',
    controls: [
      {
        code: 'CC7.1',
        name: 'Job Failure',
        description: 'Mandatory error',
        evidenceType: 'trigger',
        evidenceRef: 'Job state triggers',
        cyberShieldImplementation: 'Trigger requiring error_message on failure',
      },
      {
        code: 'CC7.2',
        name: 'Offline Agent',
        description: 'Automatic cleanup',
        evidenceType: 'function',
        evidenceRef: 'cleanup_offline_agents_jobs',
        cyberShieldImplementation: 'Automatic cleanup of offline agents',
      },
      {
        code: 'CC7.3',
        name: 'Abuse',
        description: 'Rate limiting + block',
        evidenceType: 'function',
        evidenceRef: 'Rate limiting',
        cyberShieldImplementation: 'Blocking + security_events logging',
      },
      {
        code: 'CC7.4',
        name: 'Attack',
        description: 'Block + log',
        evidenceType: 'table',
        evidenceRef: 'security_events',
        cyberShieldImplementation: 'Event logging with severity',
      },
    ],
  },
  {
    code: 'CC8',
    name: 'Change Management',
    fullName: 'CC8 — Change Management',
    description: 'Change control.',
    objective: 'Ensure changes are authorized, tested, and traceable.',
    controls: [
      {
        code: 'CC8.1',
        name: 'Code',
        description: 'Git + PR',
        evidenceType: 'document',
        evidenceRef: 'Git repository',
        cyberShieldImplementation: 'Version control with history',
      },
      {
        code: 'CC8.2',
        name: 'Database',
        description: 'Migrations',
        evidenceType: 'document',
        evidenceRef: 'supabase/migrations/',
        cyberShieldImplementation: 'Tracked SQL migrations',
      },
      {
        code: 'CC8.3',
        name: 'Agents',
        description: 'Signed releases',
        evidenceType: 'table',
        evidenceRef: 'agent_releases',
        cyberShieldImplementation: 'ECDSA signature + hash',
      },
      {
        code: 'CC8.4',
        name: 'Rollback',
        description: 'Versioning',
        evidenceType: 'table',
        evidenceRef: 'agent_versions',
        cyberShieldImplementation: 'Version history for rollback',
      },
    ],
  },
  {
    code: 'CC9',
    name: 'Risk Mitigation',
    fullName: 'CC9 — Risk Mitigation',
    description: 'Vendor and dependency risk mitigation.',
    objective: 'Manage third-party and critical dependency risks.',
    controls: [
      {
        code: 'CC9.1',
        name: 'Stripe',
        description: 'PCI compliant',
        evidenceType: 'document',
        evidenceRef: 'Vendor Risk Policy',
        cyberShieldImplementation: 'PCI-DSS certified vendor',
      },
      {
        code: 'CC9.2',
        name: 'Supabase',
        description: 'Managed infra',
        evidenceType: 'document',
        evidenceRef: 'Vendor Risk Policy',
        cyberShieldImplementation: 'SOC 2 certified provider',
      },
      {
        code: 'CC9.3',
        name: 'Cloud',
        description: 'Backups and SLA',
        evidenceType: 'document',
        evidenceRef: 'Business Continuity Policy',
        cyberShieldImplementation: 'Automatic backups + SLA',
      },
    ],
  },
];

// ============================================
// POLICY DEFINITIONS
// ============================================

export interface PolicyDefinition {
  code: string;
  name: string;
  description: string;
  soc2Criteria: CriteriaCode[];
  sections: string[];
  filePath: string;
}

export const COMPLIANCE_POLICIES: PolicyDefinition[] = [
  {
    code: 'ISP-001',
    name: 'Information Security Policy',
    description: 'Master policy defining security philosophy and principles',
    soc2Criteria: ['CC1', 'CC2'],
    sections: ['Purpose', 'Scope', 'Security Principles', 'Responsibilities', 'Compliance'],
    filePath: 'docs/policies/01_information_security_policy.md',
  },
  {
    code: 'ACP-001',
    name: 'Access Control Policy',
    description: 'Controls for authentication, authorization, and access management',
    soc2Criteria: ['CC6'],
    sections: ['Authentication', 'Authorization', 'Administrative Access', 'User Lifecycle'],
    filePath: 'docs/policies/02_access_control_policy.md',
  },
  {
    code: 'CMP-001',
    name: 'Change Management Policy',
    description: 'Controls for managing changes to systems and code',
    soc2Criteria: ['CC8'],
    sections: ['Change Types', 'Controls', 'Rollback Procedures'],
    filePath: 'docs/policies/03_change_management_policy.md',
  },
  {
    code: 'IRP-001',
    name: 'Incident Response Policy',
    description: 'Procedures for detecting, responding to, and documenting incidents',
    soc2Criteria: ['CC7'],
    sections: ['Incident Classification', 'Response Process', 'Communication'],
    filePath: 'docs/policies/04_incident_response_policy.md',
  },
  {
    code: 'LMP-001',
    name: 'Logging & Monitoring Policy',
    description: 'Controls for security logging and monitoring',
    soc2Criteria: ['CC4', 'CC5'],
    sections: ['Logging', 'Protection', 'Retention'],
    filePath: 'docs/policies/05_logging_monitoring_policy.md',
  },
  {
    code: 'DRP-001',
    name: 'Data Classification & Retention Policy',
    description: 'Data classification, protection, and retention controls',
    soc2Criteria: ['CC5'],
    sections: ['Data Classification', 'Retention', 'Deletion'],
    filePath: 'docs/policies/06_data_retention_policy.md',
  },
  {
    code: 'VRP-001',
    name: 'Vendor Risk Management Policy',
    description: 'Third-party risk assessment and management',
    soc2Criteria: ['CC9'],
    sections: ['Critical Vendors', 'Assessment', 'Review Process'],
    filePath: 'docs/policies/07_vendor_risk_policy.md',
  },
  {
    code: 'BCP-001',
    name: 'Business Continuity & Availability Policy',
    description: 'Controls for system availability and disaster recovery',
    soc2Criteria: ['CC7', 'CC9'],
    sections: ['Controls', 'Recovery Objectives', 'Testing'],
    filePath: 'docs/policies/08_business_continuity_policy.md',
  },
  {
    code: 'SDP-001',
    name: 'Secure Development Policy',
    description: 'Secure software development practices',
    soc2Criteria: ['CC5', 'CC8'],
    sections: ['Controls', 'Code Review', 'Testing'],
    filePath: 'docs/policies/09_secure_development_policy.md',
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getCriteriaDefinition(code: CriteriaCode): CriteriaDefinition | undefined {
  return SOC2_TRUST_CRITERIA.find(c => c.code === code);
}

export function getPolicyDefinition(code: string): PolicyDefinition | undefined {
  return COMPLIANCE_POLICIES.find(p => p.code === code);
}

export function calculateOverallReadiness(readinessData: SOC2ReadinessView[]): number {
  if (readinessData.length === 0) return 0;
  const totalScore = readinessData.reduce((sum, r) => sum + r.criteriaReadinessScore, 0);
  return Math.round(totalScore / readinessData.length);
}

export function getStatusColor(status: SOC2Status): string {
  switch (status) {
    case 'verified': return 'text-green-500';
    case 'implemented': return 'text-blue-500';
    case 'in_progress': return 'text-yellow-500';
    case 'not_started': return 'text-muted-foreground';
    default: return 'text-muted-foreground';
  }
}

export function getStatusBadgeVariant(status: SOC2Status): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'verified': return 'default';
    case 'implemented': return 'secondary';
    case 'in_progress': return 'outline';
    case 'not_started': return 'destructive';
    default: return 'outline';
  }
}

export function getStatusLabel(status: SOC2Status): string {
  switch (status) {
    case 'verified': return 'Verificado';
    case 'implemented': return 'Implementado';
    case 'in_progress': return 'Em Progresso';
    case 'not_started': return 'Não Iniciado';
    default: return status;
  }
}

export function getPolicyStatusLabel(status: PolicyStatus): string {
  switch (status) {
    case 'approved': return 'Aprovada';
    case 'review': return 'Em Revisão';
    case 'draft': return 'Rascunho';
    case 'deprecated': return 'Obsoleta';
    default: return status;
  }
}

export function getVendorCriticalityColor(criticality: VendorCriticality): string {
  switch (criticality) {
    case 'critical': return 'text-red-500';
    case 'high': return 'text-orange-500';
    case 'medium': return 'text-yellow-500';
    case 'low': return 'text-green-500';
    default: return 'text-muted-foreground';
  }
}
