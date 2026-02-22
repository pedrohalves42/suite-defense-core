
-- =====================================================
-- SSA-SEC-010: Add security_barrier=true to all views
-- that already have security_invoker=on but are missing
-- security_barrier, preventing query optimization leaks.
-- REF: ADR-037, memory/security/ssa-sec-hardening-standards-consolidated
-- =====================================================

ALTER VIEW public.active_agents SET (security_barrier = true);
ALTER VIEW public.agent_installation_metrics SET (security_barrier = true);
ALTER VIEW public.agent_releases_public SET (security_barrier = true);
ALTER VIEW public.circuit_breaker_health SET (security_barrier = true);
ALTER VIEW public.installation_error_summary SET (security_barrier = true);
ALTER VIEW public.installation_health_status SET (security_barrier = true);
ALTER VIEW public.installation_metrics_summary SET (security_barrier = true);
ALTER VIEW public.job_failure_health SET (security_barrier = true);
ALTER VIEW public.job_integrity_violations SET (security_barrier = true);
ALTER VIEW public.rate_limit_stats SET (security_barrier = true);
ALTER VIEW public.v_active_risk_debt SET (security_barrier = true);
ALTER VIEW public.v_agent_archive_reason_tree SET (security_barrier = true);
ALTER VIEW public.v_ai_anomalies SET (security_barrier = true);
ALTER VIEW public.v_anomalies_without_runbook SET (security_barrier = true);
ALTER VIEW public.v_audit_integrity_status SET (security_barrier = true);
ALTER VIEW public.v_audit_moving_average SET (security_barrier = true);
ALTER VIEW public.v_confidence_gap_trend SET (security_barrier = true);
ALTER VIEW public.v_critical_unassigned_tasks SET (security_barrier = true);
ALTER VIEW public.v_cron_silence SET (security_barrier = true);
ALTER VIEW public.v_cron_silent_failures SET (security_barrier = true);
ALTER VIEW public.v_edge_function_stats SET (security_barrier = true);
ALTER VIEW public.v_enforcement_compliance SET (security_barrier = true);
ALTER VIEW public.v_execution_chain_health SET (security_barrier = true);
ALTER VIEW public.v_incident_groups SET (security_barrier = true);
ALTER VIEW public.v_incident_groups_with_slo SET (security_barrier = true);
ALTER VIEW public.v_integrity_score SET (security_barrier = true);
ALTER VIEW public.v_job_execution_health SET (security_barrier = true);
ALTER VIEW public.v_job_health SET (security_barrier = true);
ALTER VIEW public.v_job_health_anomalies SET (security_barrier = true);
ALTER VIEW public.v_job_hourly_trends SET (security_barrier = true);
ALTER VIEW public.v_job_metrics_by_type SET (security_barrier = true);
ALTER VIEW public.v_jobs_status_corrected SET (security_barrier = true);
ALTER VIEW public.v_risk_debt_active SET (security_barrier = true);
ALTER VIEW public.v_risk_debt_summary SET (security_barrier = true);
ALTER VIEW public.v_rls_continuous_check SET (security_barrier = true);
ALTER VIEW public.v_rls_security_status SET (security_barrier = true);
ALTER VIEW public.v_security_dashboard SET (security_barrier = true);
ALTER VIEW public.v_system_contracts SET (security_barrier = true);
ALTER VIEW public.v_system_cycle_health SET (security_barrier = true);
ALTER VIEW public.v_system_operations_summary SET (security_barrier = true);
ALTER VIEW public.v_task_stats SET (security_barrier = true);
ALTER VIEW public.v_tasks_requiring_closure SET (security_barrier = true);
ALTER VIEW public.v_tenant_claim_health SET (security_barrier = true);
ALTER VIEW public.v_tenant_isolation_metrics SET (security_barrier = true);
ALTER VIEW public.v_tenant_plan_status SET (security_barrier = true);
ALTER VIEW public.v_zero_gap_dashboard SET (security_barrier = true);
