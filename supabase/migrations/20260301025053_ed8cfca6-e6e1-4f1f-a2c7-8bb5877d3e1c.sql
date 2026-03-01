
-- V-303 FIX: Revogar de public E anon para garantir
REVOKE EXECUTE ON FUNCTION public.alert_long_offline_agents() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.auto_cleanup_stale_operations() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_rls_test_results() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.create_default_software_policy() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_truncate() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.provision_tenant_baseline_features() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.soar_evaluate_alert() FROM public, anon;

-- finalize_job_execution - revoke all 3 overloads from public+anon
REVOKE EXECUTE ON FUNCTION public.finalize_job_execution(uuid, uuid, text, integer, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.finalize_job_execution(uuid, uuid, text, integer, jsonb, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.finalize_job_execution(uuid, uuid, uuid, text, timestamptz, timestamptz, text, text, numeric, text, boolean, text, text, bigint) FROM public, anon;

-- Re-grant to authenticated and service_role (needed for normal operation)
GRANT EXECUTE ON FUNCTION public.alert_long_offline_agents() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_cleanup_stale_operations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_rls_test_results() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_default_software_policy() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevent_truncate() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provision_tenant_baseline_features() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soar_evaluate_alert() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_job_execution(uuid, uuid, text, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_job_execution(uuid, uuid, text, integer, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_job_execution(uuid, uuid, uuid, text, timestamptz, timestamptz, text, text, numeric, text, boolean, text, text, bigint) TO authenticated, service_role;
