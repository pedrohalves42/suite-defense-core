-- ===========================================
-- STEP 1: Populate SOC2 Criteria and Controls
-- ===========================================

-- Insert SOC2 Criteria for all tenants
INSERT INTO soc2_criteria (tenant_id, criteria_code, criteria_name, description, status)
SELECT 
  t.id,
  criteria.code,
  criteria.name,
  criteria.description,
  'implemented'
FROM tenants t
CROSS JOIN (VALUES
  ('CC1', 'Control Environment', 'Governance, ethics, responsibility, and organizational commitment to security.'),
  ('CC2', 'Communication & Information', 'Documented and communicated policies.'),
  ('CC3', 'Risk Assessment', 'Identification and mitigation of risks.'),
  ('CC4', 'Monitoring Activities', 'Continuous monitoring.'),
  ('CC5', 'Control Activities', 'Execution of technical controls.'),
  ('CC6', 'Logical Access Controls', 'Logical access control.'),
  ('CC7', 'System Operations', 'Secure system operation.'),
  ('CC8', 'Change Management', 'Change control.'),
  ('CC9', 'Risk Mitigation', 'Vendor and dependency risk mitigation.')
) AS criteria(code, name, description)
ON CONFLICT (tenant_id, criteria_code) DO UPDATE SET
  criteria_name = EXCLUDED.criteria_name,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

-- Insert SOC2 Controls for CC1
INSERT INTO soc2_controls (tenant_id, criteria_id, control_code, control_name, description, status, evidence_type, evidence_ref)
SELECT 
  sc.tenant_id,
  sc.id,
  ctrl.code,
  ctrl.name,
  ctrl.description,
  'implemented',
  ctrl.evidence_type,
  ctrl.evidence_ref
FROM soc2_criteria sc
CROSS JOIN (VALUES
  ('CC1.1', 'Organizational Structure', 'Clear separation between users, tenants, and agents', 'table', 'user_roles, tenants'),
  ('CC1.2', 'Security Principles', 'Security-by-design and Zero Trust', 'policy', 'Information Security Policy'),
  ('CC1.3', 'Tenant Isolation', 'Mandatory tenant_id in all entities', 'rls', 'RLS policies on all tables'),
  ('CC1.4', 'Accountability', 'All actions are logged', 'table', 'audit_logs, job_executions')
) AS ctrl(code, name, description, evidence_type, evidence_ref)
WHERE sc.criteria_code = 'CC1'
ON CONFLICT DO NOTHING;

-- Insert SOC2 Controls for CC2
INSERT INTO soc2_controls (tenant_id, criteria_id, control_code, control_name, description, status, evidence_type, evidence_ref)
SELECT 
  sc.tenant_id,
  sc.id,
  ctrl.code,
  ctrl.name,
  ctrl.description,
  'implemented',
  ctrl.evidence_type,
  ctrl.evidence_ref
FROM soc2_criteria sc
CROSS JOIN (VALUES
  ('CC2.1', 'Formal Policies', 'Documented SOC 2 policy set', 'document', 'docs/policies/'),
  ('CC2.2', 'Internal Communication', 'Docs + versioning', 'document', 'Repository with history')
) AS ctrl(code, name, description, evidence_type, evidence_ref)
WHERE sc.criteria_code = 'CC2'
ON CONFLICT DO NOTHING;

-- Insert SOC2 Controls for CC3
INSERT INTO soc2_controls (tenant_id, criteria_id, control_code, control_name, description, status, evidence_type, evidence_ref)
SELECT 
  sc.tenant_id,
  sc.id,
  ctrl.code,
  ctrl.name,
  ctrl.description,
  'implemented',
  ctrl.evidence_type,
  ctrl.evidence_ref
