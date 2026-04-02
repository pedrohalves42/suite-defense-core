-- =============================================================
-- MIGRATION: Eliminate 135M seq scans on user_roles
-- Replace inline user_roles subqueries with get_active_tenant_id()
-- =============================================================

-- Step 1: Create optimized helper function for admin role checks
CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND tenant_id = get_active_tenant_id()
      AND role = ANY(ARRAY['admin'::app_role, 'super_admin'::app_role])
  )
$$;

-- Step 2: Drop and recreate all legacy policies
-- Pattern A: Simple tenant isolation

DROP POLICY IF EXISTS "Tenant isolation for adaptive blast radius" ON public.adaptive_blast_radius_config;
CREATE POLICY "Tenant isolation for adaptive blast radius" ON public.adaptive_blast_radius_config TO authenticated
  USING (tenant_id = get_active_tenant_id())
  WITH CHECK (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Users can view light mode configs for their tenant" ON public.agent_light_mode_configs;
CREATE POLICY "Users can view light mode configs for their tenant" ON public.agent_light_mode_configs FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_process_lineage_select" ON public.agent_process_lineage;
CREATE POLICY "tenant_process_lineage_select" ON public.agent_process_lineage FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "agent_tags_select" ON public.agent_tags;
CREATE POLICY "agent_tags_select" ON public.agent_tags FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "agent_tags_update" ON public.agent_tags;
CREATE POLICY "agent_tags_update" ON public.agent_tags FOR UPDATE TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "agent_tags_delete" ON public.agent_tags;
CREATE POLICY "agent_tags_delete" ON public.agent_tags FOR DELETE TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "agent_tags_insert" ON public.agent_tags;
CREATE POLICY "agent_tags_insert" ON public.agent_tags FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Users can view ai_feedback for their tenant" ON public.ai_feedback;
CREATE POLICY "Users can view ai_feedback for their tenant" ON public.ai_feedback FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_attack_simulation_results" ON public.attack_simulation_results;
CREATE POLICY "tenant_isolation_attack_simulation_results" ON public.attack_simulation_results FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_attack_simulations" ON public.attack_simulations;
CREATE POLICY "tenant_isolation_attack_simulations" ON public.attack_simulations FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "auto_remediation_actions_tenant_isolation" ON public.auto_remediation_actions;
CREATE POLICY "auto_remediation_actions_tenant_isolation" ON public.auto_remediation_actions FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Users can view automation executions for their tenant" ON public.automation_executions;
CREATE POLICY "Users can view automation executions for their tenant" ON public.automation_executions FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation for rule dependencies" ON public.automation_rule_dependencies;
CREATE POLICY "Tenant isolation for rule dependencies" ON public.automation_rule_dependencies FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Users can view automation rules for their tenant" ON public.automation_rules;
CREATE POLICY "Users can view automation rules for their tenant" ON public.automation_rules FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_read_backup_status" ON public.backup_status;
CREATE POLICY "tenant_read_backup_status" ON public.backup_status FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "backup_verifications_tenant_select" ON public.backup_verifications;
CREATE POLICY "backup_verifications_tenant_select" ON public.backup_verifications FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "compliance_baselines_select" ON public.compliance_baselines;
CREATE POLICY "compliance_baselines_select" ON public.compliance_baselines FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_read" ON public.correlated_incident_events;
CREATE POLICY "tenant_read" ON public.correlated_incident_events FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_read" ON public.correlated_incidents;
CREATE POLICY "tenant_read" ON public.correlated_incidents FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_update" ON public.correlated_incidents;
CREATE POLICY "tenant_update" ON public.correlated_incidents FOR UPDATE TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_credential_leaks" ON public.credential_leaks;
CREATE POLICY "tenant_isolation_credential_leaks" ON public.credential_leaks FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_credential_monitors" ON public.credential_monitors;
CREATE POLICY "tenant_isolation_credential_monitors" ON public.credential_monitors FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation on dashboard_stats_cache" ON public.dashboard_stats_cache;
CREATE POLICY "Tenant isolation on dashboard_stats_cache" ON public.dashboard_stats_cache TO authenticated
  USING (tenant_id = get_active_tenant_id())
  WITH CHECK (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_read_data_exposure" ON public.data_exposure_findings;
CREATE POLICY "tenant_read_data_exposure" ON public.data_exposure_findings FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_update_data_exposure" ON public.data_exposure_findings;
CREATE POLICY "tenant_update_data_exposure" ON public.data_exposure_findings FOR UPDATE TO authenticated
  USING (tenant_id = get_active_tenant_id())
  WITH CHECK (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation for dead_letter_jobs" ON public.dead_letter_jobs;
CREATE POLICY "Tenant isolation for dead_letter_jobs" ON public.dead_letter_jobs FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "drift_events_select" ON public.drift_events;
CREATE POLICY "drift_events_select" ON public.drift_events FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_read" ON public.endpoint_detection_events;
CREATE POLICY "tenant_read" ON public.endpoint_detection_events FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_read" ON public.endpoint_file_events;
CREATE POLICY "tenant_read" ON public.endpoint_file_events FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_read" ON public.endpoint_network_events;
CREATE POLICY "tenant_read" ON public.endpoint_network_events FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_read" ON public.endpoint_process_events;
CREATE POLICY "tenant_read" ON public.endpoint_process_events FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_read" ON public.endpoint_registry_events;
CREATE POLICY "tenant_read" ON public.endpoint_registry_events FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Tenant view challenges" ON public.gamification_challenges;
CREATE POLICY "Tenant view challenges" ON public.gamification_challenges FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "group_members_tenant_select" ON public.group_members;
CREATE POLICY "group_members_tenant_select" ON public.group_members FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Tenant users can view their ITSM integrations" ON public.itsm_integrations;
CREATE POLICY "Tenant users can view their ITSM integrations" ON public.itsm_integrations FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Tenant admins can manage ITSM tickets" ON public.itsm_tickets;
CREATE POLICY "Tenant admins can manage ITSM tickets" ON public.itsm_tickets FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Tenant users can view their ITSM tickets" ON public.itsm_tickets;
CREATE POLICY "Tenant users can view their ITSM tickets" ON public.itsm_tickets FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_read_coverage" ON public.mitre_coverage_snapshot;
CREATE POLICY "tenant_read_coverage" ON public.mitre_coverage_snapshot FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Tenant users can view platform configs" ON public.platform_configs;
CREATE POLICY "Tenant users can view platform configs" ON public.platform_configs FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_read_ransomware" ON public.ransomware_indicators;
CREATE POLICY "tenant_read_ransomware" ON public.ransomware_indicators FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_update_ransomware" ON public.ransomware_indicators;
CREATE POLICY "tenant_update_ransomware" ON public.ransomware_indicators FOR UPDATE TO authenticated
  USING (tenant_id = get_active_tenant_id())
  WITH CHECK (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "saml_configs_select_own_tenant" ON public.saml_configs;
CREATE POLICY "saml_configs_select_own_tenant" ON public.saml_configs FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "scim_groups_tenant_select" ON public.scim_groups;
CREATE POLICY "scim_groups_tenant_select" ON public.scim_groups FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_security_graph_edges" ON public.security_graph_edges;
CREATE POLICY "tenant_isolation_security_graph_edges" ON public.security_graph_edges FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_security_graph_nodes" ON public.security_graph_nodes;
CREATE POLICY "tenant_isolation_security_graph_nodes" ON public.security_graph_nodes FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_shadow_it_catalog" ON public.shadow_it_catalog;
CREATE POLICY "tenant_isolation_shadow_it_catalog" ON public.shadow_it_catalog FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_shadow_it_policies" ON public.shadow_it_policies;
CREATE POLICY "tenant_isolation_shadow_it_policies" ON public.shadow_it_policies FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "siem_export_configs_tenant_isolation" ON public.siem_export_configs;
CREATE POLICY "siem_export_configs_tenant_isolation" ON public.siem_export_configs FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "siem_export_history_tenant_isolation" ON public.siem_export_history;
CREATE POLICY "siem_export_history_tenant_isolation" ON public.siem_export_history FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_playbook_versions" ON public.soar_playbook_versions;
CREATE POLICY "tenant_isolation_playbook_versions" ON public.soar_playbook_versions FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Users can view soar_playbooks for their tenant" ON public.soar_playbooks;
CREATE POLICY "Users can view soar_playbooks for their tenant" ON public.soar_playbooks FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_select" ON public.telemetry_event_summaries;
CREATE POLICY "tenant_isolation_select" ON public.telemetry_event_summaries FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_select" ON public.telemetry_retention_config;
CREATE POLICY "tenant_isolation_select" ON public.telemetry_retention_config FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_update" ON public.telemetry_retention_config;
CREATE POLICY "tenant_isolation_update" ON public.telemetry_retention_config FOR UPDATE TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_automation_state" ON public.tenant_automation_state;
CREATE POLICY "tenant_isolation_automation_state" ON public.tenant_automation_state FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_branding_tenant_isolation" ON public.tenant_branding;
CREATE POLICY "tenant_branding_tenant_isolation" ON public.tenant_branding FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation for risk scores" ON public.tenant_risk_scores;
CREATE POLICY "Tenant isolation for risk scores" ON public.tenant_risk_scores FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Tenant leaderboard view" ON public.user_gamification;
CREATE POLICY "Tenant leaderboard view" ON public.user_gamification FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

-- Pattern B: Admin-only policies

DROP POLICY IF EXISTS "Admins can manage automation rules" ON public.automation_rules;
CREATE POLICY "Admins can manage automation rules" ON public.automation_rules TO authenticated
  USING (tenant_id = get_active_tenant_id() AND is_tenant_admin())
  WITH CHECK (tenant_id = get_active_tenant_id() AND is_tenant_admin());

DROP POLICY IF EXISTS "Admins podem gerenciar alertas DLQ" ON public.dlq_exhaustion_alerts;
CREATE POLICY "Admins podem gerenciar alertas DLQ" ON public.dlq_exhaustion_alerts FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id() AND is_tenant_admin());

DROP POLICY IF EXISTS "Tenants podem ver alertas DLQ" ON public.dlq_exhaustion_alerts;
CREATE POLICY "Tenants podem ver alertas DLQ" ON public.dlq_exhaustion_alerts FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Tenant admins can manage ITSM integrations" ON public.itsm_integrations;
CREATE POLICY "Tenant admins can manage ITSM integrations" ON public.itsm_integrations TO authenticated
  USING (tenant_id = get_active_tenant_id() AND is_tenant_admin())
  WITH CHECK (tenant_id = get_active_tenant_id() AND is_tenant_admin());

DROP POLICY IF EXISTS "Tenant admins can manage platform configs" ON public.platform_configs;
CREATE POLICY "Tenant admins can manage platform configs" ON public.platform_configs TO authenticated
  USING (tenant_id = get_active_tenant_id() AND is_tenant_admin())
  WITH CHECK (tenant_id = get_active_tenant_id() AND is_tenant_admin());

DROP POLICY IF EXISTS "Admins can manage soar_playbooks" ON public.soar_playbooks;
CREATE POLICY "Admins can manage soar_playbooks" ON public.soar_playbooks TO authenticated
  USING (tenant_id = get_active_tenant_id() AND is_tenant_admin())
  WITH CHECK (tenant_id = get_active_tenant_id() AND is_tenant_admin());

DROP POLICY IF EXISTS "Admins podem gerenciar webhooks" ON public.webhook_configs;
CREATE POLICY "Admins podem gerenciar webhooks" ON public.webhook_configs FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id() AND is_tenant_admin());

-- Pattern C: Nullable tenant_id (global rules)

DROP POLICY IF EXISTS "tenant_read" ON public.correlation_rules;
CREATE POLICY "tenant_read" ON public.correlation_rules FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "tenant_read_rules" ON public.detection_rules;
CREATE POLICY "tenant_read_rules" ON public.detection_rules FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation for feature_flags" ON public.feature_flags;
CREATE POLICY "Tenant isolation for feature_flags" ON public.feature_flags FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = get_active_tenant_id());

-- Pattern D: Super admin only

DROP POLICY IF EXISTS "admin_ip_whitelist_super_admin_v206" ON public.admin_ip_whitelist;
CREATE POLICY "admin_ip_whitelist_super_admin_v206" ON public.admin_ip_whitelist TO authenticated
  USING (is_current_super_admin())
  WITH CHECK (is_current_super_admin());

DROP POLICY IF EXISTS "Super admins can manage suspension config" ON public.tenant_suspension_config;
CREATE POLICY "Super admins can manage suspension config" ON public.tenant_suspension_config TO authenticated
  USING (is_current_super_admin())
  WITH CHECK (is_current_super_admin());

DROP POLICY IF EXISTS "Super admins can view suspension events" ON public.tenant_suspension_events;
CREATE POLICY "Super admins can view suspension events" ON public.tenant_suspension_events FOR SELECT TO authenticated
  USING (is_current_super_admin());

-- Special cases

DROP POLICY IF EXISTS "ai_insight_feedback_update_active_tenant" ON public.ai_insight_feedback;
CREATE POLICY "ai_insight_feedback_update_active_tenant" ON public.ai_insight_feedback FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND tenant_id = get_active_tenant_id())
  WITH CHECK (user_id = auth.uid() AND tenant_id = get_active_tenant_id());

