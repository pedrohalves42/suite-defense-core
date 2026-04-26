-- CICLO 6: Governanca Granular por Tenant
-- Tabela para politicas de acao por insight type

CREATE TABLE tenant_action_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,
  execution_mode TEXT NOT NULL CHECK (
    execution_mode IN ('auto', 'approval', 'disabled')
  ),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(tenant_id, insight_type)
);

-- RLS
ALTER TABLE tenant_action_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_policies_select" ON tenant_action_policies
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "tenant_policies_insert" ON tenant_action_policies
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "tenant_policies_update" ON tenant_action_policies
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "tenant_policies_delete" ON tenant_action_policies
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Index
CREATE INDEX idx_tenant_action_policies_lookup 
ON tenant_action_policies(tenant_id, insight_type);

-- Trigger para updated_at
CREATE TRIGGER update_tenant_action_policies_updated_at
  BEFORE UPDATE ON tenant_action_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_svb_updated_at();

-- CICLO 8: Feedback Humano
-- Tabela para feedback dos usuarios sobre insights

CREATE TABLE ai_insight_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  insight_id UUID NOT NULL REFERENCES ai_insights(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  feedback_type TEXT NOT NULL CHECK (
    feedback_type IN ('useful', 'noise', 'false_positive')
  ),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(insight_id, user_id)
);

-- RLS
ALTER TABLE ai_insight_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback_select" ON ai_insight_feedback
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "feedback_insert" ON ai_insight_feedback
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
  );

-- Indexes
CREATE INDEX idx_feedback_insight ON ai_insight_feedback(insight_id);
CREATE INDEX idx_feedback_type ON ai_insight_feedback(feedback_type, tenant_id);
CREATE INDEX idx_feedback_tenant ON ai_insight_feedback(tenant_id, created_at DESC);