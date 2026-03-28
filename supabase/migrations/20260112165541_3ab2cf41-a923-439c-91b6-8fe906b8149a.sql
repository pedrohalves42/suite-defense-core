-- FASE 4: Adicionar coluna metadata a tabela tasks
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN tasks.metadata IS 'Metadados adicionais da tarefa (e.g., source, job_keys afetados, runbook references)';

-- FASE 5: Recriar view v_agent_execution_health com coluna health_status
DROP VIEW IF EXISTS v_agent_execution_health;

CREATE OR REPLACE VIEW v_agent_execution_health AS
SELECT 
  a.id AS agent_id,
  a.tenant_id,
  a.agent_name,
  COALESCE(chain.last_execution_index, 0) AS last_execution_index,
  chain.last_execution_hash,
  chain.updated_at AS chain_updated_at,
  CASE 
    WHEN chain.updated_at IS NULL THEN 'unknown'
    WHEN chain.updated_at < NOW() - INTERVAL '24 hours' THEN 'critical'
    WHEN chain.updated_at < NOW() - INTERVAL '6 hours' THEN 'warning'
    ELSE 'healthy'
  END AS chain_health,
  -- health_status column (required by watchdog-non-execution)
  CASE 
    WHEN chain.updated_at IS NULL THEN 'unknown'
    WHEN chain.updated_at < NOW() - INTERVAL '24 hours' THEN 'critical'
    WHEN chain.updated_at < NOW() - INTERVAL '6 hours' THEN 'warning'
    ELSE 'healthy'
  END AS health_status
FROM agents a
LEFT JOIN agent_execution_chain chain ON a.id = chain.agent_id
WHERE a.archived_at IS NULL;

-- Grant access to the view
GRANT SELECT ON v_agent_execution_health TO authenticated, service_role;