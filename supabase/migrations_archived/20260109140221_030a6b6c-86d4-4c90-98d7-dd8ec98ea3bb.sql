
-- =====================================================
-- ADR-026 MIGRATION BATCH 6: Remaining Policies Part 2
-- Policies from poe_chain_breaks to end
-- =====================================================

-- poe_chain_breaks - SELECT/UPDATE
DROP POLICY IF EXISTS "Admins can view tenant chain breaks" ON poe_chain_breaks;
DROP POLICY IF EXISTS "poe_chain_breaks_select_active_tenant" ON poe_chain_breaks;
CREATE POLICY "poe_chain_breaks_select_active_tenant" ON poe_chain_breaks
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "Admins can update tenant chain breaks" ON poe_chain_breaks;
DROP POLICY IF EXISTS "poe_chain_breaks_update_active_tenant" ON poe_chain_breaks;
CREATE POLICY "poe_chain_breaks_update_active_tenant" ON poe_chain_breaks
FOR UPDATE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- policy_enforcement_logs - INSERT/SELECT
DROP POLICY IF EXISTS "System can insert enforcement logs" ON policy_enforcement_logs;
DROP POLICY IF EXISTS "policy_enforcement_logs_insert_active_tenant" ON policy_enforcement_logs;
CREATE POLICY "policy_enforcement_logs_insert_active_tenant" ON policy_enforcement_logs
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "Tenant members can view enforcement logs" ON policy_enforcement_logs;
DROP POLICY IF EXISTS "policy_enforcement_logs_select_active_tenant" ON policy_enforcement_logs;
CREATE POLICY "policy_enforcement_logs_select_active_tenant" ON policy_enforcement_logs
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- policy_rules (NO tenant_id - via security_policies)
DROP POLICY IF EXISTS "Admins can manage policy rules via their policies" ON policy_rules;
DROP POLICY IF EXISTS "policy_rules_all_active_tenant" ON policy_rules;
CREATE POLICY "policy_rules_all_active_tenant" ON policy_rules
FOR ALL USING (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM security_policies sp
    WHERE sp.id = policy_rules.policy_id
    AND (sp.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- profiles - SELECT/UPDATE (user_id based)
DROP POLICY IF EXISTS "admins_can_read_tenant_profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_select_active_tenant" ON profiles;
CREATE POLICY "profiles_select_active_tenant" ON profiles
FOR SELECT USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = profiles.id
    AND ur.tenant_id = get_active_tenant_id()
  )
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "admins_can_update_tenant_profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_update_active_tenant" ON profiles;
CREATE POLICY "profiles_update_active_tenant" ON profiles
FOR UPDATE USING (
  id = auth.uid()
  OR is_current_super_admin()
);

-- red_team_assessments - INSERT/SELECT
DROP POLICY IF EXISTS "System can insert red team assessments" ON red_team_assessments;
DROP POLICY IF EXISTS "red_team_assessments_insert_active_tenant" ON red_team_assessments;
CREATE POLICY "red_team_assessments_insert_active_tenant" ON red_team_assessments
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "Admins can view red team assessments for their tenant" ON red_team_assessments;
DROP POLICY IF EXISTS "red_team_assessments_select_active_tenant" ON red_team_assessments;
CREATE POLICY "red_team_assessments_select_active_tenant" ON red_team_assessments
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- risk_decision_log - SELECT
DROP POLICY IF EXISTS "Users can view risk decisions for their tenant" ON risk_decision_log;
DROP POLICY IF EXISTS "risk_decision_log_select_active_tenant" ON risk_decision_log;
CREATE POLICY "risk_decision_log_select_active_tenant" ON risk_decision_log
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- risk_delta_snapshots - SELECT
DROP POLICY IF EXISTS "Users can view risk snapshots in their tenant" ON risk_delta_snapshots;
DROP POLICY IF EXISTS "risk_delta_snapshots_select_active_tenant" ON risk_delta_snapshots;
CREATE POLICY "risk_delta_snapshots_select_active_tenant" ON risk_delta_snapshots
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- rls_test_results (super_admin only)
DROP POLICY IF EXISTS "Admins can view RLS test results" ON rls_test_results;
DROP POLICY IF EXISTS "rls_test_results_select_super_admin" ON rls_test_results;
CREATE POLICY "rls_test_results_select_super_admin" ON rls_test_results
FOR SELECT USING (is_current_super_admin());

-- sales_contacts - ALL/SELECT
DROP POLICY IF EXISTS "admins_can_manage_tenant_sales_contacts" ON sales_contacts;
DROP POLICY IF EXISTS "sales_contacts_all_active_tenant" ON sales_contacts;
CREATE POLICY "sales_contacts_all_active_tenant" ON sales_contacts
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "admins_can_view_tenant_sales_contacts" ON sales_contacts;

-- sales_pipeline (super_admin only)
DROP POLICY IF EXISTS "Super admins can manage sales_pipeline" ON sales_pipeline;
DROP POLICY IF EXISTS "sales_pipeline_all_super_admin" ON sales_pipeline;
CREATE POLICY "sales_pipeline_all_super_admin" ON sales_pipeline
FOR ALL USING (is_current_super_admin());

-- scheduled_job_runs - SELECT
DROP POLICY IF EXISTS "Admins can view their tenant job runs" ON scheduled_job_runs;
DROP POLICY IF EXISTS "scheduled_job_runs_select_active_tenant" ON scheduled_job_runs;
CREATE POLICY "scheduled_job_runs_select_active_tenant" ON scheduled_job_runs
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "Super admins can view all job runs" ON scheduled_job_runs;

-- scheduled_jobs - ALL
DROP POLICY IF EXISTS "Admins can manage scheduled jobs in their tenant" ON scheduled_jobs;
DROP POLICY IF EXISTS "scheduled_jobs_all_active_tenant" ON scheduled_jobs;
CREATE POLICY "scheduled_jobs_all_active_tenant" ON scheduled_jobs
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- scheduled_reports - ALL
DROP POLICY IF EXISTS "Admins can manage scheduled reports" ON scheduled_reports;
DROP POLICY IF EXISTS "scheduled_reports_all_active_tenant" ON scheduled_reports;
CREATE POLICY "scheduled_reports_all_active_tenant" ON scheduled_reports
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- score_governance_log - SELECT
DROP POLICY IF EXISTS "Admins can view tenant governance logs" ON score_governance_log;
DROP POLICY IF EXISTS "score_governance_log_select_active_tenant" ON score_governance_log;
CREATE POLICY "score_governance_log_select_active_tenant" ON score_governance_log
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- security_events - mais
DROP POLICY IF EXISTS "Users can view security events in their tenant" ON security_events;
DROP POLICY IF EXISTS "Admins can update security events in their tenant" ON security_events;

-- security_policies - ALL
DROP POLICY IF EXISTS "Admins can manage security policies in their tenant" ON security_policies;

-- security_policy_rules - mais
DROP POLICY IF EXISTS "Admins can manage rules" ON security_policy_rules;
DROP POLICY IF EXISTS "Tenant members can view rules" ON security_policy_rules;

-- security_reports - SELECT
DROP POLICY IF EXISTS "Users can view security reports in their tenant" ON security_reports;
