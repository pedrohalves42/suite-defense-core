
-- 1. job_executions: Fix policies
DROP POLICY IF EXISTS "Only service role can insert job executions" ON public.job_executions;
DROP POLICY IF EXISTS "Only service role can finalize executions" ON public.job_executions;

CREATE POLICY "service_role_insert_job_executions"
ON public.job_executions FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "service_role_update_job_executions"
ON public.job_executions FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- 2. session_store: Fix public access
DROP POLICY IF EXISTS "session_store_service_role" ON public.session_store;

CREATE POLICY "service_role_only_session_store"
ON public.session_store
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. Storage: Remove dangerous policies
DROP POLICY IF EXISTS "Public can download installers" ON storage.objects;
DROP POLICY IF EXISTS "System can delete old installers" ON storage.objects;

CREATE POLICY "service_role_delete_installers"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'agent-installers');

-- 4. agent-scripts: Fix upload to admin-only
DROP POLICY IF EXISTS "Only admins can upload agent scripts" ON storage.objects;

CREATE POLICY "admins_can_upload_agent_scripts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'agent-scripts' AND
  public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- 5. Materialized views: Revoke authenticated access
REVOKE ALL ON public.mv_job_metrics_24h FROM authenticated;
REVOKE ALL ON public.mv_fleet_summary FROM authenticated;
REVOKE ALL ON public.mv_alert_summary FROM authenticated;
REVOKE ALL ON public.mv_security_posture FROM authenticated;
GRANT SELECT ON public.mv_job_metrics_24h TO service_role;
GRANT SELECT ON public.mv_fleet_summary TO service_role;
GRANT SELECT ON public.mv_alert_summary TO service_role;
GRANT SELECT ON public.mv_security_posture TO service_role;