FROM soc2_criteria sc
CROSS JOIN (VALUES
  ('CC3.1', 'Cross-tenant Attack', 'RLS + backend validations', 'rls', 'RLS policies'),
  ('CC3.2', 'Compromised Agent', 'HMAC + nonce', 'function', 'verifyHmacSignature()'),
  ('CC3.3', 'Replay Attack', 'Tokens with expiration', 'table', 'agent_tokens'),
  ('CC3.4', 'Human Error', 'Backend enforcement', 'trigger', 'SQL triggers')
) AS ctrl(code, name, description, evidence_type, evidence_ref)
WHERE sc.criteria_code = 'CC3'
ON CONFLICT DO NOTHING;

-- Insert SOC2 Controls for CC4-CC9
INSERT INTO soc2_controls (tenant_id, criteria_id, control_code, control_name, description, status, evidence_type, evidence_ref)
SELECT 
  sc.tenant_id,
  sc.id,
  ctrl.code,
  ctrl.name,
  ctrl.description,
  'implemented',
  ctrl.evidence_type,
  ctrl.evidence_ref
FROM soc2_criteria sc
CROSS JOIN (VALUES
  ('CC4', 'CC4.1', 'Job Monitoring', 'Formal states', 'table', 'jobs, job_executions'),
  ('CC4', 'CC4.2', 'Failure Monitoring', 'Structured logs', 'table', 'security_events'),
  ('CC4', 'CC4.3', 'Abuse Monitoring', 'Rate limiting', 'function', 'Rate limiting in Edge Functions'),
  ('CC5', 'CC5.1', 'Authorization', 'Backend-only', 'function', 'Edge Functions'),
  ('CC5', 'CC5.2', 'Validation', 'Edge Functions', 'function', 'Zod validation'),
  ('CC5', 'CC5.3', 'Enforcement', 'SQL Triggers', 'trigger', 'State transition triggers'),
  ('CC5', 'CC5.4', 'Immutability', 'No DELETE/UPDATE', 'rls', 'Audit log policies'),
  ('CC6', 'CC6.1', 'Authentication', 'Tokens with expiration', 'table', 'agent_tokens'),
  ('CC6', 'CC6.2', 'Authorization', 'RBAC', 'table', 'user_roles'),
  ('CC6', 'CC6.3', 'Isolation', 'Native multi-tenant', 'rls', 'All RLS policies'),
  ('CC6', 'CC6.4', 'Protection', 'Zero Trust', 'function', 'HMAC verification'),
  ('CC7', 'CC7.1', 'Job Failure', 'Mandatory error', 'trigger', 'Job state triggers'),
  ('CC7', 'CC7.2', 'Offline Agent', 'Automatic cleanup', 'function', 'cleanup_offline_agents_jobs'),
  ('CC7', 'CC7.3', 'Abuse', 'Rate limiting + block', 'function', 'Rate limiting'),
  ('CC7', 'CC7.4', 'Attack', 'Block + log', 'table', 'security_events'),
  ('CC8', 'CC8.1', 'Code', 'Git + PR', 'document', 'Git repository'),
  ('CC8', 'CC8.2', 'Database', 'Migrations', 'document', 'supabase/migrations/'),
  ('CC8', 'CC8.3', 'Agents', 'Signed releases', 'table', 'agent_releases'),
  ('CC8', 'CC8.4', 'Rollback', 'Versioning', 'table', 'agent_versions'),
  ('CC9', 'CC9.1', 'Stripe', 'PCI compliant', 'document', 'Vendor Risk Policy'),
  ('CC9', 'CC9.2', 'Supabase', 'Managed infra', 'document', 'Vendor Risk Policy'),
  ('CC9', 'CC9.3', 'Cloud', 'Backups and SLA', 'document', 'Business Continuity Policy')
) AS ctrl(criteria, code, name, description, evidence_type, evidence_ref)
WHERE sc.criteria_code = ctrl.criteria
ON CONFLICT DO NOTHING;

-- ===========================================
-- STEP 2: Populate Critical Vendors
-- ===========================================

