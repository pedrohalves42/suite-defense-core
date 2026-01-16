-- =============================================================================
-- ADR-026: Update Views to use get_active_tenant_id() - Part 1/3
-- Drop existing views then recreate with new pattern
-- =============================================================================

-- Drop all 36 views that need updating
DROP VIEW IF EXISTS public.v_tenant_plan_status CASCADE;
DROP VIEW IF EXISTS public.v_task_stats CASCADE;
DROP VIEW IF EXISTS public.v_system_operations_summary CASCADE;
DROP VIEW IF EXISTS public.v_stuck_jobs_report CASCADE;
DROP VIEW IF EXISTS public.v_soc2_readiness CASCADE;
DROP VIEW IF EXISTS public.v_rbac_metrics CASCADE;
DROP VIEW IF EXISTS public.v_problematic_jobs CASCADE;
DROP VIEW IF EXISTS public.v_problematic_agents CASCADE;
DROP VIEW IF EXISTS public.v_job_hourly_trends CASCADE;
DROP VIEW IF EXISTS public.v_governance_stats CASCADE;
DROP VIEW IF EXISTS public.v_execution_chain_health CASCADE;
DROP VIEW IF EXISTS public.v_enforcement_compliance CASCADE;
DROP VIEW IF EXISTS public.v_edge_function_stats CASCADE;
DROP VIEW IF EXISTS public.v_dlq_pending_attention CASCADE;
DROP VIEW IF EXISTS public.v_cron_silent_failures CASCADE;
DROP VIEW IF EXISTS public.v_audit_moving_average CASCADE;
DROP VIEW IF EXISTS public.v_audit_integrity_status CASCADE;
DROP VIEW IF EXISTS public.v_ai_anomalies CASCADE;
DROP VIEW IF EXISTS public.v_agent_lifecycle_state CASCADE;
DROP VIEW IF EXISTS public.v_agent_health_summary CASCADE;
DROP VIEW IF EXISTS public.v_agent_health_by_node CASCADE;
DROP VIEW IF EXISTS public.v_action_center CASCADE;
DROP VIEW IF EXISTS public.jobs_normalized CASCADE;
DROP VIEW IF EXISTS public.job_integrity_violations CASCADE;
DROP VIEW IF EXISTS public.job_failure_health CASCADE;
DROP VIEW IF EXISTS public.installation_metrics_summary CASCADE;
DROP VIEW IF EXISTS public.installation_health_status CASCADE;
DROP VIEW IF EXISTS public.installation_error_summary CASCADE;
DROP VIEW IF EXISTS public.enrollment_keys_safe CASCADE;
DROP VIEW IF EXISTS public.circuit_breaker_health CASCADE;
DROP VIEW IF EXISTS public.agents_safe CASCADE;
DROP VIEW IF EXISTS public.agents_public CASCADE;
DROP VIEW IF EXISTS public.agents_health_view CASCADE;
DROP VIEW IF EXISTS public.agent_timeline_events CASCADE;
DROP VIEW IF EXISTS public.agent_system_metrics_unified CASCADE;
DROP VIEW IF EXISTS public.agent_installation_metrics CASCADE;