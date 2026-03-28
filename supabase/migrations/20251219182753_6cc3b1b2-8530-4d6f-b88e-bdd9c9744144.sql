-- Atualizar funcao validate_agent_release_integrity com threshold diferenciado por plataforma
-- Windows (binario/PowerShell): 50kb
-- Linux/macOS (shell script): 30kb

CREATE OR REPLACE FUNCTION public.validate_agent_release_integrity()
 RETURNS TABLE(version text, platform text, script_size integer, sha256 text, is_latest boolean, is_valid boolean, issue text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT
  ar.version,
  ar.platform,
  LENGTH(ar.script_content) AS script_size,
  ar.sha256,
  av.is_latest,
  CASE 
    WHEN ar.sha256 IS NULL THEN false
    -- Threshold diferenciado: Windows 50kb, Linux/macOS 30kb
    WHEN ar.platform = 'windows' AND LENGTH(ar.script_content) < 50000 THEN false
    WHEN ar.platform IN ('linux', 'macos') AND LENGTH(ar.script_content) < 30000 THEN false
    ELSE true
  END AS is_valid,
  CASE 
    WHEN ar.sha256 IS NULL THEN 'SHA256 ausente'
    WHEN ar.platform = 'windows' AND LENGTH(ar.script_content) < 50000 THEN 'Script muito pequeno (<50kb para Windows)'
    WHEN ar.platform IN ('linux', 'macos') AND LENGTH(ar.script_content) < 30000 THEN 'Script muito pequeno (<30kb para Linux/macOS)'
    ELSE 'OK'
  END AS issue
FROM agent_releases ar
JOIN agent_versions av ON av.version = ar.version AND av.platform = ar.platform
WHERE av.is_latest = true;
$function$;

-- Criar view para metricas de integridade agregadas
CREATE OR REPLACE VIEW v_integrity_score AS
SELECT
  -- Supply Chain Score
  COALESCE(
    (SELECT COUNT(*) FILTER (WHERE is_valid = true)::numeric / NULLIF(COUNT(*)::numeric, 0) * 100
     FROM validate_agent_release_integrity()),
    100
  ) AS supply_chain_score,
  
  -- Job Integrity Score (jobs sem violacoes nos ultimos 7 dias)
  COALESCE(
    100 - (
      SELECT COUNT(*)::numeric FROM job_integrity_violations 
      WHERE created_at > NOW() - INTERVAL '7 days'
    ) / NULLIF(
      (SELECT COUNT(*)::numeric FROM jobs 
       WHERE status = 'completed' 
       AND completed_at > NOW() - INTERVAL '7 days'),
      0
    ) * 100,
    100
  ) AS job_integrity_score,
  
  -- Contagens brutas
  (SELECT COUNT(*) FROM job_integrity_violations WHERE created_at > NOW() - INTERVAL '7 days') AS recent_violations,
  (SELECT COUNT(*) FROM jobs WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '7 days') AS recent_completed_jobs,
  (SELECT COUNT(*) FROM validate_agent_release_integrity() WHERE is_valid = false) AS invalid_releases,
  (SELECT COUNT(*) FROM validate_agent_release_integrity()) AS total_releases;

COMMENT ON VIEW v_integrity_score IS 'Metricas agregadas de integridade do sistema (supply chain + job integrity)';