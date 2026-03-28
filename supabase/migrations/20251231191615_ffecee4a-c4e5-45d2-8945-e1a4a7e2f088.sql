-- =====================================================
-- Retry Inteligente + DLQ Real + Auto-Execute Seguro
-- Classificacao de falhas, retry seletivo, auditoria
-- =====================================================

-- FASE 1: Adicionar failure_class na tabela jobs
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS failure_class TEXT
CHECK (failure_class IN (
  'AGENT_OFFLINE',
  'AGENT_STALLED', 
  'AGENT_INCOMPATIBLE',
  'EXPECTED_DROP',
  'CASCADE_FAILURE',
  'TRANSIENT',
  'BUG',
  'POLICY',
  'SECURITY'
));

-- FASE 2: Adicionar risk_level na tabela ai_actions
ALTER TABLE ai_actions
ADD COLUMN IF NOT EXISTS risk_level TEXT
DEFAULT 'medium'
CHECK (risk_level IN ('low', 'medium', 'high'));

-- FASE 3: Indice para queries de falha
CREATE INDEX IF NOT EXISTS idx_jobs_failure_class 
ON jobs (failure_class) WHERE status = 'failed';

-- FASE 4: Funcao de classificacao automatica de falhas
CREATE OR REPLACE FUNCTION classify_job_failure(p_error_message TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  IF p_error_message IS NULL THEN
    RETURN 'BUG';
  END IF;
  
  -- AGENT_OFFLINE: agente nao busca jobs
  IF p_error_message ILIKE '%queued%hour%' 
     OR p_error_message ILIKE '%auto-cancel%offline%'
     OR p_error_message ILIKE '%agent offline%' THEN
    RETURN 'AGENT_OFFLINE';
  END IF;
  
  -- AGENT_STALLED: agente buscou mas nao completou
  IF p_error_message ILIKE '%delivered state%'
     OR p_error_message ILIKE '%zombie%'
     OR p_error_message ILIKE '%delivered%timeout%'
     OR p_error_message ILIKE '%Job timeout%exceeded%' THEN
    RETURN 'AGENT_STALLED';
  END IF;
  
  -- AGENT_INCOMPATIBLE: versao antiga
  IF p_error_message ILIKE '%version%old%' THEN
    RETURN 'AGENT_INCOMPATIBLE';
  END IF;
  
  -- EXPECTED_DROP: limpeza de quota (nao e erro)
  IF p_error_message ILIKE '%quota%cleanup%'
     OR p_error_message ILIKE '%obsoleto%' THEN
    RETURN 'EXPECTED_DROP';
  END IF;
  
  -- CASCADE_FAILURE: falha em cadeia
  IF p_error_message ILIKE '%parent job%'
     OR p_error_message ILIKE '%job pai%' THEN
    RETURN 'CASCADE_FAILURE';
  END IF;
  
  -- TRANSIENT: pode melhorar com retry
  IF p_error_message ILIKE '%timeout%'
     AND p_error_message NOT ILIKE '%hour%'
     AND p_error_message NOT ILIKE '%exceeded%' THEN
    RETURN 'TRANSIENT';
  END IF;
  
  -- POLICY: bloqueio por politica
  IF p_error_message ILIKE '%safe mode%'
     OR p_error_message ILIKE '%SAFE_MODE%'
     OR p_error_message ILIKE '%policy%' THEN
    RETURN 'POLICY';
  END IF;
  
  -- Default: BUG (precisa investigar)
  RETURN 'BUG';
END;
$$;

-- FASE 5: Trigger de classificacao automatica
CREATE OR REPLACE FUNCTION auto_classify_job_failure()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'failed' AND NEW.failure_class IS NULL THEN
    NEW.failure_class := classify_job_failure(NEW.error_message);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_classify_failure ON jobs;
CREATE TRIGGER trg_auto_classify_failure
BEFORE UPDATE ON jobs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'failed')
EXECUTE FUNCTION auto_classify_job_failure();

-- FASE 6: Backfill de classificacao existente
UPDATE jobs
SET failure_class = classify_job_failure(error_message)
WHERE status = 'failed'
  AND failure_class IS NULL
  AND created_at >= now() - interval '30 days';

-- FASE 7: Adicionar failure_class na DLQ existente
ALTER TABLE failed_jobs_dlq
ADD COLUMN IF NOT EXISTS failure_class TEXT;

-- FASE 8: View de saude do pipeline
CREATE OR REPLACE VIEW job_failure_health AS
SELECT
  failure_class,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '24h') AS last_24h,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS last_7d,
  CASE 
    WHEN failure_class IN ('TRANSIENT') THEN true
    ELSE false
  END AS is_retryable
FROM jobs
WHERE status = 'failed'
GROUP BY failure_class;

-- FASE 9: Atualizar funcao de metricas de auditoria
CREATE OR REPLACE FUNCTION get_audit_raw_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'audit_logs_with_hash', (
      SELECT COUNT(*) FROM audit_logs 
      WHERE integrity_hash IS NOT NULL 
      AND created_at >= now() - interval '30 days'
    ),
    'decision_events_30d', (
      SELECT COUNT(*) FROM decision_events 
      WHERE created_at >= now() - interval '30 days'
    ),
    'auto_execute_rules', (
      SELECT COUNT(*) FROM decision_rules 
      WHERE auto_execute = true AND is_enabled = true
    ),
    'job_success_rate', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE status = 'completed')::numeric / 
        NULLIF(COUNT(*), 0) * 100, 2
      )
      FROM jobs
      WHERE created_at >= now() - interval '30 days'
    ),
    'job_failures_by_class', (
      SELECT COALESCE(jsonb_object_agg(failure_class, total), '{}'::jsonb)
      FROM job_failure_health
    ),
    'retryable_failures_pct', (
      SELECT COALESCE(
        ROUND(
          SUM(total) FILTER (WHERE is_retryable)::numeric / 
          NULLIF(SUM(total), 0) * 100, 2
        ), 0
      )
      FROM job_failure_health
    )
  ) INTO result;
  
  RETURN result;
END;
$$;