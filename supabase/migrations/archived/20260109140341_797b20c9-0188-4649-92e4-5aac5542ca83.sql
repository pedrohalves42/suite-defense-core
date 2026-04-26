
-- =====================================================
-- ADR-026 MIGRATION BATCH 7: Final Remaining Policies
-- From segregation_rules to end
-- =====================================================

-- segregation_rules - ALL/SELECT
DROP POLICY IF EXISTS "Admins can manage segregation rules" ON segregation_rules;
DROP POLICY IF EXISTS "segregation_rules_all_active_tenant" ON segregation_rules;
CREATE POLICY "segregation_rules_all_active_tenant" ON segregation_rules
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "Users can view segregation rules for their tenant" ON segregation_rules;

-- signed_documents (super_admin only)
DROP POLICY IF EXISTS "Super admins can manage signed documents" ON signed_documents;
DROP POLICY IF EXISTS "signed_documents_all_super_admin" ON signed_documents;
CREATE POLICY "signed_documents_all_super_admin" ON signed_documents
FOR ALL USING (is_current_super_admin());

-- slo_alerts - SELECT/UPDATE
DROP POLICY IF EXISTS "Users can view SLO alerts for their tenant" ON slo_alerts;
DROP POLICY IF EXISTS "slo_alerts_select_active_tenant" ON slo_alerts;
CREATE POLICY "slo_alerts_select_active_tenant" ON slo_alerts
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "Admins can update SLO alerts" ON slo_alerts;
DROP POLICY IF EXISTS "slo_alerts_update_active_tenant" ON slo_alerts;
CREATE POLICY "slo_alerts_update_active_tenant" ON slo_alerts
FOR UPDATE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- slo_definitions (super_admin only) - ALL/SELECT
DROP POLICY IF EXISTS "Super admins can manage SLO definitions" ON slo_definitions;
DROP POLICY IF EXISTS "slo_definitions_all_super_admin" ON slo_definitions;
CREATE POLICY "slo_definitions_all_super_admin" ON slo_definitions
FOR ALL USING (is_current_super_admin());

DROP POLICY IF EXISTS "Admins can view SLO definitions" ON slo_definitions;

-- slo_measurements - SELECT
DROP POLICY IF EXISTS "Users can view SLO measurements for their tenant" ON slo_measurements;
DROP POLICY IF EXISTS "slo_measurements_select_active_tenant" ON slo_measurements;
CREATE POLICY "slo_measurements_select_active_tenant" ON slo_measurements
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- software_inventory - SELECT
DROP POLICY IF EXISTS "Users can view software inventory in their tenant" ON software_inventory;
DROP POLICY IF EXISTS "software_inventory_select_active_tenant" ON software_inventory;
CREATE POLICY "software_inventory_select_active_tenant" ON software_inventory
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- software_knowledge_base (super_admin only)
DROP POLICY IF EXISTS "software_knowledge_base_admin_all" ON software_knowledge_base;
DROP POLICY IF EXISTS "software_knowledge_base_all_super_admin" ON software_knowledge_base;
CREATE POLICY "software_knowledge_base_all_super_admin" ON software_knowledge_base
FOR ALL USING (is_current_super_admin());

-- stripe_plan_mapping (super_admin only)
DROP POLICY IF EXISTS "Admins can view stripe plan mapping" ON stripe_plan_mapping;
DROP POLICY IF EXISTS "stripe_plan_mapping_select_super_admin" ON stripe_plan_mapping;
CREATE POLICY "stripe_plan_mapping_select_super_admin" ON stripe_plan_mapping
FOR SELECT USING (is_current_super_admin());