INSERT INTO vendor_risk_registry (tenant_id, vendor_name, vendor_type, criticality, services_provided, data_shared, compliance_certifications, status, risk_score, next_review_date)
SELECT 
  t.id,
  v.name,
  v.type,
  v.criticality,
  v.services,
  v.data_shared,
  v.certs,
  'active',
  v.risk_score,
  CURRENT_DATE + INTERVAL '90 days'
FROM tenants t
CROSS JOIN (VALUES
  ('Supabase', 'cloud', 'critical', ARRAY['Database', 'Auth', 'Storage', 'Edge Functions'], ARRAY['All application data', 'User credentials'], ARRAY['SOC 2 Type II', 'ISO 27001'], 15),
  ('Stripe', 'payment', 'critical', ARRAY['Payment processing', 'Subscription management'], ARRAY['Payment info', 'Customer data'], ARRAY['PCI-DSS Level 1', 'SOC 2 Type II'], 10),
  ('Vercel/Lovable Cloud', 'cloud', 'high', ARRAY['Hosting', 'CDN', 'Edge deployment'], ARRAY['Application code', 'Static assets'], ARRAY['SOC 2 Type II', 'ISO 27001'], 20)
) AS v(name, type, criticality, services, data_shared, certs, risk_score)
ON CONFLICT DO NOTHING;

-- ===========================================
-- STEP 3: Populate Compliance Policies  
-- ===========================================

INSERT INTO compliance_policies (tenant_id, policy_code, policy_name, version, status, owner, effective_date, review_date, soc2_criteria, file_path)
SELECT 
  t.id,
  p.code,
  p.name,
  '1.0',
  'approved',
  'Security Officer',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '1 year',
  p.criteria,
  p.file_path
FROM tenants t
CROSS JOIN (VALUES
  ('ISP-001', 'Politica de Seguranca da Informacao', ARRAY['CC1', 'CC3'], 'docs/policies/01_information_security_policy.md'),
  ('ACP-001', 'Politica de Controle de Acesso', ARRAY['CC1', 'CC6'], 'docs/policies/02_access_control_policy.md'),
  ('CMP-001', 'Politica de Gestao de Mudancas', ARRAY['CC8'], 'docs/policies/03_change_management_policy.md'),
  ('IRP-001', 'Politica de Resposta a Incidentes', ARRAY['CC7'], 'docs/policies/04_incident_response_policy.md'),
  ('LMP-001', 'Politica de Logs e Monitoramento', ARRAY['CC4', 'CC7'], 'docs/policies/05_logging_monitoring_policy.md'),
  ('DRP-001', 'Politica de Retencao de Dados', ARRAY['CC5'], 'docs/policies/06_data_retention_policy.md'),
  ('VRP-001', 'Politica de Risco de Fornecedores', ARRAY['CC9'], 'docs/policies/07_vendor_risk_policy.md'),
  ('BCP-001', 'Politica de Continuidade de Negocios', ARRAY['CC7', 'CC9'], 'docs/policies/08_business_continuity_policy.md'),
  ('SDP-001', 'Politica de Desenvolvimento Seguro', ARRAY['CC5', 'CC8'], 'docs/policies/09_secure_development_policy.md')
) AS p(code, name, criteria, file_path)
ON CONFLICT DO NOTHING;

-- ===========================================
-- STEP 4: Add resolution fields to security_events
-- ===========================================

ALTER TABLE security_events 
ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS acknowledged_by UUID,
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resolved_by UUID,
ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- Create index for faster queries on open events
CREATE INDEX IF NOT EXISTS idx_security_events_status ON security_events(status);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);

-- ===========================================
-- STEP 5: Add unique constraint for soc2_criteria
-- ===========================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'soc2_criteria_tenant_code_unique'
  ) THEN
    ALTER TABLE soc2_criteria ADD CONSTRAINT soc2_criteria_tenant_code_unique UNIQUE (tenant_id, criteria_code);
  END IF;
END $$;