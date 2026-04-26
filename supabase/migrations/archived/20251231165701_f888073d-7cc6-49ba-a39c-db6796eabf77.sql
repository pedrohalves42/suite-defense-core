-- Adicionar colunas faltantes

-- 1. Adicionar retry_count na tabela jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- 2. Adicionar started_at na tabela playbook_executions
ALTER TABLE playbook_executions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- 3. Preencher started_at com triggered_at para registros existentes
UPDATE playbook_executions SET started_at = triggered_at WHERE started_at IS NULL;

-- 4. Criar tabela security_reports
CREATE TABLE IF NOT EXISTS security_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  generated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Habilitar RLS
ALTER TABLE security_reports ENABLE ROW LEVEL SECURITY;

-- 6. Politicas RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'security_reports' AND policyname = 'Users can view security reports in their tenant'
  ) THEN
    CREATE POLICY "Users can view security reports in their tenant"
    ON security_reports FOR SELECT
    USING (tenant_id IN (
      SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
    ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'security_reports' AND policyname = 'Service role can manage security reports'
  ) THEN
    CREATE POLICY "Service role can manage security reports"
    ON security_reports FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- 7. Indices
CREATE INDEX IF NOT EXISTS idx_security_reports_tenant ON security_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_security_reports_status ON security_reports(status);
CREATE INDEX IF NOT EXISTS idx_security_reports_expires ON security_reports(expires_at) WHERE expires_at IS NOT NULL;