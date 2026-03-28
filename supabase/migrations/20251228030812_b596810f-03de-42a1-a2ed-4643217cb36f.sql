-- =====================================================
-- ENTERPRISE OPS MIGRATIONS - CONSOLIDATED (FIXED)
-- =====================================================

-- 1?? PLAYBOOKS: Constraint e Default para execution_mode
ALTER TABLE playbooks
  DROP CONSTRAINT IF EXISTS playbooks_execution_mode_check;

ALTER TABLE playbooks
  ADD CONSTRAINT playbooks_execution_mode_check
  CHECK (execution_mode IN ('assistive', 'semi_automatic', 'automatic'));

ALTER TABLE playbooks
  ALTER COLUMN execution_mode SET DEFAULT 'assistive';

COMMENT ON COLUMN playbooks.execution_mode IS
'assistive: apenas alerta e sugere |
 semi_automatic: executa apos aprovacao humana (timeout 24h) |
 automatic: somente acoes nao-destrutivas';

-- 2?? APPROVAL REQUESTS: Token de aprovacao via link
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS approval_token text,
  ADD COLUMN IF NOT EXISTS approval_token_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_requests_token
  ON approval_requests (approval_token)
  WHERE approval_token IS NOT NULL;

-- 3?? WEEKLY SECURITY REPORTS: Tabela para relatorios executivos
CREATE TABLE IF NOT EXISTS weekly_security_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  week_start date NOT NULL,
  week_end date NOT NULL,
  metrics jsonb NOT NULL,
  executive_summary text,
  generated_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_tenant
  ON weekly_security_reports (tenant_id);

-- RLS para weekly_security_reports
ALTER TABLE weekly_security_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view tenant reports" ON weekly_security_reports;
CREATE POLICY "Admins can view tenant reports" ON weekly_security_reports
  FOR SELECT USING (
    tenant_id IN (
      SELECT ur.tenant_id FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
    )
  );

-- 4?? PERFORMANCE INDEXES (usando triggered_at, nao created_at)
CREATE INDEX IF NOT EXISTS idx_playbook_executions_tenant_triggered
  ON playbook_executions (tenant_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_requests_execution
  ON approval_requests (playbook_execution_id);