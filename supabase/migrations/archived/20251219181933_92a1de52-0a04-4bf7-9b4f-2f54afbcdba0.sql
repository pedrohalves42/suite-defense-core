-- ============================================================
-- ARQUITETURA ZERO TRUST - CAMADA 1: DATABASE CONSTRAINTS
-- Impossivel marcar job como completed sem side effects reais
-- ============================================================

-- 1.1 View permanente para auditoria de integridade
CREATE OR REPLACE VIEW job_integrity_violations AS
SELECT
  j.id AS job_id,
  j.type,
  j.agent_id,
  j.agent_name,
  j.tenant_id,
  j.created_at,
  j.completed_at,
  'MISSING_SIDE_EFFECT' AS violation
FROM jobs j
WHERE j.status = 'completed'
  AND (
    -- collect_web_activity sem dados em agent_web_activity
    (j.type = 'collect_web_activity' AND NOT EXISTS (
      SELECT 1 FROM agent_web_activity aw
      WHERE aw.agent_id = j.agent_id
        AND aw.created_at >= j.created_at
    ))
    OR
    -- collect_system_metrics sem dados em agent_system_metrics
    (j.type = 'collect_system_metrics' AND NOT EXISTS (
      SELECT 1 FROM agent_system_metrics sm
      WHERE sm.agent_id = j.agent_id
        AND sm.collected_at >= j.created_at
    ))
    OR
    -- software_inventory_collect sem dados em software_inventory (usa last_seen_at)
    (j.type = 'software_inventory_collect' AND NOT EXISTS (
      SELECT 1 FROM software_inventory si
      WHERE si.agent_id = j.agent_id
        AND si.last_seen_at >= j.created_at
    ))
  );

-- 1.2 Funcao de validacao HARD (BEFORE UPDATE trigger)
CREATE OR REPLACE FUNCTION enforce_job_side_effects()
RETURNS trigger AS $$
BEGIN
  -- Apenas quando tentando marcar como completed
  IF OLD.status IS DISTINCT FROM 'completed'
     AND NEW.status = 'completed' THEN

    -- VALIDACAO: collect_web_activity
    IF NEW.type = 'collect_web_activity' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM agent_web_activity aw
        WHERE aw.agent_id = NEW.agent_id
          AND aw.created_at >= NEW.created_at
      ) THEN
        RAISE EXCEPTION
          'JOB_INTEGRITY_VIOLATION: collect_web_activity completed without web_activity data (job_id=%, agent_id=%)',
          NEW.id, NEW.agent_id
          USING ERRCODE = '23514';
      END IF;
    END IF;

    -- VALIDACAO: collect_system_metrics
    IF NEW.type = 'collect_system_metrics' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM agent_system_metrics sm
        WHERE sm.agent_id = NEW.agent_id
          AND sm.collected_at >= NEW.created_at
      ) THEN
        RAISE EXCEPTION
          'JOB_INTEGRITY_VIOLATION: collect_system_metrics completed without metrics data (job_id=%, agent_id=%)',
          NEW.id, NEW.agent_id
          USING ERRCODE = '23514';
      END IF;
    END IF;

    -- VALIDACAO: software_inventory_collect (usa last_seen_at)
    IF NEW.type = 'software_inventory_collect' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM software_inventory si
        WHERE si.agent_id = NEW.agent_id
          AND si.last_seen_at >= NEW.created_at
      ) THEN
        RAISE EXCEPTION
          'JOB_INTEGRITY_VIOLATION: software_inventory_collect completed without inventory data (job_id=%, agent_id=%)',
          NEW.id, NEW.agent_id
          USING ERRCODE = '23514';
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.3 Trigger BEFORE UPDATE (nuclear constraint)
DROP TRIGGER IF EXISTS trg_enforce_job_side_effects ON jobs;
CREATE TRIGGER trg_enforce_job_side_effects
BEFORE UPDATE OF status ON jobs
FOR EACH ROW
EXECUTE FUNCTION enforce_job_side_effects();

-- 1.4 Funcao de validacao Supply Chain (SHA256)
CREATE OR REPLACE FUNCTION validate_agent_release_integrity()
RETURNS TABLE(
  version text,
  platform text,
  script_size int,
  sha256 text,
  is_latest boolean,
  is_valid boolean,
  issue text
) AS $$
SELECT
  ar.version,
  ar.platform,
  LENGTH(ar.script_content) AS script_size,
  ar.sha256,
  av.is_latest,
  CASE 
    WHEN ar.sha256 IS NULL THEN false
    WHEN LENGTH(ar.script_content) < 50000 THEN false
    ELSE true
  END AS is_valid,
  CASE 
    WHEN ar.sha256 IS NULL THEN 'SHA256 ausente'
    WHEN LENGTH(ar.script_content) < 50000 THEN 'Script muito pequeno (<50kb)'
    ELSE 'OK'
  END AS issue
FROM agent_releases ar
JOIN agent_versions av ON av.version = ar.version AND av.platform = ar.platform
WHERE av.is_latest = true;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- 1.5 Indices para performance das validacoes
CREATE INDEX IF NOT EXISTS idx_agent_web_activity_agent_created 
ON agent_web_activity(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_system_metrics_agent_collected 
ON agent_system_metrics(agent_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_software_inventory_agent_lastseen 
ON software_inventory(agent_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_agent_status_type 
ON jobs(agent_id, status, type);

-- Grant para RLS
GRANT SELECT ON job_integrity_violations TO authenticated;