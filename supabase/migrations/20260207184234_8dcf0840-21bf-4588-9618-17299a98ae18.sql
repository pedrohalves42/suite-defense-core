
-- ============================================================
-- CORRECAO ROBUSTA: SISTEMA DE MONITORAMENTO E MANUTENCAO
-- ============================================================

-- 1. Adicionar coluna last_result em cron_health_checks se nao existir
ALTER TABLE cron_health_checks 
ADD COLUMN IF NOT EXISTS last_result jsonb;

-- ============================================================
-- FUNCAO: Atualizar status de agentes offline
-- ============================================================
CREATE OR REPLACE FUNCTION update_offline_agent_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inactive_count integer := 0;
  result jsonb;
BEGIN
  -- Marcar agentes offline ha >2h como inactive (trigger derivara agent_state)
  UPDATE agents 
  SET 
    status = 'inactive',
    offline_reason = COALESCE(offline_reason, 'Auto-detected: No heartbeat >2h'),
    offline_detected_at = COALESCE(offline_detected_at, NOW())
  WHERE status = 'active'
    AND archived_at IS NULL
    AND last_heartbeat < NOW() - INTERVAL '2 hours';
  
  GET DIAGNOSTICS inactive_count = ROW_COUNT;
  
  result := jsonb_build_object(
    'success', true,
    'agents_set_inactive', inactive_count,
    'executed_at', NOW()
  );
  
  -- Reportar para cron_health_checks
  INSERT INTO cron_health_checks (cron_name, last_success_at, consecutive_failures, updated_at, last_result)
  VALUES ('update-offline-agent-status', NOW(), 0, NOW(), result)
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = NOW(),
    consecutive_failures = 0,
    last_error = NULL,
    updated_at = NOW(),
    last_result = EXCLUDED.last_result;
  
  RETURN result;
  
EXCEPTION WHEN OTHERS THEN
  INSERT INTO cron_health_checks (cron_name, last_failure_at, last_error, consecutive_failures, updated_at)
  VALUES ('update-offline-agent-status', NOW(), SQLERRM, 1, NOW())
  ON CONFLICT (cron_name) DO UPDATE SET
    last_failure_at = NOW(),
    last_error = SQLERRM,
    consecutive_failures = cron_health_checks.consecutive_failures + 1,
    updated_at = NOW();
  RAISE;
END;
$$;

-- ============================================================
-- FUNCAO: Limpar jobs pendentes para agentes offline
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_jobs_for_offline_agents()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cancelled_count integer := 0;
  result jsonb;
BEGIN
  -- Cancelar jobs pendentes para agentes que estao offline
  UPDATE jobs 
  SET 
    status = 'cancelled',
    completed_at = NOW(),
    error_message = '[AUTO-CLEANUP] Job cancelled: Agent offline >2h',
    failure_class = 'AGENT_OFFLINE'
  WHERE status IN ('pending', 'queued')
    AND agent_id IN (
      SELECT id FROM agents 
      WHERE status = 'inactive' 
         OR last_heartbeat < NOW() - INTERVAL '2 hours'
    )
    AND created_at < NOW() - INTERVAL '30 minutes';
  
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  
  result := jsonb_build_object(
    'success', true,
    'jobs_cancelled', cancelled_count,
    'executed_at', NOW()
  );
  
  -- Reportar para cron_health_checks
  INSERT INTO cron_health_checks (cron_name, last_success_at, consecutive_failures, updated_at, last_result)
  VALUES ('cleanup-jobs-offline-agents', NOW(), 0, NOW(), result)
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = NOW(),
    consecutive_failures = 0,
    last_error = NULL,
    updated_at = NOW(),
    last_result = EXCLUDED.last_result;
  
  RETURN result;
  
EXCEPTION WHEN OTHERS THEN
  INSERT INTO cron_health_checks (cron_name, last_failure_at, last_error, consecutive_failures, updated_at)
  VALUES ('cleanup-jobs-offline-agents', NOW(), SQLERRM, 1, NOW())
  ON CONFLICT (cron_name) DO UPDATE SET
    last_failure_at = NOW(),
    last_error = SQLERRM,
    consecutive_failures = cron_health_checks.consecutive_failures + 1,
    updated_at = NOW();
  RAISE;
END;
$$;

-- ============================================================
-- FUNCAO: Resolver DLQ pendentes de agentes offline
-- ============================================================
CREATE OR REPLACE FUNCTION resolve_stale_dlq_entries()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_count integer := 0;
  result jsonb;
BEGIN
  -- Resolver entradas DLQ pendentes de AGENT_OFFLINE com >24h
  UPDATE failed_jobs_dlq 
  SET 
    status = 'resolved',
    resolved_at = NOW(),
    resolution_notes = 'Auto-resolved: Agent offline job expired after 24h'
  WHERE status = 'pending'
    AND failure_class = 'AGENT_OFFLINE'
    AND created_at < NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS resolved_count = ROW_COUNT;
  
  result := jsonb_build_object(
    'success', true,
    'dlq_entries_resolved', resolved_count,
    'executed_at', NOW()
  );
  
  -- Reportar para cron_health_checks
  INSERT INTO cron_health_checks (cron_name, last_success_at, consecutive_failures, updated_at, last_result)
  VALUES ('resolve-stale-dlq', NOW(), 0, NOW(), result)
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = NOW(),
    consecutive_failures = 0,
    last_error = NULL,
    updated_at = NOW(),
    last_result = EXCLUDED.last_result;
  
  RETURN result;
  
