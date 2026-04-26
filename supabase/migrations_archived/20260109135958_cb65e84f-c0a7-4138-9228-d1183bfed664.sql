
-- =====================================================
-- ADR-026 MIGRATION BATCH 4: Operations & Tasks
-- ~35 policies across operational tables
-- =====================================================

-- 1. audit_confidence_gaps - SELECT
DROP POLICY IF EXISTS "Users can view their tenant gaps" ON audit_confidence_gaps;
DROP POLICY IF EXISTS "audit_confidence_gaps_select_active_tenant" ON audit_confidence_gaps;
CREATE POLICY "audit_confidence_gaps_select_active_tenant" ON audit_confidence_gaps
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 2. audit_confidence_gaps - INSERT
DROP POLICY IF EXISTS "System can insert confidence gaps" ON audit_confidence_gaps;
DROP POLICY IF EXISTS "audit_confidence_gaps_insert_active_tenant" ON audit_confidence_gaps;
CREATE POLICY "audit_confidence_gaps_insert_active_tenant" ON audit_confidence_gaps
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 3. audit_report_verifications (super_admin only)
DROP POLICY IF EXISTS "Super admins can manage report verifications" ON audit_report_verifications;
DROP POLICY IF EXISTS "audit_report_verifications_all_super_admin" ON audit_report_verifications;
CREATE POLICY "audit_report_verifications_all_super_admin" ON audit_report_verifications
FOR ALL USING (is_current_super_admin());

-- 4. blast_radius_policies
DROP POLICY IF EXISTS "Admins can manage blast radius policies" ON blast_radius_policies;
DROP POLICY IF EXISTS "blast_radius_policies_all_active_tenant" ON blast_radius_policies;
CREATE POLICY "blast_radius_policies_all_active_tenant" ON blast_radius_policies
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 5. blocked_websites
DROP POLICY IF EXISTS "Users can view blocked websites for their tenant" ON blocked_websites;
DROP POLICY IF EXISTS "blocked_websites_select_active_tenant" ON blocked_websites;
CREATE POLICY "blocked_websites_select_active_tenant" ON blocked_websites
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 6. circuit_breaker_events
DROP POLICY IF EXISTS "Users can view circuit breaker events" ON circuit_breaker_events;
DROP POLICY IF EXISTS "circuit_breaker_events_select_active_tenant" ON circuit_breaker_events;
CREATE POLICY "circuit_breaker_events_select_active_tenant" ON circuit_breaker_events
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 7. decision_rules (super_admin only)
DROP POLICY IF EXISTS "Super admins can manage decision rules" ON decision_rules;
DROP POLICY IF EXISTS "decision_rules_all_super_admin" ON decision_rules;
CREATE POLICY "decision_rules_all_super_admin" ON decision_rules
FOR ALL USING (is_current_super_admin());

-- 8. event_risk_scoring (super_admin only)
DROP POLICY IF EXISTS "Super admins can manage event risk scoring" ON event_risk_scoring;
DROP POLICY IF EXISTS "event_risk_scoring_all_super_admin" ON event_risk_scoring;
CREATE POLICY "event_risk_scoring_all_super_admin" ON event_risk_scoring
FOR ALL USING (is_current_super_admin());

