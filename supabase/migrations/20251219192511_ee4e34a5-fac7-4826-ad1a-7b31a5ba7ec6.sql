-- =============================================================================
-- ZERO TRUST 100% - ENFORCE FAILED JOBS REQUIRE ERROR_MESSAGE
-- =============================================================================

-- 1. Criar funcao de validacao SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.enforce_failed_job_requires_error()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'failed'
     AND NEW.status = 'failed' THEN

    IF NEW.error_message IS NULL
       OR LENGTH(TRIM(NEW.error_message)) = 0 THEN

      RAISE EXCEPTION
        'JOB_INTEGRITY_VIOLATION: failed job requires error_message (job_id=%, type=%)',
        NEW.id, NEW.type
        USING ERRCODE = '23514';

    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- 2. Criar trigger BEFORE UPDATE (hard enforcement)
DROP TRIGGER IF EXISTS trg_enforce_failed_job_error ON jobs;

CREATE TRIGGER trg_enforce_failed_job_error
BEFORE UPDATE OF status ON jobs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_failed_job_requires_error();

-- 3. Corrigir jobs historicos que violam a regra
UPDATE jobs
SET error_message = 'RETROACTIVE_INTEGRITY_FIX: error_message was missing at ' || NOW()::text
WHERE status = 'failed'
  AND (error_message IS NULL OR TRIM(error_message) = '');

-- 4. DROP CASCADE para remover views dependentes
DROP VIEW IF EXISTS v_integrity_score CASCADE;
DROP VIEW IF EXISTS job_integrity_violations CASCADE;

-- 5. Recriar job_integrity_violations com MISSING_ERROR_MESSAGE
-- CORRIGIDO: software_inventory usa first_seen_at, nao created_at
CREATE OR REPLACE VIEW job_integrity_violations AS
SELECT 
  j.id AS job_id, 
  j.type, 
  j.agent_id, 
  j.created_at, 
  j.tenant_id,
  'MISSING_SIDE_EFFECT' AS violation_type,
  'Job completed without generating expected data' AS violation_description
FROM jobs j
WHERE j.status = 'completed'
  AND j.type = 'collect_web_activity'
  AND NOT EXISTS (
    SELECT 1 FROM agent_web_activity aw
    WHERE aw.agent_id = j.agent_id
      AND aw.created_at >= j.created_at - INTERVAL '2 seconds'
  )
UNION ALL
SELECT 
  j.id AS job_id, 
  j.type, 
  j.agent_id, 
  j.created_at, 
  j.tenant_id,
  'MISSING_SIDE_EFFECT' AS violation_type,
  'Job completed without generating expected data' AS violation_description
FROM jobs j
WHERE j.status = 'completed'
  AND j.type = 'collect_system_metrics'
  AND NOT EXISTS (
    SELECT 1 FROM agent_system_metrics asm
    WHERE asm.agent_id = j.agent_id
      AND asm.created_at >= j.created_at - INTERVAL '2 seconds'
  )
UNION ALL
SELECT 
  j.id AS job_id, 
  j.type, 
  j.agent_id, 
  j.created_at, 
  j.tenant_id,
  'MISSING_SIDE_EFFECT' AS violation_type,
  'Job completed without generating expected data' AS violation_description
FROM jobs j
WHERE j.status = 'completed'
  AND j.type = 'software_inventory_collect'
  AND NOT EXISTS (
    SELECT 1 FROM software_inventory si
    WHERE si.agent_id = j.agent_id
      AND si.first_seen_at >= j.created_at - INTERVAL '2 seconds'
  )
UNION ALL
SELECT 
  j.id AS job_id, 
  j.type, 
  j.agent_id, 
  j.created_at, 
  j.tenant_id,
  'MISSING_ERROR_MESSAGE' AS violation_type,
  'Job failed without explanation' AS violation_description
