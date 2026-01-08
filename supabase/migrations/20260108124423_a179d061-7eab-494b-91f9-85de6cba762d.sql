
-- =============================================================================
-- ADR-026: RLS Migration Phase 1 - High Priority Tables
-- Migrate from legacy user_has_tenant_access to active tenant isolation
-- =============================================================================

-- First, create the is_current_super_admin helper if it doesn't exist
CREATE OR REPLACE FUNCTION public.is_current_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_current_super_admin() TO authenticated;

COMMENT ON FUNCTION public.is_current_super_admin() IS 
  'ADR-026: Returns true if current user is a super_admin';

-- =============================================================================
-- AGENTS TABLE - Core multi-tenant table
-- =============================================================================

-- Drop legacy policies
DROP POLICY IF EXISTS "agents_select_multitenant" ON agents;
DROP POLICY IF EXISTS "agents_insert_multitenant" ON agents;
DROP POLICY IF EXISTS "agents_update_multitenant" ON agents;
DROP POLICY IF EXISTS "agents_delete_multitenant" ON agents;
DROP POLICY IF EXISTS "Users can view agents in their tenants" ON agents;
DROP POLICY IF EXISTS "Admins and operators can insert agents" ON agents;
DROP POLICY IF EXISTS "Admins and operators can update agents" ON agents;
DROP POLICY IF EXISTS "Admins can delete agents" ON agents;

-- Create new policies with active tenant isolation
CREATE POLICY "agents_select_active_tenant"
ON agents FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "agents_insert_active_tenant"
ON agents FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "agents_update_active_tenant"
ON agents FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "agents_delete_active_tenant"
ON agents FOR DELETE
USING (
  public.is_current_super_admin()
);

-- =============================================================================
-- AGENT_BUILDS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "agent_builds_select_multitenant" ON agent_builds;
DROP POLICY IF EXISTS "agent_builds_insert_multitenant" ON agent_builds;

CREATE POLICY "agent_builds_select_active_tenant"
ON agent_builds FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "agent_builds_insert_active_tenant"
ON agent_builds FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- =============================================================================
-- AGENT_DISK_METRICS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "Admins can view tenant disk metrics" ON agent_disk_metrics;

CREATE POLICY "agent_disk_metrics_select_active_tenant"
ON agent_disk_metrics FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- =============================================================================
-- AGENT_EVIDENCE_LOGS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "Users can view tenant evidence" ON agent_evidence_logs;

CREATE POLICY "agent_evidence_logs_select_active_tenant"
ON agent_evidence_logs FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- =============================================================================
-- AGENT_GROUPS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "Users can view agent groups in their tenant" ON agent_groups;
DROP POLICY IF EXISTS "Admins can manage agent groups in their tenant" ON agent_groups;

CREATE POLICY "agent_groups_select_active_tenant"
ON agent_groups FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "agent_groups_insert_active_tenant"
ON agent_groups FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "agent_groups_update_active_tenant"
ON agent_groups FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "agent_groups_delete_active_tenant"
ON agent_groups FOR DELETE
USING (
  public.is_current_super_admin()
);

-- =============================================================================
-- AGENT_METRICS_DAILY TABLE
-- =============================================================================

DROP POLICY IF EXISTS "Admins can view tenant daily metrics" ON agent_metrics_daily;

CREATE POLICY "agent_metrics_daily_select_active_tenant"
ON agent_metrics_daily FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- =============================================================================
-- AGENT_NETWORK_INFO TABLE
-- =============================================================================

DROP POLICY IF EXISTS "Users can view network info in their tenant" ON agent_network_info;

CREATE POLICY "agent_network_info_select_active_tenant"
ON agent_network_info FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- =============================================================================
-- AGENT_RECOVERY_AUTHORIZATIONS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "Admins can manage recovery authorizations" ON agent_recovery_authorizations;
DROP POLICY IF EXISTS "Users can view own recovery requests" ON agent_recovery_authorizations;

CREATE POLICY "agent_recovery_select_active_tenant"
ON agent_recovery_authorizations FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "agent_recovery_insert_active_tenant"
ON agent_recovery_authorizations FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "agent_recovery_update_active_tenant"
ON agent_recovery_authorizations FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- =============================================================================
-- AGENT_ROLLBACK_EVENTS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "Users can view rollback events" ON agent_rollback_events;

CREATE POLICY "agent_rollback_events_select_active_tenant"
ON agent_rollback_events FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- =============================================================================
-- AGENT_SAFE_MODE_EVENTS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "Users can view safe mode events" ON agent_safe_mode_events;
DROP POLICY IF EXISTS "Admins can manage safe mode events" ON agent_safe_mode_events;

CREATE POLICY "agent_safe_mode_select_active_tenant"
ON agent_safe_mode_events FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "agent_safe_mode_update_active_tenant"
ON agent_safe_mode_events FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- =============================================================================
-- AGENT_SYSTEM_METRICS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "Users can view tenant system metrics" ON agent_system_metrics;