-- subscription_events - SELECT
DROP POLICY IF EXISTS "tenant_view_events" ON subscription_events;
DROP POLICY IF EXISTS "subscription_events_select_active_tenant" ON subscription_events;
CREATE POLICY "subscription_events_select_active_tenant" ON subscription_events
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- system_alerts - SELECT/UPDATE (both super_admin and tenant)
DROP POLICY IF EXISTS "Super admins can view all alerts" ON system_alerts;
DROP POLICY IF EXISTS "Admins can view tenant alerts" ON system_alerts;
DROP POLICY IF EXISTS "system_alerts_select_active_tenant" ON system_alerts;
CREATE POLICY "system_alerts_select_active_tenant" ON system_alerts
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "Super admins can update all alerts" ON system_alerts;
DROP POLICY IF EXISTS "Admins can update tenant alerts" ON system_alerts;
DROP POLICY IF EXISTS "system_alerts_update_active_tenant" ON system_alerts;
CREATE POLICY "system_alerts_update_active_tenant" ON system_alerts
FOR UPDATE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- system_audits - INSERT/SELECT
DROP POLICY IF EXISTS "Admins can create system audits" ON system_audits;
DROP POLICY IF EXISTS "system_audits_insert_active_tenant" ON system_audits;
CREATE POLICY "system_audits_insert_active_tenant" ON system_audits
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "Admins can view system audits" ON system_audits;
DROP POLICY IF EXISTS "system_audits_select_active_tenant" ON system_audits;
CREATE POLICY "system_audits_select_active_tenant" ON system_audits
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- system_kill_switch - ALL
DROP POLICY IF EXISTS "Admins can manage kill_switch" ON system_kill_switch;
DROP POLICY IF EXISTS "system_kill_switch_all_active_tenant" ON system_kill_switch;
CREATE POLICY "system_kill_switch_all_active_tenant" ON system_kill_switch
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- task_events - SELECT
DROP POLICY IF EXISTS "Users can read task events from their tenant" ON task_events;
DROP POLICY IF EXISTS "task_events_select_active_tenant" ON task_events;
CREATE POLICY "task_events_select_active_tenant" ON task_events
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- task_evidence - SELECT
DROP POLICY IF EXISTS "Users can read task evidence from their tenant" ON task_evidence;
DROP POLICY IF EXISTS "task_evidence_select_active_tenant" ON task_evidence;
CREATE POLICY "task_evidence_select_active_tenant" ON task_evidence
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- tasks - SELECT/UPDATE
DROP POLICY IF EXISTS "Users can read tenant tasks" ON tasks;
DROP POLICY IF EXISTS "tasks_select_active_tenant" ON tasks;
CREATE POLICY "tasks_select_active_tenant" ON tasks
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "Users can update tenant tasks" ON tasks;
DROP POLICY IF EXISTS "tasks_update_active_tenant" ON tasks;
CREATE POLICY "tasks_update_active_tenant" ON tasks
FOR UPDATE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- tenant_action_policies - CRUD
DROP POLICY IF EXISTS "tenant_policies_delete" ON tenant_action_policies;
DROP POLICY IF EXISTS "tenant_action_policies_delete_active_tenant" ON tenant_action_policies;
CREATE POLICY "tenant_action_policies_delete_active_tenant" ON tenant_action_policies
FOR DELETE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "tenant_policies_insert" ON tenant_action_policies;
DROP POLICY IF EXISTS "tenant_action_policies_insert_active_tenant" ON tenant_action_policies;
CREATE POLICY "tenant_action_policies_insert_active_tenant" ON tenant_action_policies
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "tenant_policies_select" ON tenant_action_policies;
DROP POLICY IF EXISTS "tenant_action_policies_select_active_tenant" ON tenant_action_policies;
CREATE POLICY "tenant_action_policies_select_active_tenant" ON tenant_action_policies
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "tenant_policies_update" ON tenant_action_policies;
DROP POLICY IF EXISTS "tenant_action_policies_update_active_tenant" ON tenant_action_policies;
CREATE POLICY "tenant_action_policies_update_active_tenant" ON tenant_action_policies
FOR UPDATE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- tenant_job_quotas - SELECT
DROP POLICY IF EXISTS "Admins can view their tenant quotas" ON tenant_job_quotas;
DROP POLICY IF EXISTS "tenant_job_quotas_select_active_tenant" ON tenant_job_quotas;
CREATE POLICY "tenant_job_quotas_select_active_tenant" ON tenant_job_quotas
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- tenant_risk_scores - SELECT
DROP POLICY IF EXISTS "super_admin_read_scores" ON tenant_risk_scores;
DROP POLICY IF EXISTS "tenant_read_scores" ON tenant_risk_scores;
DROP POLICY IF EXISTS "tenant_risk_scores_select_active_tenant" ON tenant_risk_scores;
CREATE POLICY "tenant_risk_scores_select_active_tenant" ON tenant_risk_scores
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- tenants - SELECT (user can view their own tenant)
DROP POLICY IF EXISTS "Users can view their own tenant" ON tenants;
DROP POLICY IF EXISTS "tenants_select_active_tenant" ON tenants;
CREATE POLICY "tenants_select_active_tenant" ON tenants
FOR SELECT USING (
  id = get_active_tenant_id()
  OR is_current_super_admin()
);

-- threat_intelligence_cache - SELECT
DROP POLICY IF EXISTS "Users can view their tenant threat intel cache" ON threat_intelligence_cache;
DROP POLICY IF EXISTS "threat_intelligence_cache_select_active_tenant" ON threat_intelligence_cache;
CREATE POLICY "threat_intelligence_cache_select_active_tenant" ON threat_intelligence_cache
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- url_reputation - SELECT
DROP POLICY IF EXISTS "Users can view URL reputation in their tenant" ON url_reputation;
DROP POLICY IF EXISTS "url_reputation_select_active_tenant" ON url_reputation;
CREATE POLICY "url_reputation_select_active_tenant" ON url_reputation
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- vuln_findings - SELECT
DROP POLICY IF EXISTS "Users can view vuln findings in their tenant" ON vuln_findings;
DROP POLICY IF EXISTS "vuln_findings_select_active_tenant" ON vuln_findings;
CREATE POLICY "vuln_findings_select_active_tenant" ON vuln_findings
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- web_access_policies - ALL/SELECT
DROP POLICY IF EXISTS "Admins can manage web access policies" ON web_access_policies;
DROP POLICY IF EXISTS "web_access_policies_all_active_tenant" ON web_access_policies;
CREATE POLICY "web_access_policies_all_active_tenant" ON web_access_policies
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "Users can view web access policies" ON web_access_policies;

-- weekly_security_reports - SELECT
DROP POLICY IF EXISTS "Admins can view tenant reports" ON weekly_security_reports;
DROP POLICY IF EXISTS "weekly_security_reports_select_active_tenant" ON weekly_security_reports;
CREATE POLICY "weekly_security_reports_select_active_tenant" ON weekly_security_reports
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);
