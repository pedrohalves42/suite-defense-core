
-- =====================================================
-- ADR-026 MIGRATION BATCH 5: Remaining Policies Part 1
-- ~55 policies across all remaining tables
-- =====================================================

-- === AGENT TABLES (restantes) ===

-- agent_archive_events - INSERT
DROP POLICY IF EXISTS "Admins can insert archive events" ON agent_archive_events;
DROP POLICY IF EXISTS "agent_archive_events_insert_active_tenant" ON agent_archive_events;
CREATE POLICY "agent_archive_events_insert_active_tenant" ON agent_archive_events
FOR INSERT WITH CHECK (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM agents a WHERE a.id = agent_archive_events.agent_id
    AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- agent_releases - mais policies antigas
DROP POLICY IF EXISTS "super_admins_can_manage_agent_releases" ON agent_releases;
DROP POLICY IF EXISTS "admins_can_view_agent_releases" ON agent_releases;

-- agent_rollback_events - tenant_view_rollbacks
DROP POLICY IF EXISTS "tenant_view_rollbacks" ON agent_rollback_events;

-- agent_signing_keys - outra policy
DROP POLICY IF EXISTS "Admins can view agent signing keys in their tenant" ON agent_signing_keys;

-- agent_system_metrics - mais policies
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON agent_system_metrics;
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON agent_system_metrics_2025_12;
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON agent_system_metrics_2026_01;
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON agent_system_metrics_partitioned;

-- === AUDIT TABLES ===

-- audit_confidence_gaps - SELECT (outra)
DROP POLICY IF EXISTS "Admins can view confidence gaps for their tenant" ON audit_confidence_gaps;

-- audit_report_verifications - SELECT
DROP POLICY IF EXISTS "Allow authenticated users to read verifications" ON audit_report_verifications;

-- === OPERATIONAL TABLES ===

-- blocked_websites - ALL
DROP POLICY IF EXISTS "Admins can manage blocked websites in their tenant" ON blocked_websites;
DROP POLICY IF EXISTS "blocked_websites_all_active_tenant" ON blocked_websites;
CREATE POLICY "blocked_websites_all_active_tenant" ON blocked_websites
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- circuit_breaker_events - SELECT (outra)
DROP POLICY IF EXISTS "Admins can view circuit breaker events" ON circuit_breaker_events;

-- decision_rules - SELECT
DROP POLICY IF EXISTS "Admins can view decision rules" ON decision_rules;

-- event_risk_scoring - SELECT
DROP POLICY IF EXISTS "Admins can view event_risk_scoring" ON event_risk_scoring;

-- evidence_bundles - INSERT
DROP POLICY IF EXISTS "Admins can create evidence bundles" ON evidence_bundles;
DROP POLICY IF EXISTS "evidence_bundles_insert_active_tenant" ON evidence_bundles;
CREATE POLICY "evidence_bundles_insert_active_tenant" ON evidence_bundles
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- failed_jobs_dlq - mais policies
DROP POLICY IF EXISTS "Admins can delete from tenant DLQ" ON failed_jobs_dlq;
DROP POLICY IF EXISTS "Admins can view tenant DLQ" ON failed_jobs_dlq;
DROP POLICY IF EXISTS "Admins can update tenant DLQ" ON failed_jobs_dlq;

-- feature_flags - ALL
DROP POLICY IF EXISTS "Admins can manage feature flags in their tenant" ON feature_flags;
DROP POLICY IF EXISTS "feature_flags_all_active_tenant" ON feature_flags;
CREATE POLICY "feature_flags_all_active_tenant" ON feature_flags
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- forensic_snapshots - SELECT (outra)
DROP POLICY IF EXISTS "Users can view forensic snapshots in their tenant" ON forensic_snapshots;

-- generated_reports - mais policies
DROP POLICY IF EXISTS "Users can delete their tenant reports" ON generated_reports;
DROP POLICY IF EXISTS "generated_reports_delete_active_tenant" ON generated_reports;
CREATE POLICY "generated_reports_delete_active_tenant" ON generated_reports
FOR DELETE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "Users can insert reports for their tenant" ON generated_reports;

-- incident_timelines - mais policies
DROP POLICY IF EXISTS "Admins can manage incident timelines" ON incident_timelines;
DROP POLICY IF EXISTS "incident_timelines_all_active_tenant" ON incident_timelines;
CREATE POLICY "incident_timelines_all_active_tenant" ON incident_timelines
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "Users can view incident timelines in their tenant" ON incident_timelines;

-- installation_analytics - mais policies
DROP POLICY IF EXISTS "Super admins can view all installation analytics" ON installation_analytics;
DROP POLICY IF EXISTS "Admins can view installation analytics for their tenant" ON installation_analytics;

-- job_executions - outra
DROP POLICY IF EXISTS "Admins can view executions in their tenant" ON job_executions;

-- marketing_costs - ALL
DROP POLICY IF EXISTS "Super admins can manage marketing_costs" ON marketing_costs;

-- network_anomalies - mais policies
DROP POLICY IF EXISTS "Users can view network anomalies in their tenant" ON network_anomalies;
DROP POLICY IF EXISTS "Admins can update network anomalies in their tenant" ON network_anomalies;

-- notification_channels - ALL
DROP POLICY IF EXISTS "Admins can manage notification channels in their tenant" ON notification_channels;

-- notification_log - SELECT
DROP POLICY IF EXISTS "Admins can view notification logs in their tenant" ON notification_log;

-- notification_preferences - ALL
DROP POLICY IF EXISTS "Admins can manage notification preferences in their tenant" ON notification_preferences;

-- notification_queue - mais
DROP POLICY IF EXISTS "Users can insert notifications for their tenant" ON notification_queue;
DROP POLICY IF EXISTS "Users can view their tenant notifications" ON notification_queue;
DROP POLICY IF EXISTS "Users can update their tenant notifications" ON notification_queue;

-- operational_calendar - mais
DROP POLICY IF EXISTS "Admins can manage calendar" ON operational_calendar;
DROP POLICY IF EXISTS "Tenant members can view calendar" ON operational_calendar;

-- performance_metrics - SELECT
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON performance_metrics;

-- persistent_failure_alerts - mais
DROP POLICY IF EXISTS "Users can view persistent alerts for their tenant" ON persistent_failure_alerts;
DROP POLICY IF EXISTS "Operators can acknowledge alerts" ON persistent_failure_alerts;
