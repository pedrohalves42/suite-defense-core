
-- ============================================================================
-- FIX: Adicionar report de saude para crons que executam funcoes SQL
-- ADR-FINAL-001: Fechar ciclo de observabilidade de crons
-- ============================================================================

-- Atualizar cleanup_old_data_scheduled para reportar sucesso
CREATE OR REPLACE FUNCTION public.cleanup_old_data_scheduled()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hmac_deleted INTEGER := 0;
  v_rate_limits_deleted INTEGER := 0;
  v_failed_logins_deleted INTEGER := 0;
  v_efm_deleted INTEGER := 0;
  v_executions_deleted INTEGER := 0;
  v_old_jobs_deleted INTEGER := 0;
  v_result jsonb;
BEGIN
  -- Limpeza de dados temporarios (nao-imutaveis)
  DELETE FROM public.hmac_signatures WHERE used_at < now() - interval '6 hours';
  GET DIAGNOSTICS v_hmac_deleted = ROW_COUNT;
  
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '30 minutes';
  GET DIAGNOSTICS v_rate_limits_deleted = ROW_COUNT;
  
  DELETE FROM public.failed_login_attempts WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_failed_logins_deleted = ROW_COUNT;
  
  DELETE FROM public.edge_function_metrics WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_efm_deleted = ROW_COUNT;
  
  -- Deletar job_executions antigas (>60 dias)
  WITH old_executions AS (
    SELECT je.id 
    FROM job_executions je
    INNER JOIN jobs j ON j.id = je.job_id
    WHERE j.status IN ('completed', 'failed')
      AND j.created_at < now() - interval '60 days'
      AND je.finished_at IS NOT NULL
    LIMIT 500
  )
  DELETE FROM job_executions
  USING old_executions oe
  WHERE job_executions.id = oe.id;
  GET DIAGNOSTICS v_executions_deleted = ROW_COUNT;
  
  -- Deletar jobs orfaos (sem execucoes) apos 60 dias
  WITH deletable_jobs AS (
    SELECT j.id 
    FROM public.jobs j
    WHERE j.status IN ('completed', 'failed')
      AND j.created_at < now() - interval '60 days'
      AND NOT EXISTS (SELECT 1 FROM job_executions je WHERE je.job_id = j.id)
    LIMIT 500
  )
  DELETE FROM public.jobs
  USING deletable_jobs dj
  WHERE jobs.id = dj.id;
  GET DIAGNOSTICS v_old_jobs_deleted = ROW_COUNT;
  
  v_result := jsonb_build_object(
    'success', true,
    'hmac_deleted', v_hmac_deleted,
    'rate_limits_deleted', v_rate_limits_deleted,
    'failed_logins_deleted', v_failed_logins_deleted,
    'edge_function_metrics_deleted', v_efm_deleted,
    'job_executions_deleted', v_executions_deleted,
    'old_jobs_deleted', v_old_jobs_deleted,
    'executed_at', now()
  );
  
  -- Reportar sucesso para cron_health_checks
  INSERT INTO public.cron_health_checks (cron_name, last_success_at, consecutive_failures, updated_at)
  VALUES ('cleanup-old-data-hourly', now(), 0, now())
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = now(),
    consecutive_failures = 0,
    last_error = NULL,
    updated_at = now();
  
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  -- Reportar falha
  INSERT INTO public.cron_health_checks (cron_name, last_failure_at, last_error, consecutive_failures, updated_at)
  VALUES ('cleanup-old-data-hourly', now(), SQLERRM, 1, now())
  ON CONFLICT (cron_name) DO UPDATE SET
    last_failure_at = now(),
    last_error = SQLERRM,
    consecutive_failures = cron_health_checks.consecutive_failures + 1,
    updated_at = now();
  RAISE;
END;
$$;

-- Comentario para auditoria
COMMENT ON FUNCTION cleanup_old_data_scheduled IS 
'ADR-FINAL-001: Funcao de limpeza com report automatico para cron_health_checks.
Corrigido em 2026-02-07 para fechar ciclo de observabilidade.';
