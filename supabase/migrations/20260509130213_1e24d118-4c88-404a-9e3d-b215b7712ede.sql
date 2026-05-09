ALTER FUNCTION public.update_agent_heartbeat_atomic(UUID, JSONB) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.update_agent_heartbeat_atomic(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_agent_heartbeat_atomic(UUID, JSONB) TO service_role;