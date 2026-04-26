-- FASE 4: Cleanup automatico de jobs stuck (delivered >1h)

-- Criar funcao para cleanup de jobs stuck
CREATE OR REPLACE FUNCTION cleanup_stuck_jobs()
RETURNS TABLE(cleaned_count INTEGER, job_ids UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleaned_count INTEGER;
  v_job_ids UUID[];
BEGIN
  -- Marcar jobs "delivered" ha mais de 1 hora como "failed"
  WITH updated_jobs AS (
    UPDATE jobs
    SET 
      status = 'failed',
      error_message = 'Job timeout: exceeded 1 hour in delivered state (auto-cleanup)',
      completed_at = NOW()
    WHERE status = 'delivered'
      AND delivered_at < NOW() - INTERVAL '1 hour'
    RETURNING id
  )
  SELECT 
    COUNT(*)::INTEGER,
    ARRAY_AGG(id)
  INTO v_cleaned_count, v_job_ids
  FROM updated_jobs;
  
  -- Log da operacao
  IF v_cleaned_count > 0 THEN
    RAISE NOTICE 'Cleanup concluido: % jobs marcados como failed', v_cleaned_count;
  END IF;
  
  RETURN QUERY SELECT 
    COALESCE(v_cleaned_count, 0),
    COALESCE(v_job_ids, ARRAY[]::UUID[]);
END;
$$;

COMMENT ON FUNCTION cleanup_stuck_jobs() IS 'Marca jobs em estado delivered ha mais de 1 hora como failed (v3.5.0-METRICS-AUTO)';