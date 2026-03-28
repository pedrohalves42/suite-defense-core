-- ============================================================
-- FIX: Supply Chain Score - Calcular apenas releases ATIVAS
-- Antes: 3/12 = 25% (todas releases)
-- Depois: 3/3 = 100% (apenas ativas)
-- ============================================================

DROP VIEW IF EXISTS v_integrity_score CASCADE;

CREATE OR REPLACE VIEW v_integrity_score
WITH (security_invoker = false)
AS
WITH supply_chain_stats AS (
  -- Contar APENAS releases ativas (nao historico)
  SELECT 
    COUNT(*) FILTER (WHERE is_active = true) AS active_releases,
    COUNT(*) FILTER (
      WHERE is_active = true
      AND sha256 IS NOT NULL 
      AND LENGTH(sha256) = 64
      AND CASE
        WHEN platform = 'windows' THEN LENGTH(script_content) >= 50000
        ELSE LENGTH(script_content) >= 30000
      END
    ) AS valid_active_releases,
    -- Manter contagem total para referencia
    COUNT(*) AS total_releases,
    COUNT(*) FILTER (WHERE is_active = false) AS archived_releases
  FROM agent_releases
),
job_integrity_stats AS (
  SELECT 
    COUNT(*) AS total_jobs,
    COUNT(*) FILTER (
      WHERE status = 'completed' 
      AND output IS NOT NULL 
      AND output::text != '{}'
      AND output::text != 'null'
    ) AS valid_completed_jobs,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed_jobs,
    COUNT(*) FILTER (
      WHERE status = 'completed' 
      AND (output IS NULL OR output::text = '{}' OR output::text = 'null')
    ) AS completed_without_output
  FROM jobs
  WHERE created_at > now() - interval '7 days'
),
failed_job_stats AS (
  SELECT 
    COUNT(*) AS failed_jobs,
    COUNT(*) FILTER (
      WHERE error_message IS NOT NULL 
      AND error_message != ''
    ) AS failed_with_error
  FROM jobs
  WHERE status = 'failed'
  AND created_at > now() - interval '7 days'
)
SELECT 
  -- Supply Chain Score: APENAS releases ativas
  CASE 
    WHEN sc.active_releases = 0 THEN 100.0
    ELSE ROUND((sc.valid_active_releases::numeric / sc.active_releases::numeric) * 100, 1)
  END AS supply_chain_score,
  
  -- Job Integrity Score
  CASE 
    WHEN ji.completed_jobs = 0 THEN 100.0
    ELSE ROUND((ji.valid_completed_jobs::numeric / ji.completed_jobs::numeric) * 100, 1)
  END AS job_integrity_score,
  
  -- Failed Jobs Score (jobs falhados com mensagem de erro)
  CASE 
    WHEN fj.failed_jobs = 0 THEN 100.0
    ELSE ROUND((fj.failed_with_error::numeric / fj.failed_jobs::numeric) * 100, 1)
  END AS failed_jobs_score,
  
  -- Global Integrity Score (media ponderada)
  ROUND(
    (
      CASE WHEN sc.active_releases = 0 THEN 100.0
           ELSE (sc.valid_active_releases::numeric / sc.active_releases::numeric) * 100 END
      + CASE WHEN ji.completed_jobs = 0 THEN 100.0
             ELSE (ji.valid_completed_jobs::numeric / ji.completed_jobs::numeric) * 100 END
      + CASE WHEN fj.failed_jobs = 0 THEN 100.0
             ELSE (fj.failed_with_error::numeric / fj.failed_jobs::numeric) * 100 END
    ) / 3, 1
  ) AS global_integrity_score,
  
  -- Metricas de Supply Chain (detalhes)
  sc.active_releases,
  sc.valid_active_releases,
  sc.archived_releases,
  sc.total_releases,
  
  -- Metricas de Jobs (detalhes)
  ji.total_jobs,
  ji.completed_jobs,
  ji.valid_completed_jobs,
  ji.completed_without_output,
  fj.failed_jobs,
  fj.failed_with_error,
  
  -- Timestamp
  now() AS calculated_at
FROM supply_chain_stats sc
CROSS JOIN job_integrity_stats ji
CROSS JOIN failed_job_stats fj;

-- Comentario de documentacao
COMMENT ON VIEW v_integrity_score IS 
'Zero Trust Integrity Score Dashboard.
Supply Chain Score: Calcula APENAS releases ativas (nao historico).
Job Integrity Score: Jobs completados com output valido.
Failed Jobs Score: Jobs falhados com mensagem de erro.
Global Score: Media dos tres scores.
SECURITY: Read-only audit view, no data modification possible.';