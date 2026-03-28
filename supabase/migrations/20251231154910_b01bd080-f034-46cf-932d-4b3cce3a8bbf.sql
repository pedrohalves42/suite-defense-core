-- CICLO 6: Adicionar last_applied_at para auditoria de uso real
ALTER TABLE tenant_action_policies
ADD COLUMN IF NOT EXISTS last_applied_at TIMESTAMPTZ;

COMMENT ON COLUMN tenant_action_policies.last_applied_at IS 
  'Timestamp da ultima vez que esta politica foi aplicada em uma decisao';

-- CICLO 7: Persistencia de relatorios para compliance/auditoria
CREATE TABLE IF NOT EXISTS ai_decision_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  report_payload JSONB NOT NULL,
  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ DEFAULT now(),
  integrity_hash TEXT NOT NULL,
  engine_version TEXT NOT NULL DEFAULT 'v1.0',
  UNIQUE (tenant_id, period_start, period_end)
);

ALTER TABLE ai_decision_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_decision_reports_read" ON ai_decision_reports
FOR SELECT USING (
  tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "ai_decision_reports_insert" ON ai_decision_reports
FOR INSERT WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_decision_reports_tenant
  ON ai_decision_reports (tenant_id, generated_at DESC);

-- CICLO 8: View agregada para metricas de qualidade
CREATE OR REPLACE VIEW insight_feedback_quality AS
SELECT
  ai.insight_type,
  f.tenant_id,
  COUNT(*) AS total_feedback,
  COUNT(*) FILTER (WHERE f.feedback_type = 'useful') AS useful,
  COUNT(*) FILTER (WHERE f.feedback_type = 'noise') AS noise,
  COUNT(*) FILTER (WHERE f.feedback_type = 'false_positive') AS false_positive,
  ROUND(
    COUNT(*) FILTER (WHERE f.feedback_type = 'useful')::numeric
    / NULLIF(COUNT(*), 0) * 100, 2
  ) AS usefulness_rate
FROM ai_insight_feedback f
JOIN ai_insights ai ON ai.id = f.insight_id
GROUP BY ai.insight_type, f.tenant_id;