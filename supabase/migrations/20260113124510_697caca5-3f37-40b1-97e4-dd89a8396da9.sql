
-- Corrigir search_path das funcoes criadas
ALTER FUNCTION public.auto_create_tenant_settings() 
SET search_path = public;

ALTER FUNCTION public.execute_with_timeout(TEXT, INTEGER) 
SET search_path = public;
