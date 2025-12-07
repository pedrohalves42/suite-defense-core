-- SCALE-01: Função de retenção agressiva de métricas (7 dias)
-- Reduz crescimento de agent_system_metrics de ~1.4M/dia para ~100K

CREATE OR REPLACE FUNCTION public.cleanup_old_metrics_aggressive()
RETURNS TABLE(deleted_count bigint, oldest_remaining timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted_count BIGINT;
  v_oldest_remaining TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Deletar métricas com mais de 7 dias (em vez de 30)
  DELETE FROM public.agent_system_metrics
  WHERE collected_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  -- Buscar timestamp da métrica mais antiga restante
  SELECT MIN(collected_at) INTO v_oldest_remaining
  FROM public.agent_system_metrics;
  
  RAISE NOTICE 'Aggressive metrics cleanup: % rows deleted, oldest remaining: %', 
    v_deleted_count, v_oldest_remaining;
  
  RETURN QUERY SELECT v_deleted_count, v_oldest_remaining;
END;
$function$;

-- Função de cleanup de rate_limits otimizada (30 min já implementado)
-- Garantir que existe e está atualizada
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

-- Função de cleanup de HMAC signatures (5 min)
CREATE OR REPLACE FUNCTION public.cleanup_old_hmac_signatures()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.hmac_signatures
  WHERE used_at < now() - INTERVAL '5 minutes';
END;
$function$;

-- Criar índice para acelerar cleanup de métricas se não existir
CREATE INDEX IF NOT EXISTS idx_agent_system_metrics_collected_at 
ON public.agent_system_metrics(collected_at);

-- Criar índice para acelerar cleanup de rate_limits se não existir
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start 
ON public.rate_limits(window_start);

-- Criar índice para acelerar cleanup de hmac_signatures se não existir
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_used_at 
ON public.hmac_signatures(used_at);

-- NOTA: pg_cron deve ser configurado via Supabase Dashboard ou SQL direto
-- As seguintes queries devem ser executadas manualmente no SQL Editor do Supabase:
--
-- 1. Cleanup diário de métricas às 03:00 UTC:
-- SELECT cron.schedule('cleanup-metrics-daily', '0 3 * * *', 'SELECT public.cleanup_old_metrics_aggressive()');
--
-- 2. Cleanup de rate_limits a cada 5 minutos:
-- SELECT cron.schedule('cleanup-rate-limits', '*/5 * * * *', 'SELECT public.cleanup_old_rate_limits()');
--
-- 3. Cleanup de HMAC signatures a cada 5 minutos:
-- SELECT cron.schedule('cleanup-hmac-signatures', '*/5 * * * *', 'SELECT public.cleanup_old_hmac_signatures()');

COMMENT ON FUNCTION public.cleanup_old_metrics_aggressive() IS 
'Aggressive cleanup: removes metrics older than 7 days. Should be scheduled via pg_cron daily at 03:00 UTC.';