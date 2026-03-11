
-- V-805: Make tenant_id NOT NULL on tables with 0 NULL rows
ALTER TABLE public.active_sessions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.agent_archive_events ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.failed_jobs_dlq ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.failed_login_attempts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.notification_deliveries ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.security_logs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.system_audits ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.slo_alerts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.slo_measurements ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.onboarding_progress ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.agent_group_policies ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.agent_tag_assignments ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.agent_updates ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.agents_groups ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.agent_execution_chain ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.agent_hmac_format_cache ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.circuit_breaker_events ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.edge_function_metrics ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.governance_adrs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.custom_trials ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.signed_documents ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.sales_contacts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.sales_pipeline ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.marketing_costs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.threat_intelligence_cache ALTER COLUMN tenant_id SET NOT NULL;
