-- FIX: ai_insights SELECT policy leaks data across tenants
-- Current policy uses user_roles subquery that returns ALL tenants for the user
-- Must use get_active_tenant_id() to restrict to active tenant only

DROP POLICY IF EXISTS ai_insights_select_active_tenant ON ai_insights;
CREATE POLICY ai_insights_select_active_tenant ON ai_insights
FOR SELECT TO authenticated
USING (
  tenant_id = get_active_tenant_id()
  OR is_current_super_admin()
);

-- FIX: ai_insights UPDATE policy also uses broad user_roles subquery
DROP POLICY IF EXISTS ai_insights_update_active_tenant ON ai_insights;
CREATE POLICY ai_insights_update_active_tenant ON ai_insights
FOR UPDATE TO authenticated
USING (
  tenant_id = get_active_tenant_id()
  OR is_current_super_admin()
)
WITH CHECK (
  tenant_id = get_active_tenant_id()
  OR is_current_super_admin()
);