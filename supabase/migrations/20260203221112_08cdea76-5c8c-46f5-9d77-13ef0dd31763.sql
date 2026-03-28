-- ============================================================
-- CORRECAO P0: Crons "Mortos" - Nullmann Audit Fix
-- ============================================================

-- 1. CORRIGIR check_incident_slo_task - Bug de sintaxe no format()
-- PostgreSQL format() nao suporta %.1f, usar %s com concatenacao
CREATE OR REPLACE FUNCTION public.check_incident_slo_task()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slo RECORD;
  v_task_id uuid;
  v_count integer := 0;
  v_tenant_id uuid;
  v_title text;
  v_severity text;
  v_description text;
BEGIN
  FOR v_slo IN 
    SELECT 
      s.*,
      f.normalized_signature,
      f.severity_hint,
      f.failure_class
    FROM incident_slo_state s
    JOIN failure_fingerprints f ON f.id = s.fingerprint_id
    WHERE s.burn_rate_1h >= 2
      AND s.last_task_id IS NULL
  LOOP
    -- Check idempotency - no open task for this fingerprint
    IF NOT EXISTS (
      SELECT 1 FROM tasks 
      WHERE fingerprint_id = v_slo.fingerprint_id
        AND status IN ('open', 'in_progress')
    ) THEN
      -- Get tenant from recent occurrence
      SELECT tenant_id INTO v_tenant_id
      FROM failure_occurrences
      WHERE fingerprint_id = v_slo.fingerprint_id
      ORDER BY occurred_at DESC 
      LIMIT 1;

      IF v_tenant_id IS NOT NULL THEN
        v_severity := CASE 
          WHEN v_slo.burn_rate_1h >= 5 THEN 'critical'
          WHEN v_slo.burn_rate_1h >= 2 THEN 'high'
          ELSE 'medium' 
        END;

        v_title := 'Burn Rate Alto: ' || COALESCE(v_slo.failure_class, 'Incidente');

        -- CORRECAO: Usar concatenacao em vez de format() com %.1f
        v_description := 'Burn Rate 1h: ' || ROUND(v_slo.burn_rate_1h::numeric, 1)::text || 'x | 6h: ' || 
                         ROUND(v_slo.burn_rate_6h::numeric, 1)::text || 'x | Budget: ' || 
                         ROUND(v_slo.budget_consumed::numeric, 0)::text || '% consumido';

        INSERT INTO tasks (
          tenant_id, source_type, fingerprint_id, title, description,
          severity, status, requires_human_review, auto_generated
        ) VALUES (
          v_tenant_id, 'incident_group', v_slo.fingerprint_id, v_title,
          v_description,
          v_severity, 'open', true, true
        ) RETURNING id INTO v_task_id;

        UPDATE incident_slo_state 
        SET last_task_id = v_task_id 
        WHERE fingerprint_id = v_slo.fingerprint_id;

        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION check_incident_slo_task() IS 
'[NULLMANN-FIX] Corrigido bug de sintaxe: PostgreSQL format() nao suporta %.1f';

-- 2. CORRIGIR cleanup_old_data_scheduled - Conflito com trigger de imutabilidade
-- O trigger prevent_execution_modification bloqueia UPDATE em job_executions finalizadas
-- Solucao: Usar UPDATE apenas em execucoes que ainda nao foram finalizadas,
-- e para as finalizadas, fazer DELETE direto (respeitando o periodo de 30 dias)
CREATE OR REPLACE FUNCTION public.cleanup_old_data_scheduled()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hmac_deleted INTEGER := 0;
  v_rate_limits_deleted INTEGER := 0;
  v_failed_logins_deleted INTEGER := 0;
  v_efm_deleted INTEGER := 0;
  v_executions_deleted INTEGER := 0;
  v_old_jobs_deleted INTEGER := 0;
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
  
  -- CORRECAO: Em vez de UPDATE (bloqueado pelo trigger), fazer DELETE direto
  -- O trigger prevent_execution_deletion permite DELETE apos 30 dias da criacao
  -- Deletar job_executions de jobs antigos (>60 dias para margem de seguranca)
  WITH old_executions AS (
    SELECT je.id 
    FROM job_executions je
    INNER JOIN jobs j ON j.id = je.job_id
    WHERE j.status IN ('completed', 'failed')
      AND j.created_at < now() - interval '60 days'
      AND je.finished_at IS NOT NULL  -- Apenas execucoes finalizadas
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
      AND NOT EXISTS (
        SELECT 1 FROM job_executions je 
        WHERE je.job_id = j.id
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
    'job_executions_deleted', v_executions_deleted,
    'old_jobs_deleted', v_old_jobs_deleted,
    'executed_at', now()
  );
END;
$function$;

COMMENT ON FUNCTION cleanup_old_data_scheduled() IS 
'[NULLMANN-FIX] Corrigido conflito com trigger de imutabilidade: usa DELETE em vez de UPDATE';