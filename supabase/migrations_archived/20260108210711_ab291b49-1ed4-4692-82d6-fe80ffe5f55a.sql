-- FASE 1: Create active_tenant policies for 7 tables with tenant_id
-- ADR-026 Final Closure - Critical Gap Fix
-- Note: agents_groups and chaos_test_results excluded (no tenant_id column)

-- ============================================
-- LOGS/EVENTS TABLES (SELECT only)
-- ============================================

-- 1. agent_web_activity (SELECT only - logs table)
CREATE POLICY "agent_web_activity_select_active_tenant"
ON public.agent_web_activity FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 2. anomaly_events (SELECT only - events table)
CREATE POLICY "anomaly_events_select_active_tenant"
ON public.anomaly_events FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 3. audit_reason_trees (SELECT only - audit logs)
CREATE POLICY "audit_reason_trees_select_active_tenant"
ON public.audit_reason_trees FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- ============================================
-- OPERATIONAL TABLES (Full CRUD)
-- ============================================

-- 4. ai_action_validations (CRUD - operational)
CREATE POLICY "ai_action_validations_select_active_tenant"
ON public.ai_action_validations FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "ai_action_validations_insert_active_tenant"
ON public.ai_action_validations FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "ai_action_validations_update_active_tenant"
ON public.ai_action_validations FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "ai_action_validations_delete_active_tenant"
ON public.ai_action_validations FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 5. antivirus_status (CRUD - operational)
CREATE POLICY "antivirus_status_select_active_tenant"
ON public.antivirus_status FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "antivirus_status_insert_active_tenant"
ON public.antivirus_status FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "antivirus_status_update_active_tenant"
ON public.antivirus_status FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "antivirus_status_delete_active_tenant"
ON public.antivirus_status FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 6. custom_trials (CRUD - operational)
CREATE POLICY "custom_trials_select_active_tenant"
ON public.custom_trials FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "custom_trials_insert_active_tenant"
ON public.custom_trials FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "custom_trials_update_active_tenant"
ON public.custom_trials FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "custom_trials_delete_active_tenant"
ON public.custom_trials FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 7. policy_assignments (CRUD - operational)
CREATE POLICY "policy_assignments_select_active_tenant"
ON public.policy_assignments FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "policy_assignments_insert_active_tenant"
ON public.policy_assignments FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "policy_assignments_update_active_tenant"
ON public.policy_assignments FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "policy_assignments_delete_active_tenant"
ON public.policy_assignments FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());