-- 9. evidence_bundles
DROP POLICY IF EXISTS "Users can view evidence bundles for their tenant" ON evidence_bundles;
DROP POLICY IF EXISTS "evidence_bundles_select_active_tenant" ON evidence_bundles;
CREATE POLICY "evidence_bundles_select_active_tenant" ON evidence_bundles
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 10. failed_jobs_dlq - SELECT
DROP POLICY IF EXISTS "Admins can view failed jobs" ON failed_jobs_dlq;
DROP POLICY IF EXISTS "failed_jobs_dlq_select_active_tenant" ON failed_jobs_dlq;
CREATE POLICY "failed_jobs_dlq_select_active_tenant" ON failed_jobs_dlq
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 11. failed_jobs_dlq - UPDATE
DROP POLICY IF EXISTS "Admins can update failed jobs" ON failed_jobs_dlq;
DROP POLICY IF EXISTS "failed_jobs_dlq_update_active_tenant" ON failed_jobs_dlq;
CREATE POLICY "failed_jobs_dlq_update_active_tenant" ON failed_jobs_dlq
FOR UPDATE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 12. failed_jobs_dlq - DELETE
DROP POLICY IF EXISTS "Admins can delete failed jobs" ON failed_jobs_dlq;
DROP POLICY IF EXISTS "failed_jobs_dlq_delete_active_tenant" ON failed_jobs_dlq;
CREATE POLICY "failed_jobs_dlq_delete_active_tenant" ON failed_jobs_dlq
FOR DELETE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 13. feature_flags
DROP POLICY IF EXISTS "Users can view feature flags for their tenant" ON feature_flags;
DROP POLICY IF EXISTS "feature_flags_select_active_tenant" ON feature_flags;
CREATE POLICY "feature_flags_select_active_tenant" ON feature_flags
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 14. forensic_snapshots
DROP POLICY IF EXISTS "Admins can view forensic snapshots" ON forensic_snapshots;
DROP POLICY IF EXISTS "forensic_snapshots_select_active_tenant" ON forensic_snapshots;
CREATE POLICY "forensic_snapshots_select_active_tenant" ON forensic_snapshots
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 15. generated_reports - SELECT
DROP POLICY IF EXISTS "Users can view their tenant reports" ON generated_reports;
DROP POLICY IF EXISTS "generated_reports_select_active_tenant" ON generated_reports;
CREATE POLICY "generated_reports_select_active_tenant" ON generated_reports
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 16. generated_reports - INSERT
DROP POLICY IF EXISTS "System can insert generated reports" ON generated_reports;
DROP POLICY IF EXISTS "generated_reports_insert_active_tenant" ON generated_reports;
CREATE POLICY "generated_reports_insert_active_tenant" ON generated_reports
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 17. generated_reports - UPDATE
DROP POLICY IF EXISTS "Admins can update generated reports" ON generated_reports;
DROP POLICY IF EXISTS "generated_reports_update_active_tenant" ON generated_reports;
CREATE POLICY "generated_reports_update_active_tenant" ON generated_reports
FOR UPDATE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 18. incident_timelines - SELECT
DROP POLICY IF EXISTS "Users can view incident timelines" ON incident_timelines;
DROP POLICY IF EXISTS "incident_timelines_select_active_tenant" ON incident_timelines;
CREATE POLICY "incident_timelines_select_active_tenant" ON incident_timelines
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 19. incident_timelines - INSERT
DROP POLICY IF EXISTS "System can insert incident timelines" ON incident_timelines;
DROP POLICY IF EXISTS "incident_timelines_insert_active_tenant" ON incident_timelines;
CREATE POLICY "incident_timelines_insert_active_tenant" ON incident_timelines
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 20. installation_analytics - SELECT
DROP POLICY IF EXISTS "Admins can view installation analytics" ON installation_analytics;
DROP POLICY IF EXISTS "installation_analytics_select_active_tenant" ON installation_analytics;
CREATE POLICY "installation_analytics_select_active_tenant" ON installation_analytics
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 21. installation_analytics - INSERT
DROP POLICY IF EXISTS "System can insert installation analytics" ON installation_analytics;
DROP POLICY IF EXISTS "installation_analytics_insert_active_tenant" ON installation_analytics;
CREATE POLICY "installation_analytics_insert_active_tenant" ON installation_analytics
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 22. job_executions
DROP POLICY IF EXISTS "Users can view job executions for their tenant" ON job_executions;
DROP POLICY IF EXISTS "job_executions_select_active_tenant" ON job_executions;
CREATE POLICY "job_executions_select_active_tenant" ON job_executions
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 23. marketing_costs
DROP POLICY IF EXISTS "Admins can manage marketing costs" ON marketing_costs;
DROP POLICY IF EXISTS "marketing_costs_all_active_tenant" ON marketing_costs;
CREATE POLICY "marketing_costs_all_active_tenant" ON marketing_costs
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 24. network_anomalies - SELECT
DROP POLICY IF EXISTS "Admins can view network anomalies" ON network_anomalies;
DROP POLICY IF EXISTS "network_anomalies_select_active_tenant" ON network_anomalies;
CREATE POLICY "network_anomalies_select_active_tenant" ON network_anomalies
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 25. network_anomalies - UPDATE
DROP POLICY IF EXISTS "Admins can update network anomalies" ON network_anomalies;
DROP POLICY IF EXISTS "network_anomalies_update_active_tenant" ON network_anomalies;
CREATE POLICY "network_anomalies_update_active_tenant" ON network_anomalies
FOR UPDATE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 26. operational_calendar - SELECT
DROP POLICY IF EXISTS "Users can view operational calendar" ON operational_calendar;
DROP POLICY IF EXISTS "operational_calendar_select_active_tenant" ON operational_calendar;
CREATE POLICY "operational_calendar_select_active_tenant" ON operational_calendar
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 27. operational_calendar - ALL
DROP POLICY IF EXISTS "Admins can manage operational calendar" ON operational_calendar;
DROP POLICY IF EXISTS "operational_calendar_all_active_tenant" ON operational_calendar;
CREATE POLICY "operational_calendar_all_active_tenant" ON operational_calendar
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 28. performance_metrics
DROP POLICY IF EXISTS "Users can view performance metrics" ON performance_metrics;
DROP POLICY IF EXISTS "performance_metrics_select_active_tenant" ON performance_metrics;
CREATE POLICY "performance_metrics_select_active_tenant" ON performance_metrics
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 29. persistent_failure_alerts - SELECT
DROP POLICY IF EXISTS "Users can view persistent failure alerts" ON persistent_failure_alerts;
DROP POLICY IF EXISTS "persistent_failure_alerts_select_active_tenant" ON persistent_failure_alerts;
CREATE POLICY "persistent_failure_alerts_select_active_tenant" ON persistent_failure_alerts
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 30. persistent_failure_alerts - UPDATE
DROP POLICY IF EXISTS "Admins can update persistent failure alerts" ON persistent_failure_alerts;
DROP POLICY IF EXISTS "persistent_failure_alerts_update_active_tenant" ON persistent_failure_alerts;
CREATE POLICY "persistent_failure_alerts_update_active_tenant" ON persistent_failure_alerts
FOR UPDATE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);
