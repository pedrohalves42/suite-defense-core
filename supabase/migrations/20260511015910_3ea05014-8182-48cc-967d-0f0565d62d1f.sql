-- Fix: Grant execute on update_session_activity with correct signature
GRANT EXECUTE ON FUNCTION public.update_session_activity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_activity(uuid) TO service_role;

-- Also ensure get_session_timeout_minutes is accessible
GRANT EXECUTE ON FUNCTION public.get_session_timeout_minutes(text) TO authenticated;
