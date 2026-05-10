GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_session_start(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_mode() TO authenticated;
GRANT SELECT ON public.tenants_safe TO authenticated;