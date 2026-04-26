-- Score Governance Audit Trail Table
-- Records every score transformation for SOC 2 / ISO 27001 compliance

CREATE TABLE IF NOT EXISTS score_governance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  audit_id UUID REFERENCES system_audits(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'raw_score_calculated',
    'deterministic_base_applied',
    'risk_factor_applied', 
    'guardrail_applied',
    'moving_average_applied',
    'market_score_calculated',
    'binary_criteria_fallback'
  )),
  previous_value NUMERIC,
  new_value NUMERIC,
  delta NUMERIC,
  rule_applied TEXT NOT NULL,
  justification TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_governance_log_audit ON score_governance_log(audit_id);
CREATE INDEX idx_governance_log_tenant ON score_governance_log(tenant_id);
CREATE INDEX idx_governance_log_event ON score_governance_log(event_type);
CREATE INDEX idx_governance_log_created ON score_governance_log(created_at DESC);

-- Enable RLS
ALTER TABLE score_governance_log ENABLE ROW LEVEL SECURITY;

-- RLS policies - admins can view their tenant's governance logs
CREATE POLICY "Admins can view tenant governance logs"
  ON score_governance_log
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Service role can insert
CREATE POLICY "Service role can insert governance logs"
  ON score_governance_log
  FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE score_governance_log IS 'Audit trail for all score governance transformations - SOC 2/ISO 27001 compliance';