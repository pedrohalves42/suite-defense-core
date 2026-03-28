-- ============================================================
-- MIGRACAO: 5 Correcoes Cirurgicas para Bugs Silenciosos
-- Data: 2026-02-01
-- ============================================================

-- 1. Adicionar archived_at em job_executions
ALTER TABLE job_executions 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_job_executions_archived_at 
ON job_executions(archived_at) WHERE archived_at IS NOT NULL;

-- 2. Atualizar trigger prevent_execution_deletion para soft-delete
CREATE OR REPLACE FUNCTION prevent_execution_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  -- Permitir delecao de registros arquivados ha mais de 30 dias
  IF OLD.archived_at IS NOT NULL 
     AND OLD.archived_at < NOW() - INTERVAL '30 days' THEN
    RETURN OLD;
  END IF;
  
  -- Bloquear delecao de registros nao arquivados ou recentes
  RAISE EXCEPTION 'Cannot delete job execution records. Archive first, then wait 30 days.'
    USING ERRCODE = '23514';
END;
$$;

-- 3. RPC process_dlq_batch com blindagem de tenant
CREATE OR REPLACE FUNCTION process_dlq_batch(
  p_tenant_id UUID,
  p_batch_size INTEGER DEFAULT 50,
  p_action TEXT DEFAULT 'resolve'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_retried INTEGER := 0;
  v_resolved INTEGER := 0;
  v_item RECORD;
BEGIN
  -- BLINDAGEM DE TENANT
  IF p_tenant_id IS DISTINCT FROM get_active_tenant_id()
     AND NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'Tenant mismatch: access denied';
  END IF;

  FOR v_item IN
    SELECT d.id, d.original_job_id, d.retry_count
    FROM failed_jobs_dlq d
    WHERE d.tenant_id = p_tenant_id
      AND d.resolved_at IS NULL
    ORDER BY d.last_failure_at ASC
    LIMIT p_batch_size
  LOOP
    v_processed := v_processed + 1;
    
    IF p_action = 'retry' AND v_item.retry_count < 3 THEN
      UPDATE jobs 
      SET status = 'queued', updated_at = NOW()
      WHERE id = v_item.original_job_id;
      
      UPDATE failed_jobs_dlq 
      SET retry_count = retry_count + 1, next_retry_at = NOW()
      WHERE id = v_item.id;
      
      v_retried := v_retried + 1;
    ELSE
      UPDATE failed_jobs_dlq 
      SET resolved_at = NOW(), 
          resolution_notes = 'Resolved via batch cleanup',
          status = 'resolved'
      WHERE id = v_item.id;
      
      v_resolved := v_resolved + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'processed', v_processed,
    'retried', v_retried,
    'resolved', v_resolved,
    'tenant_id', p_tenant_id
  );
END;
$$;

-- 4. RPC cleanup_stale_tasks com blindagem de tenant
CREATE OR REPLACE FUNCTION cleanup_stale_tasks(
  p_tenant_id UUID,
  p_days_old INTEGER DEFAULT 30,
  p_batch_size INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_cancelled INTEGER := 0;
BEGIN
  -- BLINDAGEM DE TENANT
  IF p_tenant_id IS DISTINCT FROM get_active_tenant_id()
     AND NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'Tenant mismatch: access denied';
  END IF;

  WITH orphan_tasks AS (
    SELECT id FROM tasks
    WHERE tenant_id = p_tenant_id
      AND status = 'open'
      AND fingerprint_id IS NULL
      AND created_at < NOW() - (p_days_old || ' days')::INTERVAL
    LIMIT p_batch_size
  )
  UPDATE tasks t
  SET status = 'cancelled',
      closed_at = NOW(),
      closure_reason = 'Auto-cancelled: orphan task without fingerprint'
  FROM orphan_tasks o
  WHERE t.id = o.id;
  
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'cancelled_orphans', v_cancelled,
    'tenant_id', p_tenant_id
  );
END;
$$;

-- 5. View canonica v_agent_state (fonte unica de verdade)
CREATE OR REPLACE VIEW v_agent_state 
WITH (security_invoker = on) AS
SELECT
  a.id AS agent_id,
  a.tenant_id,
  a.hostname,
  a.agent_name,
  a.display_name,
  a.last_heartbeat,
  a.agent_version,
  a.agent_state,
  a.agent_state_reason,
  a.is_isolated,
  a.is_throttled,
  -- Estado canonico derivado
  CASE
    WHEN a.archived_at IS NOT NULL THEN 'archived'
    WHEN a.is_isolated THEN 'isolated'
    WHEN a.agent_state = 'safe_mode' THEN 'safe_mode'
    WHEN a.last_heartbeat < NOW() - INTERVAL '30 minutes' THEN 'offline'
    WHEN a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'warning'
    ELSE 'healthy'
  END AS canonical_state,
  -- Lag do heartbeat em segundos
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) AS heartbeat_lag_seconds,
  -- Metadata
  NOW() AS snapshot_at
