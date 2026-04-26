-- Convert SECURITY DEFINER views to SECURITY INVOKER
-- This ensures views respect RLS policies of the querying user

-- agent_installation_metrics view
ALTER VIEW public.agent_installation_metrics SET (security_invoker = true);

-- agent_releases_public view
ALTER VIEW public.agent_releases_public SET (security_invoker = true);

-- agent_system_metrics_unified view
ALTER VIEW public.agent_system_metrics_unified SET (security_invoker = true);

-- agent_timeline_events view
ALTER VIEW public.agent_timeline_events SET (security_invoker = true);

-- agents_safe view
ALTER VIEW public.agents_safe SET (security_invoker = true);

-- audit_logs_safe view
ALTER VIEW public.audit_logs_safe SET (security_invoker = true);

-- enrollment_keys_safe view
ALTER VIEW public.enrollment_keys_safe SET (security_invoker = true);

-- hmac_signatures view
ALTER VIEW public.hmac_signatures SET (security_invoker = true);

-- installation_error_summary view
ALTER VIEW public.installation_error_summary SET (security_invoker = true);

-- installation_health_status view
ALTER VIEW public.installation_health_status SET (security_invoker = true);

-- installation_metrics_summary view
ALTER VIEW public.installation_metrics_summary SET (security_invoker = true);

-- job_integrity_violations view
ALTER VIEW public.job_integrity_violations SET (security_invoker = true);

-- jobs_normalized view
ALTER VIEW public.jobs_normalized SET (security_invoker = true);

-- rate_limit_stats view
ALTER VIEW public.rate_limit_stats SET (security_invoker = true);

-- v_agent_health_summary view
ALTER VIEW public.v_agent_health_summary SET (security_invoker = true);

-- v_agent_lifecycle_state view
ALTER VIEW public.v_agent_lifecycle_state SET (security_invoker = true);

-- v_confidence_gap_trend view
ALTER VIEW public.v_confidence_gap_trend SET (security_invoker = true);

-- v_edge_function_stats view
ALTER VIEW public.v_edge_function_stats SET (security_invoker = true);

-- v_execution_chain_health view
ALTER VIEW public.v_execution_chain_health SET (security_invoker = true);

-- v_integrity_score view
ALTER VIEW public.v_integrity_score SET (security_invoker = true);

-- v_jobs_status_corrected view
ALTER VIEW public.v_jobs_status_corrected SET (security_invoker = true);

-- v_pipeline_health_metrics view
ALTER VIEW public.v_pipeline_health_metrics SET (security_invoker = true);

-- v_problematic_agents view
ALTER VIEW public.v_problematic_agents SET (security_invoker = true);

-- v_problematic_jobs view
ALTER VIEW public.v_problematic_jobs SET (security_invoker = true);

-- v_soc2_readiness view
ALTER VIEW public.v_soc2_readiness SET (security_invoker = true);

-- v_stuck_jobs_report view
ALTER VIEW public.v_stuck_jobs_report SET (security_invoker = true);

-- v_system_operations_summary view
ALTER VIEW public.v_system_operations_summary SET (security_invoker = true);

-- v_tenant_plan_status view
ALTER VIEW public.v_tenant_plan_status SET (security_invoker = true);