-- agent_tag_assignments (nested via agents table)
DROP POLICY IF EXISTS "agent_tag_assignments_select" ON public.agent_tag_assignments;
CREATE POLICY "agent_tag_assignments_select" ON public.agent_tag_assignments FOR SELECT TO authenticated
  USING (agent_id IN (SELECT id FROM agents WHERE tenant_id = get_active_tenant_id()));

DROP POLICY IF EXISTS "agent_tag_assignments_delete" ON public.agent_tag_assignments;
CREATE POLICY "agent_tag_assignments_delete" ON public.agent_tag_assignments FOR DELETE TO authenticated
  USING (agent_id IN (SELECT id FROM agents WHERE tenant_id = get_active_tenant_id()));

DROP POLICY IF EXISTS "agent_tag_assignments_insert" ON public.agent_tag_assignments;
CREATE POLICY "agent_tag_assignments_insert" ON public.agent_tag_assignments FOR INSERT TO authenticated
  WITH CHECK (agent_id IN (SELECT id FROM agents WHERE tenant_id = get_active_tenant_id()));

-- agent_updates (join pattern)
DROP POLICY IF EXISTS "Authenticated users can read own agent updates" ON public.agent_updates;
CREATE POLICY "Authenticated users can read own agent updates" ON public.agent_updates FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM agents a 
    WHERE a.id = agent_updates.agent_id 
      AND a.tenant_id = get_active_tenant_id()
  ));

