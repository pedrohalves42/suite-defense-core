-- 1. Restringir execução de funções administrativas
REVOKE EXECUTE ON FUNCTION public.increment_enrollment_key_usage(UUID, TEXT) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.enroll_agent_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE) FROM PUBLIC, authenticated;

-- Garantir que apenas o service_role e postgres possam executar
GRANT EXECUTE ON FUNCTION public.increment_enrollment_key_usage(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.enroll_agent_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE) TO service_role;