FROM jobs j
WHERE j.status = 'failed'
  AND (j.error_message IS NULL OR TRIM(j.error_message) = '');

-- 6. Recriar v_integrity_score com failed_jobs_score
CREATE OR REPLACE VIEW v_integrity_score AS
WITH supply_chain_stats AS (
  SELECT 
    COUNT(*) AS total_releases,
    COUNT(*) FILTER (
      WHERE sha256 IS NOT NULL 
        AND LENGTH(sha256) = 64
        AND is_active = true
        AND CASE 
          WHEN platform = 'windows' THEN LENGTH(script_content) >= 50000
          ELSE LENGTH(script_content) >= 30000
        END
    ) AS valid_releases
  FROM agent_releases
  WHERE created_at > NOW() - INTERVAL '30 days'
),
job_integrity_stats AS (
  SELECT 
    COUNT(*) AS total_jobs_with_effects,
    COUNT(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM job_integrity_violations jiv 
        WHERE jiv.job_id = j.id 
          AND jiv.violation_type = 'MISSING_SIDE_EFFECT'
      )
    ) AS valid_jobs_with_effects
  FROM jobs j
  WHERE j.status = 'completed'
    AND j.type IN ('collect_web_activity', 'collect_system_metrics', 'software_inventory_collect')
    AND j.created_at > NOW() - INTERVAL '7 days'
),
failed_job_stats AS (
  SELECT 
    COUNT(*) AS total_failed_jobs,
    COUNT(*) FILTER (
      WHERE error_message IS NOT NULL 
        AND TRIM(error_message) != ''
    ) AS valid_failed_jobs
  FROM jobs
  WHERE status = 'failed'
    AND created_at > NOW() - INTERVAL '7 days'
)
SELECT
  CASE 
    WHEN scs.total_releases = 0 THEN 100.0
    ELSE ROUND((scs.valid_releases::numeric / scs.total_releases::numeric) * 100, 1)
  END AS supply_chain_score,
  scs.total_releases,
  scs.valid_releases,
  CASE 
    WHEN jis.total_jobs_with_effects = 0 THEN 100.0
    ELSE ROUND((jis.valid_jobs_with_effects::numeric / jis.total_jobs_with_effects::numeric) * 100, 1)
  END AS job_integrity_score,
  jis.total_jobs_with_effects,
  jis.valid_jobs_with_effects,
  CASE 
    WHEN fjs.total_failed_jobs = 0 THEN 100.0
    ELSE ROUND((fjs.valid_failed_jobs::numeric / fjs.total_failed_jobs::numeric) * 100, 1)
  END AS failed_jobs_score,
  fjs.total_failed_jobs,
  fjs.valid_failed_jobs,
  ROUND(
    (
      CASE WHEN scs.total_releases = 0 THEN 100.0
           ELSE (scs.valid_releases::numeric / scs.total_releases::numeric) * 100 END
      +
      CASE WHEN jis.total_jobs_with_effects = 0 THEN 100.0
           ELSE (jis.valid_jobs_with_effects::numeric / jis.total_jobs_with_effects::numeric) * 100 END
      +
      CASE WHEN fjs.total_failed_jobs = 0 THEN 100.0
           ELSE (fjs.valid_failed_jobs::numeric / fjs.total_failed_jobs::numeric) * 100 END
    ) / 3,
    1
  ) AS global_integrity_score,
  NOW() AS calculated_at
FROM supply_chain_stats scs
CROSS JOIN job_integrity_stats jis
CROSS JOIN failed_job_stats fjs;

-- 7. Comentarios de documentacao
COMMENT ON FUNCTION public.enforce_failed_job_requires_error() IS 
'Zero Trust: Impede jobs marcados como failed sem error_message explicativo. ERRCODE 23514.';

COMMENT ON TRIGGER trg_enforce_failed_job_error ON jobs IS 
'Hard enforcement: Bloqueia UPDATE para failed sem error_message. Zero Trust 100%.';