FROM agents a
WHERE a.status = 'active'
  AND a.archived_at IS NULL
  AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin());

COMMENT ON VIEW v_agent_state IS 
'ADR: View canonica para estado do agente. Toda UI deve ler estado APENAS desta view.';

-- 6. Tabela cron_health_checks para monitoramento
CREATE TABLE IF NOT EXISTS cron_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name TEXT NOT NULL UNIQUE,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE cron_health_checks ENABLE ROW LEVEL SECURITY;

-- Policy para service_role (Edge Functions)
CREATE POLICY "service_role_all" ON cron_health_checks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Policy para super_admin visualizar
CREATE POLICY "super_admin_select" ON cron_health_checks
  FOR SELECT TO authenticated
  USING (is_current_super_admin());

-- Inserir crons conhecidos
INSERT INTO cron_health_checks (cron_name) VALUES 
  ('integrity-sentinel-15min'),
  ('rls-automated-tests-6h'),
  ('evaluate-software-risk-daily'),
  ('cron-sentinel'),
  ('cleanup-old-data'),
  ('sync-agent-metrics')
ON CONFLICT (cron_name) DO NOTHING;

-- 7. View v_cron_health para alertar crons mortos
CREATE OR REPLACE VIEW v_cron_health AS
SELECT 
  cron_name,
  last_success_at,
  last_failure_at,
  last_error,
  consecutive_failures,
  updated_at,
  CASE
    WHEN last_success_at IS NULL THEN 'never_run'
    WHEN consecutive_failures >= 3 THEN 'critical'
    WHEN consecutive_failures >= 1 THEN 'warning'
    WHEN last_success_at < NOW() - INTERVAL '2 hours' 
      AND cron_name LIKE '%15min%' THEN 'stale'
    WHEN last_success_at < NOW() - INTERVAL '12 hours' 
      AND cron_name LIKE '%6h%' THEN 'stale'
    WHEN last_success_at < NOW() - INTERVAL '48 hours' 
      AND cron_name LIKE '%daily%' THEN 'stale'
    ELSE 'healthy'
  END AS status
FROM cron_health_checks;

-- 8. RPC archive_old_executions para cleanup seguro
CREATE OR REPLACE FUNCTION archive_old_executions(
  p_older_than_days INTEGER DEFAULT 90,
  p_batch_size INTEGER DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_archived INTEGER := 0;
  v_deleted INTEGER := 0;
BEGIN
  -- Apenas super_admin pode executar
  IF NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'Only super_admin can archive executions';
  END IF;

  -- Etapa 1: Arquivar execucoes antigas
  WITH to_archive AS (
    SELECT id FROM job_executions
    WHERE created_at < NOW() - (p_older_than_days || ' days')::INTERVAL
      AND archived_at IS NULL
    LIMIT p_batch_size
  )
  UPDATE job_executions je
  SET archived_at = NOW()
  FROM to_archive ta
  WHERE je.id = ta.id;
  
  GET DIAGNOSTICS v_archived = ROW_COUNT;
  
  -- Etapa 2: Deletar apenas apos 30 dias arquivado
  DELETE FROM job_executions
  WHERE archived_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'archived', v_archived,
    'deleted', v_deleted,
    'older_than_days', p_older_than_days
  );
END;
$$;

-- 9. RPC para Edge Functions atualizarem health check
CREATE OR REPLACE FUNCTION update_cron_health(
  p_cron_name TEXT,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  INSERT INTO cron_health_checks (cron_name, last_success_at, last_failure_at, last_error, consecutive_failures, updated_at)
  VALUES (
    p_cron_name,
    CASE WHEN p_success THEN NOW() ELSE NULL END,
    CASE WHEN NOT p_success THEN NOW() ELSE NULL END,
    p_error,
    CASE WHEN p_success THEN 0 ELSE 1 END,
    NOW()
  )
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = CASE WHEN p_success THEN NOW() ELSE cron_health_checks.last_success_at END,
    last_failure_at = CASE WHEN NOT p_success THEN NOW() ELSE cron_health_checks.last_failure_at END,
    last_error = CASE WHEN NOT p_success THEN p_error ELSE cron_health_checks.last_error END,
    consecutive_failures = CASE 
      WHEN p_success THEN 0 
      ELSE cron_health_checks.consecutive_failures + 1 
    END,
    updated_at = NOW();
END;
$$;