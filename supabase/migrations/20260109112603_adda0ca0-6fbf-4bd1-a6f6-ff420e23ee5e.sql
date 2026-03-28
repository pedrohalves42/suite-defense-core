
-- =====================================================
-- ADR-026 MIGRATION BATCH 1: AI/ML Tables (RETRY)
-- Using CREATE OR REPLACE pattern with DROP IF EXISTS for both old and new
-- =====================================================

-- 1. ai_action_configs (no tenant_id - super_admin only)
DROP POLICY IF EXISTS "Admins can view action configs" ON ai_action_configs;
DROP POLICY IF EXISTS "ai_action_configs_select_super_admin" ON ai_action_configs;
CREATE POLICY "ai_action_configs_select_super_admin" ON ai_action_configs
FOR SELECT USING (is_current_super_admin());

-- 2. ai_action_executions
DROP POLICY IF EXISTS "Admins can view executions for their tenant" ON ai_action_executions;
DROP POLICY IF EXISTS "ai_action_executions_select_active_tenant" ON ai_action_executions;
CREATE POLICY "ai_action_executions_select_active_tenant" ON ai_action_executions
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 3. ai_actions - SELECT
DROP POLICY IF EXISTS "Admins can view actions for their tenant" ON ai_actions;
DROP POLICY IF EXISTS "ai_actions_select_active_tenant" ON ai_actions;
CREATE POLICY "ai_actions_select_active_tenant" ON ai_actions
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 4. ai_actions - UPDATE
DROP POLICY IF EXISTS "Admins can update actions for their tenant" ON ai_actions;
DROP POLICY IF EXISTS "ai_actions_update_active_tenant" ON ai_actions;
CREATE POLICY "ai_actions_update_active_tenant" ON ai_actions
FOR UPDATE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 5. ai_anomalies - UPDATE
DROP POLICY IF EXISTS "Admins can manage anomalies" ON ai_anomalies;
DROP POLICY IF EXISTS "ai_anomalies_update_active_tenant" ON ai_anomalies;
CREATE POLICY "ai_anomalies_update_active_tenant" ON ai_anomalies
FOR UPDATE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 6. ai_decision_reports - INSERT
DROP POLICY IF EXISTS "ai_decision_reports_insert" ON ai_decision_reports;
DROP POLICY IF EXISTS "ai_decision_reports_insert_active_tenant" ON ai_decision_reports;
CREATE POLICY "ai_decision_reports_insert_active_tenant" ON ai_decision_reports
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 7. ai_decision_reports - SELECT
DROP POLICY IF EXISTS "ai_decision_reports_read" ON ai_decision_reports;
DROP POLICY IF EXISTS "ai_decision_reports_select_active_tenant" ON ai_decision_reports;
CREATE POLICY "ai_decision_reports_select_active_tenant" ON ai_decision_reports
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 8. ai_inference_metrics - SELECT
DROP POLICY IF EXISTS "Admins can view AI metrics in their tenant" ON ai_inference_metrics;
DROP POLICY IF EXISTS "ai_inference_metrics_select_active_tenant" ON ai_inference_metrics;
CREATE POLICY "ai_inference_metrics_select_active_tenant" ON ai_inference_metrics
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 9. ai_insight_feedback - INSERT
DROP POLICY IF EXISTS "feedback_insert" ON ai_insight_feedback;
DROP POLICY IF EXISTS "ai_insight_feedback_insert_active_tenant" ON ai_insight_feedback;
CREATE POLICY "ai_insight_feedback_insert_active_tenant" ON ai_insight_feedback
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND get_active_tenant_id() IS NOT NULL 
  AND tenant_id = get_active_tenant_id()
);

-- 10. ai_insight_feedback - SELECT
DROP POLICY IF EXISTS "feedback_select" ON ai_insight_feedback;
DROP POLICY IF EXISTS "ai_insight_feedback_select_active_tenant" ON ai_insight_feedback;
CREATE POLICY "ai_insight_feedback_select_active_tenant" ON ai_insight_feedback
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 11. ai_insights - SELECT (ja existe, drop e recreate)
DROP POLICY IF EXISTS "Admins can view insights for their tenant" ON ai_insights;
DROP POLICY IF EXISTS "ai_insights_select_active_tenant" ON ai_insights;
CREATE POLICY "ai_insights_select_active_tenant" ON ai_insights
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 12. ai_insights - UPDATE (ja existe, drop e recreate)
DROP POLICY IF EXISTS "Admins can update insights for their tenant" ON ai_insights;
DROP POLICY IF EXISTS "ai_insights_update_active_tenant" ON ai_insights;
CREATE POLICY "ai_insights_update_active_tenant" ON ai_insights
FOR UPDATE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 13. ai_learned_patterns - SELECT
DROP POLICY IF EXISTS "Admins can view patterns for their tenant" ON ai_learned_patterns;
DROP POLICY IF EXISTS "ai_learned_patterns_select_active_tenant" ON ai_learned_patterns;
CREATE POLICY "ai_learned_patterns_select_active_tenant" ON ai_learned_patterns
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);
