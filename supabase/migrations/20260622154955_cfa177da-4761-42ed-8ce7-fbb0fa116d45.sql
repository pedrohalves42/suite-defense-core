-- S-P0.3 Fase B: Revoga EXECUTE de 'anon' em RPCs SECURITY DEFINER sem caso de uso público.
-- Mantém 'authenticated' e 'service_role' intactos.

REVOKE EXECUTE ON FUNCTION public.check_tenant_suspension(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_agents_list(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_agents_list(uuid, boolean, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_agents_snapshots_list(uuid) FROM anon;