GRANT EXECUTE ON FUNCTION public.update_session_activity(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_session_activity(uuid) FROM anon, public;