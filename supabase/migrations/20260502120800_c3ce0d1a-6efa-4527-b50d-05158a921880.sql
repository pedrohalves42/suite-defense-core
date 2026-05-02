-- Fix function security and search path
ALTER FUNCTION public.get_tenant_abuse_metrics(INTEGER, INTEGER, FLOAT, INTERVAL) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_tenant_abuse_metrics(INTEGER, INTEGER, FLOAT, INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_abuse_metrics(INTEGER, INTEGER, FLOAT, INTERVAL) TO service_role;