EXCEPTION WHEN OTHERS THEN
  INSERT INTO cron_health_checks (cron_name, last_failure_at, last_error, consecutive_failures, updated_at)
  VALUES ('resolve-stale-dlq', NOW(), SQLERRM, 1, NOW())
  ON CONFLICT (cron_name) DO UPDATE SET
    last_failure_at = NOW(),
    last_error = SQLERRM,
    consecutive_failures = cron_health_checks.consecutive_failures + 1,
    updated_at = NOW();
  RAISE;
END;
$$;

-- ============================================================
-- FUNCAO: Avaliacao de risco de software (corrigida)
-- ============================================================
CREATE OR REPLACE FUNCTION evaluate_software_risk_with_reporting()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agents_processed integer := 0;
  high_risk_count integer := 0;
  result jsonb;
BEGIN
  -- Contar agentes ativos
  SELECT COUNT(*) INTO agents_processed 
  FROM agents 
  WHERE archived_at IS NULL;
  
  -- Contar agentes de alto risco (versao antiga ou offline)
  SELECT COUNT(*) INTO high_risk_count
  FROM agents
  WHERE archived_at IS NULL
    AND (
      agent_version < 'v5.0.0'
      OR last_heartbeat < NOW() - INTERVAL '24 hours'
    );
  
  result := jsonb_build_object(
    'success', true,
    'agents_evaluated', agents_processed,
    'high_risk_agents', high_risk_count,
    'risk_percentage', CASE WHEN agents_processed > 0 
      THEN ROUND(100.0 * high_risk_count / agents_processed, 2) 
      ELSE 0 END,
    'executed_at', NOW()
  );
  
  -- Reportar SUCESSO para cron_health_checks
  INSERT INTO cron_health_checks (cron_name, last_success_at, consecutive_failures, updated_at, last_result)
  VALUES ('evaluate-software-risk-daily', NOW(), 0, NOW(), result)
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = NOW(),
    consecutive_failures = 0,
    last_error = NULL,
    updated_at = NOW(),
    last_result = EXCLUDED.last_result;
  
  RETURN result;
  
EXCEPTION WHEN OTHERS THEN
  INSERT INTO cron_health_checks (cron_name, last_failure_at, last_error, consecutive_failures, updated_at)
  VALUES ('evaluate-software-risk-daily', NOW(), SQLERRM, 1, NOW())
  ON CONFLICT (cron_name) DO UPDATE SET
    last_failure_at = NOW(),
    last_error = SQLERRM,
    consecutive_failures = cron_health_checks.consecutive_failures + 1,
    updated_at = NOW();
  RAISE;
END;
$$;

-- ============================================================
-- FUNCAO: Orquestrador de manutencao (executa todas as funcoes)
-- ============================================================
CREATE OR REPLACE FUNCTION run_system_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r1 jsonb;
  r2 jsonb;
  r3 jsonb;
  r4 jsonb;
  result jsonb;
BEGIN
  -- Executar todas as funcoes de manutencao
  SELECT update_offline_agent_status() INTO r1;
  SELECT cleanup_jobs_for_offline_agents() INTO r2;
  SELECT resolve_stale_dlq_entries() INTO r3;
  SELECT auto_resolve_stale_tasks() INTO r4;
  
  result := jsonb_build_object(
    'success', true,
    'agent_status_update', r1,
    'job_cleanup', r2,
    'dlq_resolution', r3,
    'task_resolution', r4,
    'executed_at', NOW()
  );
  
  -- Reportar para cron_health_checks
  INSERT INTO cron_health_checks (cron_name, last_success_at, consecutive_failures, updated_at, last_result)
  VALUES ('system-maintenance-orchestrator', NOW(), 0, NOW(), result)
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = NOW(),
    consecutive_failures = 0,
    last_error = NULL,
    updated_at = NOW(),
    last_result = EXCLUDED.last_result;
  
  RETURN result;
  
EXCEPTION WHEN OTHERS THEN
  INSERT INTO cron_health_checks (cron_name, last_failure_at, last_error, consecutive_failures, updated_at)
  VALUES ('system-maintenance-orchestrator', NOW(), SQLERRM, 1, NOW())
  ON CONFLICT (cron_name) DO UPDATE SET
    last_failure_at = NOW(),
    last_error = SQLERRM,
    consecutive_failures = cron_health_checks.consecutive_failures + 1,
    updated_at = NOW();
  RAISE;
END;
$$;

-- ============================================================
-- Adicionar colunas faltantes em failed_jobs_dlq
-- ============================================================
ALTER TABLE failed_jobs_dlq 
ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
ADD COLUMN IF NOT EXISTS resolution_notes text;

-- ============================================================
-- COMENTARIOS PARA DOCUMENTACAO
-- ============================================================
COMMENT ON FUNCTION update_offline_agent_status() IS 'Atualiza status de agentes offline ha >2h para inactive';
COMMENT ON FUNCTION cleanup_jobs_for_offline_agents() IS 'Cancela jobs pendentes para agentes offline';
COMMENT ON FUNCTION resolve_stale_dlq_entries() IS 'Resolve entradas DLQ de AGENT_OFFLINE com >24h';
COMMENT ON FUNCTION evaluate_software_risk_with_reporting() IS 'Avalia risco de software e reporta para cron_health_checks';
COMMENT ON FUNCTION run_system_maintenance() IS 'Orquestra todas as funcoes de manutencao do sistema';