-- 6. Views: Set security_invoker=true on ALL 90 public views
ALTER VIEW public.hmac_agent_secrets SET (security_invoker = true);
ALTER VIEW public.agents_safe SET (security_invoker = true);
ALTER VIEW public.agents_public SET (security_invoker = true);
ALTER VIEW public.active_agents SET (security_invoker = true);
ALTER VIEW public.audit_logs_safe SET (security_invoker = true);
ALTER VIEW public.enrollment_keys_safe SET (security_invoker = true);
ALTER VIEW public.invites_safe SET (security_invoker = true);
ALTER VIEW public.webhook_configs_safe SET (security_invoker = true);
ALTER VIEW public.profiles_public SET (security_invoker = true);
ALTER VIEW public.agent_snapshots SET (security_invoker = true);
ALTER VIEW public.agent_releases_public SET (security_invoker = true);
ALTER VIEW public.v_agent_state SET (security_invoker = true);
ALTER VIEW public.v_agent_lifecycle_state SET (security_invoker = true);
ALTER VIEW public.v_agent_execution_health SET (security_invoker = true);
ALTER VIEW public.v_agent_health_summary SET (security_invoker = true);
ALTER VIEW public.v_security_dashboard SET (security_invoker = true);
ALTER VIEW public.v_tenant_plan_status SET (security_invoker = true);
ALTER VIEW public.v_tenant_isolation_metrics SET (security_invoker = true);
ALTER VIEW public.v_system_operations_summary SET (security_invoker = true);
ALTER VIEW public.v_soc2_readiness SET (security_invoker = true);
ALTER VIEW public.v_rbac_metrics SET (security_invoker = true);
ALTER VIEW public.v_governance_stats SET (security_invoker = true);
ALTER VIEW public.v_security_invariants SET (security_invoker = true);
ALTER VIEW public.v_rls_security_status SET (security_invoker = true);
ALTER VIEW public.v_rls_continuous_check SET (security_invoker = true);
ALTER VIEW public.v_job_health SET (security_invoker = true);
ALTER VIEW public.v_jobs_status_corrected SET (security_invoker = true);
ALTER VIEW public.v_job_execution_health SET (security_invoker = true);
ALTER VIEW public.v_job_health_anomalies SET (security_invoker = true);
ALTER VIEW public.v_job_metrics_by_type SET (security_invoker = true);
ALTER VIEW public.v_stuck_jobs_report SET (security_invoker = true);
ALTER VIEW public.v_problematic_jobs SET (security_invoker = true);
ALTER VIEW public.v_action_center SET (security_invoker = true);
ALTER VIEW public.v_risk_debt_active SET (security_invoker = true);
ALTER VIEW public.v_risk_debt_summary SET (security_invoker = true);
ALTER VIEW public.v_active_risk_debt SET (security_invoker = true);
ALTER VIEW public.v_zero_gap_health SET (security_invoker = true);
ALTER VIEW public.v_zero_gap_dashboard SET (security_invoker = true);
ALTER VIEW public.v_ai_anomalies SET (security_invoker = true);
ALTER VIEW public.v_ai_provider_performance SET (security_invoker = true);
ALTER VIEW public.v_ai_function_performance SET (security_invoker = true);
ALTER VIEW public.v_ai_hourly_trends SET (security_invoker = true);
ALTER VIEW public.v_soar_execution_summary SET (security_invoker = true);
ALTER VIEW public.v_legacy_agents_telemetry SET (security_invoker = true);
ALTER VIEW public.v_problematic_agents SET (security_invoker = true);
ALTER VIEW public.v_virus_scans SET (security_invoker = true);
ALTER VIEW public.v_enforcement_compliance SET (security_invoker = true);
ALTER VIEW public.v_dlq_risk_overview SET (security_invoker = true);
ALTER VIEW public.v_dlq_pending_attention SET (security_invoker = true);
ALTER VIEW public.v_cron_health SET (security_invoker = true);
ALTER VIEW public.v_cron_silence SET (security_invoker = true);
ALTER VIEW public.v_cron_silent_failures SET (security_invoker = true);
ALTER VIEW public.v_task_stats SET (security_invoker = true);
ALTER VIEW public.v_task_automation_metrics SET (security_invoker = true);
ALTER VIEW public.v_critical_unassigned_tasks SET (security_invoker = true);
ALTER VIEW public.v_tasks_requiring_closure SET (security_invoker = true);
ALTER VIEW public.v_pending_critical_approvals SET (security_invoker = true);
ALTER VIEW public.v_incident_groups SET (security_invoker = true);
ALTER VIEW public.v_incident_groups_with_slo SET (security_invoker = true);
ALTER VIEW public.v_anomalies_without_runbook SET (security_invoker = true);
ALTER VIEW public.v_audit_integrity_status SET (security_invoker = true);
ALTER VIEW public.v_audit_moving_average SET (security_invoker = true);
ALTER VIEW public.v_execution_chain_health SET (security_invoker = true);
ALTER VIEW public.v_integrity_score SET (security_invoker = true);
ALTER VIEW public.v_system_contracts SET (security_invoker = true);
ALTER VIEW public.v_system_cycle_health SET (security_invoker = true);
ALTER VIEW public.v_pipeline_health_metrics SET (security_invoker = true);
ALTER VIEW public.v_normalized_events SET (security_invoker = true);
ALTER VIEW public.v_edge_function_stats SET (security_invoker = true);
ALTER VIEW public.v_confidence_gap_trend SET (security_invoker = true);
ALTER VIEW public.v_tenant_claim_health SET (security_invoker = true);
ALTER VIEW public.v_security_scan_compliance SET (security_invoker = true);
ALTER VIEW public.v_service_role_policies SET (security_invoker = true);
ALTER VIEW public.v_database_size_report SET (security_invoker = true);
ALTER VIEW public.v_network_events_recent SET (security_invoker = true);
ALTER VIEW public.v_process_events_recent SET (security_invoker = true);
ALTER VIEW public.v_event_buffer_pending SET (security_invoker = true);
ALTER VIEW public.v_agent_health_by_node SET (security_invoker = true);
ALTER VIEW public.v_agent_archive_reason_tree SET (security_invoker = true);
ALTER VIEW public.v_job_hourly_trends SET (security_invoker = true);
ALTER VIEW public.installation_metrics_summary SET (security_invoker = true);
ALTER VIEW public.installation_health_status SET (security_invoker = true);
ALTER VIEW public.installation_error_summary SET (security_invoker = true);
ALTER VIEW public.agent_installation_metrics SET (security_invoker = true);
ALTER VIEW public.circuit_breaker_health SET (security_invoker = true);
ALTER VIEW public.rate_limit_stats SET (security_invoker = true);
ALTER VIEW public.dlq_categorized SET (security_invoker = true);
ALTER VIEW public.job_integrity_violations SET (security_invoker = true);
ALTER VIEW public.job_failure_health SET (security_invoker = true);
ALTER VIEW public.jobs_normalized SET (security_invoker = true);
