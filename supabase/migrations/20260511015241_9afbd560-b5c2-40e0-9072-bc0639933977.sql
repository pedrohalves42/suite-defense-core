-- Grant execute permissions on critical dashboard functions
GRANT EXECUTE ON FUNCTION public.get_agents_list(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_agents_snapshots_list(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_evidence_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_vulnerability_counts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_active_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._assert_caller_tenant(uuid) TO authenticated, service_role;

-- Also grant on some other common dashboard functions
GRANT EXECUTE ON FUNCTION public.get_system_mode() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_current_super_admin() TO authenticated, service_role;
