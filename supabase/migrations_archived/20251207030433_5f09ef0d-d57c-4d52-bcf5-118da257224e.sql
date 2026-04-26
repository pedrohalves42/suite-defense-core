-- P0 SEC-02: Move pg_net extension to extensions schema (if it exists in public)
DO $$
BEGIN
  -- Check if pg_net exists in public schema and move it
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net' 
    AND extnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    ALTER EXTENSION pg_net SET SCHEMA extensions;
    RAISE NOTICE 'pg_net extension moved to extensions schema';
  ELSE
    RAISE NOTICE 'pg_net extension not in public schema or does not exist';
  END IF;
END $$;

-- P1 SCALE-01: Optimize rate_limits cleanup - reduce retention from 1 hour to 30 minutes
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Reduced from 1 hour to 30 minutes for better performance at scale
  DELETE FROM public.rate_limits
  WHERE window_start < now() - INTERVAL '30 minutes';
END;
$function$;

-- Also update the main cleanup function to use 30 minutes for rate_limits
CREATE OR REPLACE FUNCTION public.cleanup_old_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Limpar rate_limits antigos (30min instead of 1h for better scale)
  DELETE FROM public.rate_limits
  WHERE window_start < NOW() - INTERVAL '30 minutes';
  
  -- Limpar hmac_signatures antigos (>5min)
  DELETE FROM public.hmac_signatures
  WHERE used_at < NOW() - INTERVAL '5 minutes';
  
  -- Limpar failed_login_attempts antigos (>24h)
  DELETE FROM public.failed_login_attempts
  WHERE created_at < NOW() - INTERVAL '24 hours';
  
  -- Limpar ip_blocklist expirados
  DELETE FROM public.ip_blocklist
  WHERE blocked_until < NOW();
  
  -- Limpar metricas antigas (>30 dias)
  DELETE FROM public.agent_system_metrics
  WHERE collected_at < NOW() - INTERVAL '30 days';
  
  -- Limpar security_logs antigos (>90 dias)
  DELETE FROM public.security_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  RAISE NOTICE 'Limpeza de dados antigos concluida em %', NOW();
END;
$function$;