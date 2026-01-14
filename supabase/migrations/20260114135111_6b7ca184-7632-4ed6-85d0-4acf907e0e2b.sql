-- =============================================================================
-- RLS Hardening Phase 9.1: Fix View Schema to Match Frontend
-- =============================================================================

-- v_integrity_score: Full schema matching frontend expectations
DROP VIEW IF EXISTS public.v_integrity_score;
CREATE OR REPLACE VIEW public.v_integrity_score
WITH (security_invoker = true) AS
WITH release_stats AS (
  SELECT
    count(*) FILTER (WHERE is_active = true) AS active_releases,
    count(*) FILTER (WHERE is_active = true AND signature_base64 IS NOT NULL) AS valid_active_releases,
    count(*) AS total_releases,
    count(*) FILTER (WHERE signature_base64 IS NOT NULL) AS signed_releases
  FROM public.agent_releases
  WHERE public.is_current_super_admin()
),
job_stats AS (
  SELECT
    count(*) AS total_jobs,
    count(*) FILTER (WHERE status = 'completed') AS completed_jobs,
    count(*) FILTER (WHERE status = 'completed' AND output IS NOT NULL) AS valid_completed_jobs,
    count(*) FILTER (WHERE status = 'failed') AS failed_jobs,
    count(*) FILTER (WHERE status = 'failed' AND error_message IS NOT NULL) AS failed_with_error
  FROM public.jobs
  WHERE created_at >= now() - interval '7 days'
    AND public.is_current_super_admin()
)
SELECT
  -- Supply chain integrity (are releases signed?)
  COALESCE(
    CASE WHEN rs.active_releases > 0 
    THEN round((rs.valid_active_releases::numeric / rs.active_releases::numeric) * 100, 1)
    ELSE 100 END,
    100
  ) AS supply_chain_score,
  
  -- Job integrity (did completed jobs produce results?)
  COALESCE(
    CASE WHEN js.completed_jobs > 0 
    THEN round((js.valid_completed_jobs::numeric / js.completed_jobs::numeric) * 100, 1)
    ELSE 100 END,
    100
  ) AS job_integrity_score,
  
  -- Failed jobs quality (did failures document errors?)
  COALESCE(
    CASE WHEN js.failed_jobs > 0 
    THEN round((js.failed_with_error::numeric / js.failed_jobs::numeric) * 100, 1)
    ELSE 100 END,
    100
  ) AS failed_jobs_score,
  
  -- Global integrity score (weighted average)
  COALESCE(
    round((
      (CASE WHEN rs.active_releases > 0 
       THEN (rs.valid_active_releases::numeric / rs.active_releases::numeric) 
       ELSE 1 END) * 0.4 +
      (CASE WHEN js.completed_jobs > 0 
       THEN (js.valid_completed_jobs::numeric / js.completed_jobs::numeric) 
       ELSE 1 END) * 0.4 +
      (CASE WHEN js.failed_jobs > 0 
       THEN (js.failed_with_error::numeric / js.failed_jobs::numeric) 
       ELSE 1 END) * 0.2
    ) * 100, 1),
    100
  ) AS global_integrity_score,
  
  -- Raw counts for detail view
  COALESCE(rs.active_releases, 0) AS active_releases,
  COALESCE(rs.valid_active_releases, 0) AS valid_active_releases,
  COALESCE(rs.total_releases, 0) AS total_releases,
  COALESCE(rs.signed_releases, 0) AS signed_releases,
  COALESCE(js.completed_jobs, 0) AS completed_jobs,
  COALESCE(js.valid_completed_jobs, 0) AS valid_completed_jobs,
  COALESCE(js.failed_jobs, 0) AS failed_jobs,
  COALESCE(js.failed_with_error, 0) AS failed_with_error,
  now() AS calculated_at
FROM release_stats rs
CROSS JOIN job_stats js;

COMMENT ON VIEW public.v_integrity_score IS 'System integrity metrics - super_admin only (ADR-024 Phase 9)';