
-- ===========================================
-- FIX: Corrigir RLS policies para multiplos problemas
-- ===========================================

-- 1. ai_insight_feedback: Adicionar unique constraint e corrigir INSERT policy
-- Primeiro, adicionar unique constraint se nao existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ai_insight_feedback_insight_user_unique'
  ) THEN
    ALTER TABLE ai_insight_feedback 
    ADD CONSTRAINT ai_insight_feedback_insight_user_unique UNIQUE (insight_id, user_id);
  END IF;
END$$;

-- 2. Corrigir INSERT policy de ai_insight_feedback (remover exigencia de get_active_tenant_id() IS NOT NULL)
DROP POLICY IF EXISTS ai_insight_feedback_insert_active_tenant ON ai_insight_feedback;
CREATE POLICY ai_insight_feedback_insert_active_tenant ON ai_insight_feedback
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
);

-- 3. Adicionar UPDATE policy para ai_insight_feedback (faltava)
DROP POLICY IF EXISTS ai_insight_feedback_update_active_tenant ON ai_insight_feedback;
CREATE POLICY ai_insight_feedback_update_active_tenant ON ai_insight_feedback
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  AND tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
);

-- 4. decision_events: Adicionar INSERT policy para authenticated (permite auditoria de rejeicoes)
DROP POLICY IF EXISTS decision_events_insert_authenticated ON decision_events;
CREATE POLICY decision_events_insert_authenticated ON decision_events
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
);

-- 5. ai_insights: Corrigir UPDATE policy para permitir rejeicao (estava exigindo get_active_tenant_id())
DROP POLICY IF EXISTS ai_insights_update_active_tenant ON ai_insights;
CREATE POLICY ai_insights_update_active_tenant ON ai_insights
FOR UPDATE TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
  OR is_current_super_admin()
)
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
  OR is_current_super_admin()
);

-- 6. system_alerts: Corrigir UPDATE policy para permitir acknowledgment
DROP POLICY IF EXISTS system_alerts_update_active_tenant ON system_alerts;
CREATE POLICY system_alerts_update_active_tenant ON system_alerts
FOR UPDATE TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
  OR is_current_super_admin()
)
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
  OR is_current_super_admin()
);

-- 7. Corrigir SELECT policies usando user_roles subquery (mais robusto que get_active_tenant_id)
DROP POLICY IF EXISTS ai_insights_select_active_tenant ON ai_insights;
CREATE POLICY ai_insights_select_active_tenant ON ai_insights
FOR SELECT TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS ai_insight_feedback_select_active_tenant ON ai_insight_feedback;
CREATE POLICY ai_insight_feedback_select_active_tenant ON ai_insight_feedback
FOR SELECT TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
  OR is_current_super_admin()
);
