-- ============================================================
-- MIGRACAO: Correcao dos 3 Problemas Criticos Restantes
-- ============================================================

-- 1. Corrigir cleanup_old_data_scheduled (arquivar antes de deletar)
CREATE OR REPLACE FUNCTION cleanup_old_data_scheduled()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_hmac_deleted INTEGER := 0;
  v_rate_limits_deleted INTEGER := 0;
  v_failed_logins_deleted INTEGER := 0;
  v_efm_deleted INTEGER := 0;
  v_executions_archived INTEGER := 0;
  v_old_jobs_deleted INTEGER := 0;
BEGIN
  DELETE FROM public.hmac_signatures WHERE used_at < now() - interval '6 hours';
  GET DIAGNOSTICS v_hmac_deleted = ROW_COUNT;
  
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '30 minutes';
  GET DIAGNOSTICS v_rate_limits_deleted = ROW_COUNT;
  
  DELETE FROM public.failed_login_attempts WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_failed_logins_deleted = ROW_COUNT;
  
  DELETE FROM public.edge_function_metrics WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_efm_deleted = ROW_COUNT;
  
  -- ETAPA 1: Arquivar job_executions de jobs antigos (>30 dias)
  WITH old_jobs AS (
    SELECT id FROM public.jobs
    WHERE status IN ('completed', 'failed')
      AND created_at < now() - interval '30 days'
    LIMIT 1000
  ),
  executions_to_archive AS (
    SELECT je.id FROM job_executions je
    INNER JOIN old_jobs oj ON je.job_id = oj.id
    WHERE je.archived_at IS NULL
    LIMIT 1000
  )
  UPDATE job_executions
  SET archived_at = NOW()
  FROM executions_to_archive eta
  WHERE job_executions.id = eta.id;
  
  GET DIAGNOSTICS v_executions_archived = ROW_COUNT;
  
  -- ETAPA 2: Deletar jobs apenas se TODAS as execucoes ja foram arquivadas ha 30+ dias
  WITH deletable_jobs AS (
    SELECT j.id 
    FROM public.jobs j
    WHERE j.status IN ('completed', 'failed')
      AND j.created_at < now() - interval '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM job_executions je 
        WHERE je.job_id = j.id AND je.archived_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM job_executions je 
        WHERE je.job_id = j.id AND je.archived_at > NOW() - INTERVAL '30 days'
      )
    LIMIT 500
  )
  DELETE FROM public.jobs
  USING deletable_jobs dj
  WHERE jobs.id = dj.id;
  
  GET DIAGNOSTICS v_old_jobs_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'hmac_deleted', v_hmac_deleted,
    'rate_limits_deleted', v_rate_limits_deleted,
    'failed_logins_deleted', v_failed_logins_deleted,
    'edge_function_metrics_deleted', v_efm_deleted,
    'job_executions_archived', v_executions_archived,
    'old_jobs_deleted', v_old_jobs_deleted,
    'executed_at', now()
  );
END;
$$;

COMMENT ON FUNCTION cleanup_old_data_scheduled IS 
'Limpa dados antigos. Arquiva job_executions ANTES de deletar jobs para respeitar trigger de imutabilidade.';

-- 2. Criar RPC para verificar politicas (usado por run-rls-tests)
CREATE OR REPLACE FUNCTION count_policies_for_table(p_table_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = p_table_name;
  
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION count_policies_for_table IS 
'Retorna numero de politicas RLS para uma tabela. Usado por run-rls-tests.';

-- 3. Resetar falhas do RLS tests
UPDATE cron_health_checks
SET consecutive_failures = 0,
    last_error = NULL,
    updated_at = NOW()
WHERE cron_name = 'rls-automated-tests-6h';