CREATE POLICY "agent_system_metrics_select_active_tenant"
ON agent_system_metrics FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- =============================================================================
-- ENROLLMENT_KEYS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "enrollment_keys_select_multitenant" ON enrollment_keys;
DROP POLICY IF EXISTS "enrollment_keys_insert_multitenant" ON enrollment_keys;
DROP POLICY IF EXISTS "enrollment_keys_update_multitenant" ON enrollment_keys;
DROP POLICY IF EXISTS "enrollment_keys_delete_multitenant" ON enrollment_keys;

CREATE POLICY "enrollment_keys_select_active_tenant"
ON enrollment_keys FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "enrollment_keys_insert_active_tenant"
ON enrollment_keys FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "enrollment_keys_update_active_tenant"
ON enrollment_keys FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "enrollment_keys_delete_active_tenant"
ON enrollment_keys FOR DELETE
USING (
  public.is_current_super_admin()
);

-- =============================================================================
-- GOVERNANCE_REPORTS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "governance_reports_select_multitenant" ON governance_reports;
DROP POLICY IF EXISTS "governance_reports_insert_multitenant" ON governance_reports;
DROP POLICY IF EXISTS "governance_reports_update_multitenant" ON governance_reports;

CREATE POLICY "governance_reports_select_active_tenant"
ON governance_reports FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "governance_reports_insert_active_tenant"
ON governance_reports FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "governance_reports_update_active_tenant"
ON governance_reports FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- =============================================================================
-- JOBS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "jobs_select_multitenant" ON jobs;
DROP POLICY IF EXISTS "jobs_insert_multitenant" ON jobs;
DROP POLICY IF EXISTS "jobs_update_multitenant" ON jobs;
DROP POLICY IF EXISTS "jobs_delete_multitenant" ON jobs;

CREATE POLICY "jobs_select_active_tenant"
ON jobs FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "jobs_insert_active_tenant"
ON jobs FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "jobs_update_active_tenant"
ON jobs FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "jobs_delete_active_tenant"
ON jobs FOR DELETE
USING (
  public.is_current_super_admin()
);

-- =============================================================================
-- PLAYBOOK_EXECUTIONS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "playbook_executions_select_multitenant" ON playbook_executions;
DROP POLICY IF EXISTS "playbook_executions_insert_multitenant" ON playbook_executions;
DROP POLICY IF EXISTS "playbook_executions_update_multitenant" ON playbook_executions;
DROP POLICY IF EXISTS "playbook_executions_delete_multitenant" ON playbook_executions;

CREATE POLICY "playbook_executions_select_active_tenant"
ON playbook_executions FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "playbook_executions_insert_active_tenant"
ON playbook_executions FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "playbook_executions_update_active_tenant"
ON playbook_executions FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "playbook_executions_delete_active_tenant"
ON playbook_executions FOR DELETE
USING (
  public.is_current_super_admin()
);

-- =============================================================================
-- SCHEDULED_JOBS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "scheduled_jobs_select_multitenant" ON scheduled_jobs;
DROP POLICY IF EXISTS "scheduled_jobs_insert_multitenant" ON scheduled_jobs;
DROP POLICY IF EXISTS "scheduled_jobs_update_multitenant" ON scheduled_jobs;
DROP POLICY IF EXISTS "scheduled_jobs_delete_multitenant" ON scheduled_jobs;

CREATE POLICY "scheduled_jobs_select_active_tenant"
ON scheduled_jobs FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "scheduled_jobs_insert_active_tenant"
ON scheduled_jobs FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "scheduled_jobs_update_active_tenant"
ON scheduled_jobs FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "scheduled_jobs_delete_active_tenant"
ON scheduled_jobs FOR DELETE
USING (
  public.is_current_super_admin()
);

-- =============================================================================
-- SECURITY_POLICIES TABLE
-- =============================================================================

DROP POLICY IF EXISTS "security_policies_select_multitenant" ON security_policies;
DROP POLICY IF EXISTS "security_policies_insert_multitenant" ON security_policies;
DROP POLICY IF EXISTS "security_policies_update_multitenant" ON security_policies;
DROP POLICY IF EXISTS "security_policies_delete_multitenant" ON security_policies;
DROP POLICY IF EXISTS "Users can view security policies" ON security_policies;
DROP POLICY IF EXISTS "Admins can manage security policies" ON security_policies;

CREATE POLICY "security_policies_select_active_tenant"
ON security_policies FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "security_policies_insert_active_tenant"
ON security_policies FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "security_policies_update_active_tenant"
ON security_policies FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "security_policies_delete_active_tenant"
ON security_policies FOR DELETE
USING (
  public.is_current_super_admin()
);

-- =============================================================================
-- SYSTEM_ALERTS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "system_alerts_select_multitenant" ON system_alerts;
DROP POLICY IF EXISTS "system_alerts_insert_multitenant" ON system_alerts;
DROP POLICY IF EXISTS "system_alerts_update_multitenant" ON system_alerts;
DROP POLICY IF EXISTS "system_alerts_delete_multitenant" ON system_alerts;

