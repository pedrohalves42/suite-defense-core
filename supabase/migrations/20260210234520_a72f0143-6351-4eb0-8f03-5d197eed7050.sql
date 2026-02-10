
-- =====================================================
-- CYBERSHIELD SECURITY FIXES v6.1.0
-- V-201, V-203, V-204, V-205, V-206, V-208
-- =====================================================

-- V-201: CRITICAL - token_validation_failures
DROP POLICY IF EXISTS "Service role can manage token failures" ON token_validation_failures;

CREATE POLICY "service_role_can_insert_token_failures" ON token_validation_failures
FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "admins_can_read_token_failures" ON token_validation_failures
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
      AND ur.tenant_id = get_active_tenant_id()
  )
);

-- V-203: HIGH - agent_system_metrics_2026_02 isolation
DROP POLICY IF EXISTS "Users can view metrics for their tenant agents 2026_02" ON agent_system_metrics_2026_02;

CREATE POLICY "Users can view metrics for their tenant agents 2026_02" ON agent_system_metrics_2026_02
FOR SELECT TO authenticated USING (
  (tenant_id = get_active_tenant_id()) OR is_current_super_admin()
);

-- V-204: LOW - ai_actions duplicate cleanup
DROP POLICY IF EXISTS "service_role_can_insert_actions" ON ai_actions;

-- V-205: MEDIUM - agent_recovery_authorizations role fix
DROP POLICY IF EXISTS "agent_recovery_insert_active_tenant" ON agent_recovery_authorizations;
DROP POLICY IF EXISTS "agent_recovery_authorizations_insert" ON agent_recovery_authorizations;

CREATE POLICY "agent_recovery_authorizations_insert" ON agent_recovery_authorizations
FOR INSERT TO authenticated WITH CHECK (
  tenant_id = get_active_tenant_id()
);

-- V-208: LOW - incident_slo_state duplicate cleanup
DROP POLICY IF EXISTS "incident_slo_read" ON incident_slo_state;
