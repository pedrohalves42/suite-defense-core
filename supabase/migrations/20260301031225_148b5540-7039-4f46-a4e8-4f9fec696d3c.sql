
-- ================================================================
-- FASE 3: Integridade Relacional (V-310, V-311, V-312)
-- ================================================================

-- Helper: Add FK only if not exists
CREATE OR REPLACE FUNCTION public._add_tenant_fk_if_missing(p_table text, p_constraint text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = p_constraint AND contype = 'f') THEN
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)', p_table, p_constraint);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipping FK on %: %', p_table, SQLERRM;
END;
$$;

SELECT public._add_tenant_fk_if_missing('active_sessions', 'fk_active_sessions_tenant');
SELECT public._add_tenant_fk_if_missing('adaptive_blast_radius_config', 'fk_adaptive_blast_radius_config_tenant');
SELECT public._add_tenant_fk_if_missing('admin_ip_whitelist', 'fk_admin_ip_whitelist_tenant');
SELECT public._add_tenant_fk_if_missing('agent_archive_events', 'fk_agent_archive_events_tenant');
SELECT public._add_tenant_fk_if_missing('agent_behavioral_baseline', 'fk_agent_behavioral_baseline_tenant');
SELECT public._add_tenant_fk_if_missing('agent_builds', 'fk_agent_builds_tenant');
SELECT public._add_tenant_fk_if_missing('agent_certificates', 'fk_agent_certificates_tenant');
SELECT public._add_tenant_fk_if_missing('agent_disk_metrics', 'fk_agent_disk_metrics_tenant');
SELECT public._add_tenant_fk_if_missing('agent_evidence_logs', 'fk_agent_evidence_logs_tenant');
SELECT public._add_tenant_fk_if_missing('agent_execution_chain', 'fk_agent_execution_chain_tenant');
SELECT public._add_tenant_fk_if_missing('agent_file_integrity', 'fk_agent_file_integrity_tenant');
SELECT public._add_tenant_fk_if_missing('agent_group_members', 'fk_agent_group_members_tenant');
SELECT public._add_tenant_fk_if_missing('agent_group_policies', 'fk_agent_group_policies_tenant');
SELECT public._add_tenant_fk_if_missing('agent_groups', 'fk_agent_groups_tenant');
SELECT public._add_tenant_fk_if_missing('agent_hmac_format_cache', 'fk_agent_hmac_format_cache_tenant');
SELECT public._add_tenant_fk_if_missing('agent_installation_metrics', 'fk_agent_installation_metrics_tenant');
SELECT public._add_tenant_fk_if_missing('agent_light_mode_configs', 'fk_agent_light_mode_configs_tenant');
SELECT public._add_tenant_fk_if_missing('agent_metrics_daily', 'fk_agent_metrics_daily_tenant');
SELECT public._add_tenant_fk_if_missing('agent_network_info', 'fk_agent_network_info_tenant');
SELECT public._add_tenant_fk_if_missing('agent_network_metrics', 'fk_agent_network_metrics_tenant');
SELECT public._add_tenant_fk_if_missing('agent_processes', 'fk_agent_processes_tenant');
SELECT public._add_tenant_fk_if_missing('agent_quarantine', 'fk_agent_quarantine_tenant');
SELECT public._add_tenant_fk_if_missing('agent_recovery_authorizations', 'fk_agent_recovery_authorizations_tenant');
SELECT public._add_tenant_fk_if_missing('agent_rollback_events', 'fk_agent_rollback_events_tenant');
SELECT public._add_tenant_fk_if_missing('agent_safe_mode_events', 'fk_agent_safe_mode_events_tenant');
SELECT public._add_tenant_fk_if_missing('agent_signing_keys', 'fk_agent_signing_keys_tenant');
SELECT public._add_tenant_fk_if_missing('agent_system_metrics_partitioned', 'fk_agent_system_metrics_part_tenant');
SELECT public._add_tenant_fk_if_missing('agent_tag_assignments', 'fk_agent_tag_assignments_tenant');
SELECT public._add_tenant_fk_if_missing('agent_tags', 'fk_agent_tags_tenant');
SELECT public._add_tenant_fk_if_missing('agent_tokens', 'fk_agent_tokens_tenant');
SELECT public._add_tenant_fk_if_missing('agent_update_decisions', 'fk_agent_update_decisions_tenant');
SELECT public._add_tenant_fk_if_missing('agent_updates', 'fk_agent_updates_tenant');
SELECT public._add_tenant_fk_if_missing('agent_usb_devices', 'fk_agent_usb_devices_tenant');
SELECT public._add_tenant_fk_if_missing('agent_vulnerabilities', 'fk_agent_vulnerabilities_tenant');
SELECT public._add_tenant_fk_if_missing('agent_vulnerability_scans', 'fk_agent_vulnerability_scans_tenant');
SELECT public._add_tenant_fk_if_missing('agent_web_activity', 'fk_agent_web_activity_tenant');
SELECT public._add_tenant_fk_if_missing('agents_groups', 'fk_agents_groups_tenant');
SELECT public._add_tenant_fk_if_missing('ai_action_executions', 'fk_ai_action_executions_tenant');
SELECT public._add_tenant_fk_if_missing('ai_action_logs', 'fk_ai_action_logs_tenant');
SELECT public._add_tenant_fk_if_missing('ai_action_validations', 'fk_ai_action_validations_tenant');
SELECT public._add_tenant_fk_if_missing('ai_actions', 'fk_ai_actions_tenant');
SELECT public._add_tenant_fk_if_missing('ai_anomalies', 'fk_ai_anomalies_tenant');
SELECT public._add_tenant_fk_if_missing('ai_decision_reports', 'fk_ai_decision_reports_tenant');
SELECT public._add_tenant_fk_if_missing('ai_feedback', 'fk_ai_feedback_tenant');
SELECT public._add_tenant_fk_if_missing('ai_inference_metrics', 'fk_ai_inference_metrics_tenant');
SELECT public._add_tenant_fk_if_missing('ai_insight_feedback', 'fk_ai_insight_feedback_tenant');
SELECT public._add_tenant_fk_if_missing('ai_insights', 'fk_ai_insights_tenant');
SELECT public._add_tenant_fk_if_missing('ai_learned_patterns', 'fk_ai_learned_patterns_tenant');
SELECT public._add_tenant_fk_if_missing('ai_rejected_decisions', 'fk_ai_rejected_decisions_tenant');
SELECT public._add_tenant_fk_if_missing('ai_response_cache', 'fk_ai_response_cache_tenant');
SELECT public._add_tenant_fk_if_missing('anomaly_events', 'fk_anomaly_events_tenant');
SELECT public._add_tenant_fk_if_missing('antivirus_status', 'fk_antivirus_status_tenant');
SELECT public._add_tenant_fk_if_missing('api_keys', 'fk_api_keys_tenant');
SELECT public._add_tenant_fk_if_missing('api_request_logs', 'fk_api_request_logs_tenant');
SELECT public._add_tenant_fk_if_missing('approval_chains', 'fk_approval_chains_tenant');
SELECT public._add_tenant_fk_if_missing('approval_requests', 'fk_approval_requests_tenant');
SELECT public._add_tenant_fk_if_missing('audit_confidence_gaps', 'fk_audit_confidence_gaps_tenant');
SELECT public._add_tenant_fk_if_missing('audit_integrity_checks', 'fk_audit_integrity_checks_tenant');
SELECT public._add_tenant_fk_if_missing('audit_reason_trees', 'fk_audit_reason_trees_tenant');
SELECT public._add_tenant_fk_if_missing('auto_remediation_actions', 'fk_auto_remediation_actions_tenant');
SELECT public._add_tenant_fk_if_missing('automation_approvals', 'fk_automation_approvals_tenant');
SELECT public._add_tenant_fk_if_missing('automation_decision_log', 'fk_automation_decision_log_tenant');
SELECT public._add_tenant_fk_if_missing('automation_rule_dependencies', 'fk_automation_rule_dependencies_tenant');
SELECT public._add_tenant_fk_if_missing('automation_rule_versions', 'fk_automation_rule_versions_tenant');
SELECT public._add_tenant_fk_if_missing('automation_sla_metrics', 'fk_automation_sla_metrics_tenant');
SELECT public._add_tenant_fk_if_missing('blast_radius_policies', 'fk_blast_radius_policies_tenant');
SELECT public._add_tenant_fk_if_missing('blocked_access_attempts', 'fk_blocked_access_attempts_tenant');
SELECT public._add_tenant_fk_if_missing('blocked_websites', 'fk_blocked_websites_tenant');
SELECT public._add_tenant_fk_if_missing('circuit_breaker_events', 'fk_circuit_breaker_events_tenant');
SELECT public._add_tenant_fk_if_missing('circuit_breaker_health', 'fk_circuit_breaker_health_tenant');
SELECT public._add_tenant_fk_if_missing('compliance_policies', 'fk_compliance_policies_tenant');
SELECT public._add_tenant_fk_if_missing('compliance_snapshots', 'fk_compliance_snapshots_tenant');
SELECT public._add_tenant_fk_if_missing('custom_trials', 'fk_custom_trials_tenant');
SELECT public._add_tenant_fk_if_missing('decision_events', 'fk_decision_events_tenant');
SELECT public._add_tenant_fk_if_missing('dlq_exhaustion_alerts', 'fk_dlq_exhaustion_alerts_tenant');
SELECT public._add_tenant_fk_if_missing('edge_function_metrics', 'fk_edge_function_metrics_tenant');
SELECT public._add_tenant_fk_if_missing('evidence_bundles', 'fk_evidence_bundles_tenant');
SELECT public._add_tenant_fk_if_missing('failed_login_attempts', 'fk_failed_login_attempts_tenant');
SELECT public._add_tenant_fk_if_missing('failure_occurrences', 'fk_failure_occurrences_tenant');
SELECT public._add_tenant_fk_if_missing('forensic_snapshots', 'fk_forensic_snapshots_tenant');
SELECT public._add_tenant_fk_if_missing('generated_reports', 'fk_generated_reports_tenant');
SELECT public._add_tenant_fk_if_missing('governance_adrs', 'fk_governance_adrs_tenant');
SELECT public._add_tenant_fk_if_missing('governance_reports', 'fk_governance_reports_tenant');
SELECT public._add_tenant_fk_if_missing('installation_analytics', 'fk_installation_analytics_tenant');
SELECT public._add_tenant_fk_if_missing('ip_blocklist', 'fk_ip_blocklist_tenant');
SELECT public._add_tenant_fk_if_missing('itsm_integrations', 'fk_itsm_integrations_tenant');
SELECT public._add_tenant_fk_if_missing('itsm_tickets', 'fk_itsm_tickets_tenant');
SELECT public._add_tenant_fk_if_missing('job_slo_state', 'fk_job_slo_state_tenant');
SELECT public._add_tenant_fk_if_missing('marketing_costs', 'fk_marketing_costs_tenant');
SELECT public._add_tenant_fk_if_missing('network_anomalies', 'fk_network_anomalies_tenant');
SELECT public._add_tenant_fk_if_missing('notification_channels', 'fk_notification_channels_tenant');
SELECT public._add_tenant_fk_if_missing('notification_deliveries', 'fk_notification_deliveries_tenant');
SELECT public._add_tenant_fk_if_missing('notification_preferences', 'fk_notification_preferences_tenant');
SELECT public._add_tenant_fk_if_missing('onboarding_progress', 'fk_onboarding_progress_tenant');
SELECT public._add_tenant_fk_if_missing('operational_calendar', 'fk_operational_calendar_tenant');
SELECT public._add_tenant_fk_if_missing('performance_metrics', 'fk_performance_metrics_tenant');
SELECT public._add_tenant_fk_if_missing('persistent_failure_alerts', 'fk_persistent_failure_alerts_tenant');
SELECT public._add_tenant_fk_if_missing('platform_configs', 'fk_platform_configs_tenant');
SELECT public._add_tenant_fk_if_missing('playbook_actions', 'fk_playbook_actions_tenant');
SELECT public._add_tenant_fk_if_missing('playbooks', 'fk_playbooks_tenant');
SELECT public._add_tenant_fk_if_missing('poe_chain_breaks', 'fk_poe_chain_breaks_tenant');
SELECT public._add_tenant_fk_if_missing('policy_assignments', 'fk_policy_assignments_tenant');
SELECT public._add_tenant_fk_if_missing('policy_enforcement_logs', 'fk_policy_enforcement_logs_tenant');
SELECT public._add_tenant_fk_if_missing('policy_rules', 'fk_policy_rules_tenant');
SELECT public._add_tenant_fk_if_missing('quarantined_files', 'fk_quarantined_files_tenant');
SELECT public._add_tenant_fk_if_missing('red_team_assessments', 'fk_red_team_assessments_tenant');
SELECT public._add_tenant_fk_if_missing('report_executions', 'fk_report_executions_tenant');
SELECT public._add_tenant_fk_if_missing('risk_decision_log', 'fk_risk_decision_log_tenant');
SELECT public._add_tenant_fk_if_missing('risk_delta_snapshots', 'fk_risk_delta_snapshots_tenant');
SELECT public._add_tenant_fk_if_missing('rollback_test_results', 'fk_rollback_test_results_tenant');
SELECT public._add_tenant_fk_if_missing('runbooks', 'fk_runbooks_tenant');
SELECT public._add_tenant_fk_if_missing('sales_contacts', 'fk_sales_contacts_tenant');
SELECT public._add_tenant_fk_if_missing('sales_pipeline', 'fk_sales_pipeline_tenant');
SELECT public._add_tenant_fk_if_missing('scheduled_reports', 'fk_scheduled_reports_tenant');
SELECT public._add_tenant_fk_if_missing('score_governance_log', 'fk_score_governance_log_tenant');
SELECT public._add_tenant_fk_if_missing('security_events', 'fk_security_events_tenant');
SELECT public._add_tenant_fk_if_missing('security_policies', 'fk_security_policies_tenant');
SELECT public._add_tenant_fk_if_missing('security_policy_rules', 'fk_security_policy_rules_tenant');
SELECT public._add_tenant_fk_if_missing('security_reports', 'fk_security_reports_tenant');
SELECT public._add_tenant_fk_if_missing('segregation_rules', 'fk_segregation_rules_tenant');
SELECT public._add_tenant_fk_if_missing('siem_export_configs', 'fk_siem_export_configs_tenant');
SELECT public._add_tenant_fk_if_missing('siem_export_history', 'fk_siem_export_history_tenant');
SELECT public._add_tenant_fk_if_missing('signed_documents', 'fk_signed_documents_tenant');
SELECT public._add_tenant_fk_if_missing('slo_alerts', 'fk_slo_alerts_tenant');
SELECT public._add_tenant_fk_if_missing('slo_measurements', 'fk_slo_measurements_tenant');
SELECT public._add_tenant_fk_if_missing('soar_executions', 'fk_soar_executions_tenant');
SELECT public._add_tenant_fk_if_missing('soar_playbooks', 'fk_soar_playbooks_tenant');
SELECT public._add_tenant_fk_if_missing('soc2_controls', 'fk_soc2_controls_tenant');
SELECT public._add_tenant_fk_if_missing('soc2_criteria', 'fk_soc2_criteria_tenant');
SELECT public._add_tenant_fk_if_missing('subscription_events', 'fk_subscription_events_tenant');
SELECT public._add_tenant_fk_if_missing('system_audits', 'fk_system_audits_tenant');
SELECT public._add_tenant_fk_if_missing('system_kill_switch', 'fk_system_kill_switch_tenant');
SELECT public._add_tenant_fk_if_missing('task_events', 'fk_task_events_tenant');
SELECT public._add_tenant_fk_if_missing('task_evidence', 'fk_task_evidence_tenant');
SELECT public._add_tenant_fk_if_missing('tenant_action_policies', 'fk_tenant_action_policies_tenant');
SELECT public._add_tenant_fk_if_missing('tenant_branding', 'fk_tenant_branding_tenant');
SELECT public._add_tenant_fk_if_missing('tenant_features', 'fk_tenant_features_tenant');
SELECT public._add_tenant_fk_if_missing('tenant_job_quotas', 'fk_tenant_job_quotas_tenant');
SELECT public._add_tenant_fk_if_missing('tenant_risk_scores', 'fk_tenant_risk_scores_tenant');
SELECT public._add_tenant_fk_if_missing('tenant_software_policy', 'fk_tenant_software_policy_tenant');
SELECT public._add_tenant_fk_if_missing('tenant_subscriptions', 'fk_tenant_subscriptions_tenant');
SELECT public._add_tenant_fk_if_missing('tenant_suspension_events', 'fk_tenant_suspension_events_tenant');
SELECT public._add_tenant_fk_if_missing('threat_intelligence_cache', 'fk_threat_intelligence_cache_tenant');
SELECT public._add_tenant_fk_if_missing('url_reputation', 'fk_url_reputation_tenant');
SELECT public._add_tenant_fk_if_missing('vendor_risk_registry', 'fk_vendor_risk_registry_tenant');
SELECT public._add_tenant_fk_if_missing('vuln_findings', 'fk_vuln_findings_tenant');
SELECT public._add_tenant_fk_if_missing('web_access_policies', 'fk_web_access_policies_tenant');
SELECT public._add_tenant_fk_if_missing('webhook_configs', 'fk_webhook_configs_tenant');
SELECT public._add_tenant_fk_if_missing('weekly_security_reports', 'fk_weekly_security_reports_tenant');

-- Cleanup helper
DROP FUNCTION public._add_tenant_fk_if_missing(text, text);

-- V-310: DLQ stale items ? exhausted (no updated_at column)
UPDATE public.failed_jobs_dlq
SET status = 'exhausted', resolved_at = now()
WHERE status = 'pending' AND created_at < now() - interval '48 hours';

-- V-311: Stale open tasks ? cancelled
UPDATE public.tasks
SET status = 'cancelled', updated_at = now()
WHERE status = 'open' AND created_at < now() - interval '48 hours';