-- agent_processes (tenant OR super_admin)
DROP POLICY IF EXISTS "Users can view processes for their tenant agents" ON public.agent_processes;
CREATE POLICY "Users can view processes for their tenant agents" ON public.agent_processes FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- system_alerts (tenant OR super_admin)
DROP POLICY IF EXISTS "system_alerts_update_active_tenant" ON public.system_alerts;
CREATE POLICY "system_alerts_update_active_tenant" ON public.system_alerts FOR UPDATE TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin())
  WITH CHECK (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- rollback_test_results
DROP POLICY IF EXISTS "Tenant members can view rollback tests" ON public.rollback_test_results;
CREATE POLICY "Tenant members can view rollback tests" ON public.rollback_test_results FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

DROP POLICY IF EXISTS "Admins can update rollback tests" ON public.rollback_test_results;
CREATE POLICY "Admins can update rollback tests" ON public.rollback_test_results FOR UPDATE TO authenticated
  USING (is_current_super_admin() OR (tenant_id = get_active_tenant_id() AND is_tenant_admin()));

-- ai_insight_feedback select
DROP POLICY IF EXISTS "ai_insight_feedback_select_active_tenant" ON public.ai_insight_feedback;
CREATE POLICY "ai_insight_feedback_select_active_tenant" ON public.ai_insight_feedback FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- decision_events insert
DROP POLICY IF EXISTS "decision_events_insert_authenticated" ON public.decision_events;
CREATE POLICY "decision_events_insert_authenticated" ON public.decision_events FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_active_tenant_id());

