
-- 1. Limpeza imediata: finalizar zombie executions cujo job já está em estado terminal
UPDATE job_executions
SET 
  status = 'failed',
  finished_at = now(),
  error_message = '[CLEANUP] Orphaned execution - parent job already finalized'
WHERE status = 'running'
  AND job_id IN (
    SELECT id FROM jobs WHERE status IN ('failed', 'completed', 'cancelled')
  );

-- 2. Criar RPC reutilizável para limpeza contínua
CREATE OR REPLACE FUNCTION public.cleanup_zombie_executions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orphaned integer := 0;
  v_stale integer := 0;
BEGIN
  -- Parte 1: Execuções órfãs (job já finalizado)
  WITH cleaned AS (
    UPDATE job_executions
    SET 
      status = 'failed',
      finished_at = now(),
      error_message = '[CLEANUP] Orphaned execution - parent job already finalized'
    WHERE status = 'running'
      AND job_id IN (
        SELECT id FROM jobs WHERE status IN ('failed', 'completed', 'cancelled')
      )
    RETURNING id
  )
  SELECT count(*) INTO v_orphaned FROM cleaned;

  -- Parte 2: Execuções running há mais de 4h (stale, mesmo se job ainda não finalizou)
  WITH stale AS (
    UPDATE job_executions
    SET 
      status = 'failed',
      finished_at = now(),
      error_message = '[CLEANUP] Execution running > 4h without result'
    WHERE status = 'running'
      AND started_at < now() - interval '4 hours'
    RETURNING id
  )
  SELECT count(*) INTO v_stale FROM stale;

  RETURN jsonb_build_object(
    'orphaned_cleaned', v_orphaned,
    'stale_cleaned', v_stale,
    'total', v_orphaned + v_stale,
    'cleaned_at', now()
  );
END;
$$;

COMMENT ON FUNCTION cleanup_zombie_executions() IS 'Limpa job_executions órfãs (running cujo job já finalizou) e stale (running > 4h)';