CREATE POLICY "system_alerts_select_active_tenant"
ON system_alerts FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "system_alerts_insert_active_tenant"
ON system_alerts FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "system_alerts_update_active_tenant"
ON system_alerts FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "system_alerts_delete_active_tenant"
ON system_alerts FOR DELETE
USING (
  public.is_current_super_admin()
);

-- =============================================================================
-- TASKS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "tasks_select_multitenant" ON tasks;
DROP POLICY IF EXISTS "tasks_insert_multitenant" ON tasks;
DROP POLICY IF EXISTS "tasks_update_multitenant" ON tasks;
DROP POLICY IF EXISTS "tasks_delete_multitenant" ON tasks;
DROP POLICY IF EXISTS "Users can view tasks in their tenants" ON tasks;
DROP POLICY IF EXISTS "Operators can create tasks" ON tasks;
DROP POLICY IF EXISTS "Operators can update tasks" ON tasks;
DROP POLICY IF EXISTS "Admins can delete tasks" ON tasks;

CREATE POLICY "tasks_select_active_tenant"
ON tasks FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "tasks_insert_active_tenant"
ON tasks FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "tasks_update_active_tenant"
ON tasks FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "tasks_delete_active_tenant"
ON tasks FOR DELETE
USING (
  public.is_current_super_admin()
);

-- =============================================================================
-- TENANT_FEATURES TABLE
-- =============================================================================

DROP POLICY IF EXISTS "tenant_features_select_multitenant" ON tenant_features;
DROP POLICY IF EXISTS "tenant_features_insert_multitenant" ON tenant_features;
DROP POLICY IF EXISTS "tenant_features_update_multitenant" ON tenant_features;

CREATE POLICY "tenant_features_select_active_tenant"
ON tenant_features FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "tenant_features_insert_active_tenant"
ON tenant_features FOR INSERT
WITH CHECK (
  public.is_current_super_admin()
);

CREATE POLICY "tenant_features_update_active_tenant"
ON tenant_features FOR UPDATE
USING (
  public.is_current_super_admin()
)
WITH CHECK (
  public.is_current_super_admin()
);

-- =============================================================================
-- USER_ROLES TABLE (special case - users see their own roles + admins see all)
-- =============================================================================

DROP POLICY IF EXISTS "user_roles_select_multitenant" ON user_roles;
DROP POLICY IF EXISTS "user_roles_insert_multitenant" ON user_roles;
DROP POLICY IF EXISTS "user_roles_update_multitenant" ON user_roles;
DROP POLICY IF EXISTS "user_roles_delete_multitenant" ON user_roles;
DROP POLICY IF EXISTS "Users can view roles in their tenants" ON user_roles;
DROP POLICY IF EXISTS "Super admins can manage user roles" ON user_roles;

CREATE POLICY "user_roles_select_active_tenant"
ON user_roles FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR user_id = auth.uid()
  OR public.is_current_super_admin()
);

CREATE POLICY "user_roles_insert_active_tenant"
ON user_roles FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "user_roles_update_active_tenant"
ON user_roles FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "user_roles_delete_active_tenant"
ON user_roles FOR DELETE
USING (
  public.is_current_super_admin()
);

-- =============================================================================
-- AI_INSIGHTS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "ai_insights_select_multitenant" ON ai_insights;
DROP POLICY IF EXISTS "ai_insights_insert_multitenant" ON ai_insights;
DROP POLICY IF EXISTS "ai_insights_update_multitenant" ON ai_insights;
DROP POLICY IF EXISTS "Tenant members can view insights" ON ai_insights;

CREATE POLICY "ai_insights_select_active_tenant"
ON ai_insights FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "ai_insights_insert_active_tenant"
ON ai_insights FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "ai_insights_update_active_tenant"
ON ai_insights FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- =============================================================================
-- INVITES TABLE
-- =============================================================================

DROP POLICY IF EXISTS "invites_select_multitenant" ON invites;
DROP POLICY IF EXISTS "invites_insert_multitenant" ON invites;
DROP POLICY IF EXISTS "invites_update_multitenant" ON invites;
DROP POLICY IF EXISTS "invites_delete_multitenant" ON invites;
DROP POLICY IF EXISTS "Admins can manage invites" ON invites;
DROP POLICY IF EXISTS "Users can view invites for their tenant" ON invites;

CREATE POLICY "invites_select_active_tenant"
ON invites FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "invites_insert_active_tenant"
ON invites FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "invites_update_active_tenant"
ON invites FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

CREATE POLICY "invites_delete_active_tenant"
ON invites FOR DELETE
USING (
  public.is_current_super_admin()
);

-- =============================================================================
-- AUDIT_LOGS TABLE (special case - read-only for users)
-- =============================================================================

DROP POLICY IF EXISTS "audit_logs_select_multitenant" ON audit_logs;
DROP POLICY IF EXISTS "Users can view audit logs in their tenants" ON audit_logs;

CREATE POLICY "audit_logs_select_active_tenant"
ON audit_logs FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);