-- webhook_configs select
DROP POLICY IF EXISTS "webhook_configs_select_admin_only" ON public.webhook_configs;
CREATE POLICY "webhook_configs_select_admin_only" ON public.webhook_configs FOR SELECT TO authenticated
  USING (is_current_super_admin() OR (tenant_id = get_active_tenant_id() AND is_tenant_admin()));

-- security_events select
DROP POLICY IF EXISTS "security_events_select_admin_only" ON public.security_events;
CREATE POLICY "security_events_select_admin_only" ON public.security_events FOR SELECT TO authenticated
  USING (is_current_super_admin() OR (tenant_id = get_active_tenant_id() AND is_tenant_admin()));

-- enrollment_keys
DROP POLICY IF EXISTS "enrollment_keys_select_admin_only" ON public.enrollment_keys;
CREATE POLICY "enrollment_keys_select_admin_only" ON public.enrollment_keys FOR SELECT TO authenticated
  USING (is_current_super_admin() OR (tenant_id = get_active_tenant_id() AND is_tenant_admin()));

-- active_sessions (optimize user_roles check)
DROP POLICY IF EXISTS "active_sessions_super_admin" ON public.active_sessions;
CREATE POLICY "active_sessions_super_admin" ON public.active_sessions FOR SELECT TO authenticated
  USING (is_current_super_admin() AND (tenant_id IS NULL OR tenant_id = get_active_tenant_id()));