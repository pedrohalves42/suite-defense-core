-- ============================================================
-- MIGRACAO: Correcoes Cirurgicas Finais (6 Erros Criticos)
-- ============================================================

-- 1. Corrigir archive_old_executions (DELETE com CTE valido)
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
  IF NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'Only super_admin can archive executions';
  END IF;

  -- Etapa 1: Arquivar execucoes antigas (CTE correto)
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
  
  -- Etapa 2: Deletar com CTE (CORRECAO CRITICA - PostgreSQL nao suporta LIMIT em DELETE)
  WITH to_delete AS (
    SELECT id FROM job_executions
    WHERE archived_at < NOW() - INTERVAL '30 days'
    LIMIT p_batch_size
  )
  DELETE FROM job_executions je
  USING to_delete td
  WHERE je.id = td.id;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'archived', v_archived,
    'deleted', v_deleted,
    'older_than_days', p_older_than_days
  );
END;
$$;

COMMENT ON FUNCTION archive_old_executions IS 
'Arquiva e deleta job_executions antigas. Usa CTE para batch (PostgreSQL nao suporta LIMIT em DELETE).';

-- 2. Criar trigger na tabela (CRITICO - funcao existia mas trigger nao)
DROP TRIGGER IF EXISTS tr_prevent_execution_deletion ON job_executions;

CREATE TRIGGER tr_prevent_execution_deletion
  BEFORE DELETE ON job_executions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_execution_deletion();

COMMENT ON TRIGGER tr_prevent_execution_deletion ON job_executions IS 
'ADR: Protecao de imutabilidade. Permite delete apenas de registros arquivados ha 30+ dias.';

-- 3. Recriar view com security_invoker=on (CRITICO para RLS)
DROP VIEW IF EXISTS v_agent_state;

CREATE VIEW v_agent_state 
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
  CASE
    WHEN a.archived_at IS NOT NULL THEN 'archived'
    WHEN a.is_isolated THEN 'isolated'
    WHEN a.agent_state = 'safe_mode' THEN 'safe_mode'
    WHEN a.last_heartbeat < NOW() - INTERVAL '30 minutes' THEN 'offline'
    WHEN a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'warning'
    ELSE 'healthy'
  END AS canonical_state,
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) AS heartbeat_lag_seconds,
  NOW() AS snapshot_at
FROM agents a
WHERE a.status = 'active'
  AND a.archived_at IS NULL
  AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin());

COMMENT ON VIEW v_agent_state IS 
'ADR: View canonica com security_invoker=on. Toda UI deve ler estado APENAS desta view.';

-- Controle de acesso explicito
REVOKE ALL ON v_agent_state FROM PUBLIC;
GRANT SELECT ON v_agent_state TO authenticated;
GRANT SELECT ON v_agent_state TO service_role;

-- 4. Criar wrapper mark_cron_failure
CREATE OR REPLACE FUNCTION mark_cron_failure(
  p_cron_name TEXT,
  p_error TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM update_cron_health(p_cron_name, false, p_error);
END;
$$;

COMMENT ON FUNCTION mark_cron_failure IS 
'Wrapper simplificado para registrar falha de cron. Chama update_cron_health internamente.';