-- Revoke execute from public/anon
REVOKE EXECUTE ON FUNCTION public.update_agent_heartbeat_atomic(uuid, jsonb) FROM public;
REVOKE EXECUTE ON FUNCTION public.update_agent_heartbeat_atomic(uuid, jsonb) FROM anon;

-- Grant to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.update_agent_heartbeat_atomic(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agent_heartbeat_atomic(uuid, jsonb) TO service_role;